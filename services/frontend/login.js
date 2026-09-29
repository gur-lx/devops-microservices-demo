const TOKEN_KEY = 'auth-token';

const $ = id => document.getElementById(id);
const message = $('auth-message');

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the user stays signed in only until the page reloads.
  }
}

function showMessage(text, kind) {
  message.textContent = text;
  message.className = `auth-message ${kind ? `is-${kind}` : ''}`;
}

function showTab(name) {
  const isLogin = name === 'login';
  $('login-form').hidden = !isLogin;
  $('register-form').hidden = isLogin;
  $('tab-login').classList.toggle('is-active', isLogin);
  $('tab-register').classList.toggle('is-active', !isLogin);
  $('tab-login').setAttribute('aria-selected', String(isLogin));
  $('tab-register').setAttribute('aria-selected', String(!isLogin));
  showMessage('');
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function showProfile(user) {
  $('p-username').textContent = user.username;
  $('p-email').textContent = user.email;
  $('p-created').textContent = formatDate(user.createdAt);
  $('p-last').textContent = formatDate(user.lastLoginAt);
  $('auth-forms').hidden = true;
  $('profile').hidden = false;
}

function showForms() {
  $('profile').hidden = true;
  $('auth-forms').hidden = false;
}

async function api(path, options = {}) {
  const res = await fetch(`/api/auth${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

async function loadProfile() {
  const token = getToken();
  if (!token) return showForms();
  try {
    showProfile(await api('/me', { headers: { Authorization: `Bearer ${token}` } }));
  } catch {
    setToken(null);
    showForms();
  }
}

async function submit(form, path) {
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  showMessage('Working…');
  try {
    const result = await api(path, { method: 'POST', body: JSON.stringify(data) });
    setToken(result.token);
    form.reset();
    showMessage('');
    showProfile(result.user);
  } catch (err) {
    showMessage(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

$('tab-login').addEventListener('click', () => showTab('login'));
$('tab-register').addEventListener('click', () => showTab('register'));

$('login-form').addEventListener('submit', e => {
  e.preventDefault();
  submit(e.target, '/login');
});

$('register-form').addEventListener('submit', e => {
  e.preventDefault();
  submit(e.target, '/register');
});

$('logout').addEventListener('click', () => {
  setToken(null);
  showForms();
  showTab('login');
  showMessage('Signed out.', 'ok');
});

loadProfile();
