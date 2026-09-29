// Sign-in page. The session lives in an HttpOnly cookie set by
// auth-service, so this script never stores the token itself.
const { api } = window.portal;
const $ = id => document.getElementById(id);
const message = $('auth-message');
const params = new URLSearchParams(location.search);

// Only follow same-site paths like "/docs", never "//evil.example".
function safeNext(value) {
  if (!value?.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
const nextPath = safeNext(params.get('next'));

function showMessage(text, kind) {
  window.portal.showMessage(message, text, kind);
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

function roleLabel(user) {
  if (user.isPrimaryAdmin) return 'Main admin';
  return user.role === 'admin' ? 'Admin' : 'User';
}

function showProfile(user) {
  $('p-title').textContent = user.username;
  $('p-username').textContent = user.username;
  $('p-email').textContent = user.email;
  $('p-role').textContent = roleLabel(user);
  $('p-docs').textContent = user.canViewDocs ? 'Allowed' : 'No access (ask an admin)';
  $('p-created').textContent = formatDate(user.createdAt);
  $('p-last').textContent = formatDate(user.lastLoginAt);
  $('go-docs').hidden = !user.canViewDocs;
  $('go-admin').hidden = user.role !== 'admin';
  $('auth-forms').hidden = true;
  $('profile').hidden = false;
}

function showForms() {
  $('profile').hidden = true;
  $('auth-forms').hidden = false;
}

async function loadProfile() {
  try {
    const user = await api('/me');
    if (params.get('denied') === 'docs' && !user.canViewDocs) {
      showMessage('Your account does not have access to the documentation yet. Ask an admin to allow it.', 'info');
    }
    showProfile(user);
  } catch {
    showForms();
    if (nextPath) showMessage('Sign in to continue.', 'info');
  }
}

async function submit(form, path) {
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  showMessage('Working…');
  try {
    await api(path, { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    // A full page load so the header's "Signed in as" chip picks up the
    // new session.
    location.href = nextPath || '/login';
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

$('logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
});

loadProfile();
