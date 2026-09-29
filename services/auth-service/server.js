const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3009;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 8 * 60 * 60);
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const COOKIE_NAME = 'session';

// The main admin account. Its password is set from ADMIN_PASSWORD on every
// start, it can't be registered through the public form, and no other
// admin can change or delete it.
const PRIMARY_ADMIN = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@localhost.localdomain').toLowerCase();

if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set');
  process.exit(1);
}

// Connection settings come from the standard PG* env vars
// (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
const pool = new Pool();

app.use(express.json());

const USERNAME_RE = /^[\w.-]{3,32}$/;
const JWT_ALGORITHM = 'HS256';
const ROLES = new Set(['user', 'admin']);

// Plain string checks instead of a regex, so long input can't cause
// catastrophic backtracking.
function isValidEmail(email) {
  if (email.length > 255 || /\s/.test(email)) return false;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

async function initDb() {
  // Postgres may still be starting when this container comes up.
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id            SERIAL PRIMARY KEY,
          username      VARCHAR(32)  NOT NULL UNIQUE,
          email         VARCHAR(255) NOT NULL UNIQUE,
          password_hash TEXT         NOT NULL,
          created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
          last_login_at TIMESTAMPTZ
        )`);
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      console.log(`waiting for database (${attempt}/30): ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Columns added for roles and access management.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user'");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_docs BOOLEAN NOT NULL DEFAULT false');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true');

  if (ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const { rowCount } = await pool.query(
      "UPDATE users SET password_hash = $2, role = 'admin', can_view_docs = true, is_active = true WHERE username = $1",
      [PRIMARY_ADMIN, hash],
    );
    if (rowCount === 0) {
      await pool.query(
        "INSERT INTO users (username, email, password_hash, role, can_view_docs) VALUES ($1, $2, $3, 'admin', true)",
        [PRIMARY_ADMIN, ADMIN_EMAIL, hash],
      );
    }
    console.log(`main admin "${PRIMARY_ADMIN}" is ready`);
  } else {
    console.warn('ADMIN_PASSWORD is not set, so the main admin account was not created or updated');
  }
  console.log('database ready');
}

function publicUser(row) {
  const isAdmin = row.role === 'admin';
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    isPrimaryAdmin: row.username === PRIMARY_ADMIN,
    canViewDocs: isAdmin || row.can_view_docs,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function signToken(row) {
  return jwt.sign({ sub: row.id }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: TOKEN_TTL_SECONDS });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function tokenFrom(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && token) return token;
  return readCookie(req, COOKIE_NAME);
}

// Loads the current user from the database on every request, so role and
// access changes (or a disabled account) take effect immediately.
async function currentUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch {
    return null;
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  return user?.is_active ? user : null;
}

function requireAuth(req, res, next) {
  currentUser(req)
    .then(user => {
      if (!user) return res.status(401).json({ error: 'not signed in' });
      req.user = user;
      next();
    })
    .catch(next);
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'admins only' });
    next();
  });
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'auth-service', db: 'up' });
  } catch {
    res.status(503).json({ status: 'error', service: 'auth-service', db: 'down' });
  }
});

app.post('/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'username must be 3-32 letters, digits, _ . or -' });
  if (username.toLowerCase() === PRIMARY_ADMIN) return res.status(400).json({ error: 'that username is reserved' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'a valid email is required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hash],
    );
    const token = signToken(rows[0]);
    setSessionCookie(res, token);
    res.status(201).json({ token, user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username or email already registered' });
    console.error(err);
    res.status(500).json({ error: 'could not create account' });
  }
});

app.post('/login', async (req, res) => {
  const login = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!login || !password) return res.status(400).json({ error: 'username and password are required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = lower($1)',
      [login],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    if (!user.is_active) return res.status(403).json({ error: 'this account has been disabled by an admin' });
    const updated = await pool.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING *',
      [user.id],
    );
    const token = signToken(updated.rows[0]);
    setSessionCookie(res, token);
    res.json({ token, username: user.username, user: publicUser(updated.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login failed' });
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/' });
  res.status(204).end();
});

app.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

// Used by nginx (auth_request) to protect pages: 204 = allowed,
// 401 = not signed in, 403 = signed in but not allowed.
function canAccess(user, area) {
  if (area === 'admin') return user.role === 'admin';
  if (area === 'docs') return publicUser(user).canViewDocs;
  return false;
}

app.get('/authorize/:area', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).end();
    res.status(canAccess(user, req.params.area) ? 204 : 403).end();
  } catch (err) {
    next(err);
  }
});

app.get('/admin/users', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
  res.json(rows.map(publicUser));
});

// Returns an error message if the acting admin may not change the target
// user, or null if the change is allowed.
function permissionError(actor, target, changes) {
  if (target.username === PRIMARY_ADMIN) return 'the main admin account cannot be changed';
  if (actor.id === target.id) return 'you cannot change your own account here';
  const actorIsPrimary = actor.username === PRIMARY_ADMIN;
  if (!actorIsPrimary && target.role === 'admin') return 'only the main admin can change other admins';
  if (!actorIsPrimary && changes.role !== undefined) return 'only the main admin can grant or remove admin rights';
  return null;
}

async function loadTarget(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid user id' });
    return null;
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) res.status(404).json({ error: 'user not found' });
  return rows[0] || null;
}

function validateChanges({ role, canViewDocs, isActive }) {
  if (role !== undefined && !ROLES.has(role)) return 'role must be user or admin';
  if (canViewDocs !== undefined && typeof canViewDocs !== 'boolean') return 'canViewDocs must be true or false';
  if (isActive !== undefined && typeof isActive !== 'boolean') return 'isActive must be true or false';
  return null;
}

app.patch('/admin/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;

    const changes = req.body || {};
    const invalid = validateChanges(changes);
    if (invalid) return res.status(400).json({ error: invalid });

    const denied = permissionError(req.user, target, changes);
    if (denied) return res.status(403).json({ error: denied });

    const { rows } = await pool.query(
      `UPDATE users SET
         role          = COALESCE($2, role),
         can_view_docs = COALESCE($3, can_view_docs),
         is_active     = COALESCE($4, is_active)
       WHERE id = $1 RETURNING *`,
      [target.id, changes.role ?? null, changes.canViewDocs ?? null, changes.isActive ?? null],
    );
    res.json(publicUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

app.delete('/admin/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    const denied = permissionError(req.user, target, {});
    if (denied) return res.status(403).json({ error: denied });
    await pool.query('DELETE FROM users WHERE id = $1', [target.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal error' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`auth-service listening on ${PORT}`)))
  .catch(err => {
    console.error('could not initialise database:', err.message);
    process.exit(1);
  });
