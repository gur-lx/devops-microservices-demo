// Access management page. Every rule is enforced by auth-service; this
// page only hides controls the signed-in admin can't use.
const rows = document.getElementById('user-rows');
const message = document.getElementById('admin-message');
let me = null;
let pendingDelete = null;

function showMessage(text, kind) {
  message.textContent = text;
  message.className = kind ? 'auth-message is-' + kind : 'auth-message';
}

async function api(path, options = {}) {
  const res = await fetch(`/api/auth${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401) {
    location.href = '/login?next=/admin';
    throw new Error('not signed in');
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

// Mirrors the server's rules so locked rows show as read-only.
function lockReason(user) {
  if (user.isPrimaryAdmin) return 'Main admin, cannot be changed';
  if (user.id === me.id) return 'This is you';
  if (user.role === 'admin' && !me.isPrimaryAdmin) return 'Only the main admin can change admins';
  return null;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function tag(text, kind) {
  return el('span', { className: kind ? 'tag tag-' + kind : 'tag', text });
}

function roleCell(user, locked) {
  if (locked || !me.isPrimaryAdmin) {
    return tag(user.isPrimaryAdmin ? 'main admin' : user.role, user.role === 'admin' ? 'admin' : '');
  }
  const select = el('select', { 'aria-label': `Role for ${user.username}` }, [
    el('option', { value: 'user', text: 'User' }),
    el('option', { value: 'admin', text: 'Admin' }),
  ]);
  select.value = user.role;
  select.addEventListener('change', () => update(user, { role: select.value }));
  return select;
}

function switchCell(user, locked, field, label, checked, disabledNote) {
  const input = el('input', { type: 'checkbox', checked, disabled: locked || Boolean(disabledNote) });
  input.addEventListener('change', () => update(user, { [field]: input.checked }));
  return el('label', { className: 'switch', title: disabledNote || '' }, [input, label]);
}

function actionCell(user, locked) {
  if (locked) return el('span', { className: 'user-email', text: lockReason(user) });
  const armed = pendingDelete === user.id;
  const button = el('button', {
    type: 'button',
    className: 'api-btn btn-danger',
    text: armed ? 'Click again to delete' : 'Delete',
  });
  button.addEventListener('click', () => {
    if (pendingDelete === user.id) return remove(user);
    pendingDelete = user.id;
    render(lastUsers);
  });
  return button;
}

let lastUsers = [];

function render(users) {
  lastUsers = users;
  document.getElementById('user-count').textContent = `${users.length} users`;
  rows.replaceChildren(...users.map(user => {
    const locked = Boolean(lockReason(user));
    const isAdmin = user.role === 'admin';
    return el('tr', { className: locked ? 'row-locked' : '' }, [
      el('td', {}, [el('span', { className: 'user-name', text: user.username }), el('span', { className: 'user-email', text: user.email })]),
      el('td', {}, [roleCell(user, locked)]),
      el('td', {}, [switchCell(user, locked, 'canViewDocs', user.canViewDocs ? 'Allowed' : 'Blocked', user.canViewDocs,
        isAdmin ? 'Admins can always view the documentation' : '')]),
      el('td', {}, [switchCell(user, locked, 'isActive', user.isActive ? 'Active' : 'Disabled', user.isActive, '')]),
      el('td', { text: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never' }),
      el('td', {}, [actionCell(user, locked)]),
    ]);
  }));
}

async function load() {
  const users = await api('/admin/users');
  pendingDelete = null;
  render(users);
}

async function update(user, changes) {
  try {
    await api(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    showMessage(`Updated ${user.username}.`, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
  await load();
}

async function remove(user) {
  try {
    await api(`/admin/users/${user.id}`, { method: 'DELETE' });
    showMessage(`Deleted ${user.username}.`, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
  await load();
}

(async function start() {
  try {
    me = await api('/me');
    document.getElementById('admin-note').textContent = me.isPrimaryAdmin
      ? 'You are the main admin: you can make other users admins and manage everyone except yourself.'
      : 'You are an admin: you can manage regular users. Only the main admin can change admins.';
    await load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
}());
