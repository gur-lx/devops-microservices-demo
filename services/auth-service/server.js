const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3009;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.TOKEN_TTL || '8h';

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
      console.log('database ready');
      return;
    } catch (err) {
      if (attempt >= 30) throw err;
      console.log(`waiting for database (${attempt}/30): ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email, createdAt: row.created_at, lastLoginAt: row.last_login_at };
}

function signToken(row) {
  return jwt.sign({ sub: row.id, username: row.username }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: TOKEN_TTL });
}

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'missing token' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
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
  if (!isValidEmail(email)) return res.status(400).json({ error: 'a valid email is required' });
  if (password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hash],
    );
    res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
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
    const updated = await pool.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING *',
      [user.id],
    );
    res.json({ token: signToken(updated.rows[0]), username: user.username, user: publicUser(updated.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login failed' });
  }
});

app.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.auth.sub]);
  if (!rows[0]) return res.status(404).json({ error: 'user not found' });
  res.json(publicUser(rows[0]));
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`auth-service listening on ${PORT}`)))
  .catch(err => {
    console.error('could not initialise database:', err.message);
    process.exit(1);
  });
