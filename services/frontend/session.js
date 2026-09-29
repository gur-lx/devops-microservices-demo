// Shows who is signed in, in the header of every page that has a
// <div id="session-slot"></div>. Admins also get a link to /admin.
(function () {
  const slot = document.getElementById('session-slot');
  if (!slot) return;

  function link(href, icon, text) {
    const a = document.createElement('a');
    a.className = 'pipeline-chip pipeline-chip-link';
    a.href = href;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'section-icon';
    iconSpan.textContent = icon;
    a.append(iconSpan, ' ' + text);
    return a;
  }

  function signedOut() {
    slot.replaceChildren(link('/login', '\u{1F464}', 'Sign in'));
  }

  function signedIn(user) {
    const chip = document.createElement('span');
    chip.className = 'pipeline-chip session-chip';
    chip.title = user.email;
    const dot = document.createElement('span');
    dot.className = 'dot dot-ok';
    const name = document.createElement('strong');
    name.textContent = user.username;
    chip.append(dot, 'Signed in as ', name);
    if (user.role === 'admin') {
      const badge = document.createElement('span');
      badge.className = 'session-role';
      badge.textContent = user.isPrimaryAdmin ? 'main admin' : 'admin';
      chip.append(badge);
    }

    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'pipeline-chip session-signout';
    out.textContent = 'Sign out';
    out.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/login';
    });

    const items = [chip];
    if (user.role === 'admin') items.push(link('/admin', '\u{1F511}', 'Access management'));
    items.push(out);
    slot.replaceChildren(...items);
  }

  fetch('/api/auth/me')
    .then(res => (res.ok ? res.json() : null))
    .then(user => (user ? signedIn(user) : signedOut()))
    .catch(signedOut);
}());
