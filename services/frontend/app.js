const HEALTH_ENDPOINTS = {
  'frontend': '/',
  'api-gateway': '/gateway-health',
  'user-service': '/api/health/user-service',
  'product-service': '/api/health/product-service',
};

async function checkHealth(service, path) {
  const card = document.querySelector(`.health-card[data-service="${service}"]`);
  const dot = card.querySelector('.dot');
  const latencyEl = card.querySelector('.latency');
  const statusEl = card.querySelector('.status-text');

  const started = performance.now();
  try {
    const res = await fetch(path, { cache: 'no-store' });
    const elapsed = Math.round(performance.now() - started);
    if (!res.ok) throw new Error('bad status');
    dot.className = 'dot dot-ok';
    card.classList.add('is-ok');
    card.classList.remove('is-down');
    latencyEl.textContent = `${elapsed}ms`;
    statusEl.textContent = 'healthy';
  } catch (err) {
    dot.className = 'dot dot-down';
    card.classList.add('is-down');
    card.classList.remove('is-ok');
    latencyEl.textContent = '—';
    statusEl.textContent = 'unreachable';
  }
}

function pollHealth() {
  Object.entries(HEALTH_ENDPOINTS).forEach(([service, path]) => checkHealth(service, path));
}

async function loadUsers() {
  const body = document.getElementById('users-body');
  const count = document.getElementById('users-count');
  try {
    const res = await fetch('/api/users', { cache: 'no-store' });
    const users = await res.json();
    count.textContent = users.length;
    body.innerHTML = users.map(u => `<tr><td>${u.id}</td><td>${u.name}</td></tr>`).join('');
  } catch (err) {
    body.innerHTML = '<tr><td colspan="2" class="empty-row">could not reach user-service</td></tr>';
  }
}

async function loadProducts() {
  const body = document.getElementById('products-body');
  const count = document.getElementById('products-count');
  try {
    const res = await fetch('/api/products', { cache: 'no-store' });
    const products = await res.json();
    count.textContent = products.length;
    body.innerHTML = products.map(p => `<tr><td>${p.id}</td><td>${p.name}</td><td>$${p.price.toFixed(2)}</td></tr>`).join('');
  } catch (err) {
    body.innerHTML = '<tr><td colspan="3" class="empty-row">could not reach product-service</td></tr>';
  }
}

pollHealth();
loadUsers();
loadProducts();
setInterval(pollHealth, 8000);
