const HEALTH_ENDPOINTS = {
  'frontend': '/',
  'api-gateway': '/gateway-health',
  'user-service': '/api/health/user-service',
  'product-service': '/api/health/product-service',
  'order-service': '/api/health/order-service',
  'cart-service': '/api/health/cart-service',
  'inventory-service': '/api/health/inventory-service',
  'payment-service': '/api/health/payment-service',
  'notification-service': '/api/health/notification-service',
  'review-service': '/api/health/review-service',
  'auth-service': '/api/health/auth-service',
  'shipping-service': '/api/health/shipping-service',
  'search-service': '/api/health/search-service',
  'analytics-service': '/api/health/analytics-service',
};

function setTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.setAttribute('aria-pressed', String(isLight));
  toggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  toggle.querySelector('.theme-toggle-icon').textContent = isLight ? '☾' : '☀';
  toggle.querySelector('.theme-toggle-label').textContent = isLight ? 'Dark mode' : 'Light mode';
}

const savedTheme = localStorage.getItem('dashboard-theme');
setTheme(savedTheme === 'light' ? 'light' : 'dark');
document.getElementById('theme-toggle').addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('dashboard-theme', nextTheme);
  setTheme(nextTheme);
});

function buildHealthGrid() {
  const grid = document.getElementById('health-grid');
  grid.innerHTML = Object.keys(HEALTH_ENDPOINTS).map(service => `
    <div class="health-card" data-service="${service}">
      <div class="health-top">
        <span class="dot dot-pending"></span>
        <span class="health-name">${service}</span>
      </div>
      <div class="health-meta">
        <span class="latency">&mdash;</span>
        <span class="status-text">checking&hellip;</span>
      </div>
    </div>
  `).join('');
}

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

async function loadOrders() {
  const body = document.getElementById('orders-body');
  const count = document.getElementById('orders-count');
  try {
    const res = await fetch('/api/orders', { cache: 'no-store' });
    const orders = await res.json();
    count.textContent = orders.length;
    body.innerHTML = orders.map(o => `<tr><td>${o.id}</td><td>${o.product}</td><td>${o.quantity}</td><td>${o.status}</td></tr>`).join('');
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4" class="empty-row">could not reach order-service</td></tr>';
  }
}

async function loadInventory() {
  const body = document.getElementById('inventory-body');
  const count = document.getElementById('inventory-count');
  try {
    const res = await fetch('/api/inventory', { cache: 'no-store' });
    const inventory = await res.json();
    count.textContent = inventory.length;
    body.innerHTML = inventory.map(i => `<tr><td>${i.id}</td><td>${i.product}</td><td>${i.stock}</td></tr>`).join('');
  } catch (err) {
    body.innerHTML = '<tr><td colspan="3" class="empty-row">could not reach inventory-service</td></tr>';
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    const stats = await res.json();
    document.getElementById('stat-users').textContent = stats.totalUsers;
    document.getElementById('stat-orders').textContent = stats.totalOrders;
    document.getElementById('stat-revenue').textContent = `$${stats.totalRevenue.toFixed(2)}`;
    document.getElementById('stat-uptime').textContent = `${stats.uptimeSeconds}s`;
  } catch (err) {
    ['stat-users', 'stat-orders', 'stat-revenue', 'stat-uptime'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
  }
}

// ---- API Console: fires a real request and animates it hop by hop ----

const HOP_DELAY_MS = 220;

const flowNodes = {
  browser: document.querySelector('.flow-node[data-node="browser"]'),
  frontend: document.querySelector('.flow-node[data-node="frontend"]'),
  gateway: document.querySelector('.flow-node[data-node="gateway"]'),
  target: document.querySelector('.flow-node[data-node="target"]'),
};
const flowArrows = {
  'browser-frontend': document.querySelector('.flow-arrow[data-arrow="browser-frontend"]'),
  'frontend-gateway': document.querySelector('.flow-arrow[data-arrow="frontend-gateway"]'),
  'gateway-target': document.querySelector('.flow-arrow[data-arrow="gateway-target"]'),
};
const flowTargetLabel = document.getElementById('flow-target-label');
const flowTargetSub = document.getElementById('flow-target-sub');
const consoleLog = document.getElementById('console-log');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clearFlowClasses() {
  Object.values(flowNodes).forEach(n => n.classList.remove('hop-active', 'hop-response', 'hop-error'));
  Object.values(flowArrows).forEach(a => a.classList.remove('hop-active', 'hop-response', 'hop-error'));
}

function log(text, cls) {
  const line = document.createElement('div');
  line.className = `log-line ${cls || ''}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${text}`;
  consoleLog.appendChild(line);
  while (consoleLog.children.length > 40) {
    consoleLog.removeChild(consoleLog.firstChild);
  }
}

async function animateForward(skipGatewayHop) {
  clearFlowClasses();
  flowNodes.browser.classList.add('hop-active');
  await sleep(HOP_DELAY_MS);

  flowNodes.browser.classList.remove('hop-active');
  flowArrows['browser-frontend'].classList.add('hop-active');
  flowNodes.frontend.classList.add('hop-active');
  await sleep(HOP_DELAY_MS);

  if (skipGatewayHop) {
    flowArrows['frontend-gateway'].classList.add('hop-active');
    flowNodes.gateway.classList.add('hop-active');
    return;
  }

  flowArrows['frontend-gateway'].classList.add('hop-active');
  flowNodes.gateway.classList.add('hop-active');
  await sleep(HOP_DELAY_MS);

  flowArrows['gateway-target'].classList.add('hop-active');
  flowNodes.target.classList.add('hop-active');
}

async function animateReturn(ok, skipGatewayHop) {
  const cls = ok ? 'hop-response' : 'hop-error';
  clearFlowClasses();
  flowNodes.target.classList.add(cls);
  flowArrows['gateway-target'].classList.add(cls);
  await sleep(HOP_DELAY_MS);

  if (!skipGatewayHop) {
    flowNodes.gateway.classList.add(cls);
    flowArrows['frontend-gateway'].classList.add(cls);
    await sleep(HOP_DELAY_MS);
  }

  flowNodes.frontend.classList.add(cls);
  flowArrows['browser-frontend'].classList.add(cls);
  await sleep(HOP_DELAY_MS);

  flowNodes.browser.classList.add(cls);
  await sleep(HOP_DELAY_MS);
  clearFlowClasses();
}

let requestInFlight = false;

async function sendApiRequest({ method, path, target, targetPort, skipGatewayHop, body }) {
  if (requestInFlight) return;
  requestInFlight = true;
  document.querySelectorAll('.api-btn').forEach(b => (b.disabled = true));

  flowTargetLabel.textContent = target;
  flowTargetSub.textContent = targetPort || '';

  log(`→ dispatching ${method} ${path}`, 'log-req');
  const started = performance.now();

  const forward = animateForward(skipGatewayHop);

  let ok = false;
  let statusText = '';
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const elapsed = Math.round(performance.now() - started);
    await forward;
    ok = res.ok;
    statusText = `${res.status} ${res.statusText}`;
    const data = await res.json().catch(() => null);

    if (ok) {
      log(`← ${target} responded ${statusText} (${elapsed}ms)`, 'log-ok');
      if (Array.isArray(data)) {
        log(`  payload: ${data.length} record(s)`, 'log-dim');
      } else if (data && typeof data === 'object') {
        log(`  payload: ${JSON.stringify(data)}`, 'log-dim');
      }
    } else {
      log(`← ${target} responded ${statusText} (${elapsed}ms)`, 'log-err');
    }
    await animateReturn(ok, skipGatewayHop);
  } catch (err) {
    await forward;
    log(`✕ request failed — ${target} unreachable`, 'log-err');
    await animateReturn(false, skipGatewayHop);
  }

  requestInFlight = false;
  document.querySelectorAll('.api-btn').forEach(b => (b.disabled = false));

  loadUsers();
  loadProducts();
  loadOrders();
  loadInventory();
  loadStats();
}

document.querySelectorAll('.api-btn[data-path]').forEach(btn => {
  btn.addEventListener('click', () => {
    sendApiRequest({
      method: btn.dataset.method,
      path: btn.dataset.path,
      target: btn.dataset.target,
      targetPort: btn.dataset.targetPort,
      skipGatewayHop: btn.dataset.skipGatewayHop === 'true',
    });
  });
});

document.getElementById('add-user-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('new-user-name');
  const name = input.value.trim();
  if (!name) return;
  sendApiRequest({
    method: 'POST',
    path: '/api/users',
    target: 'user-service',
    targetPort: ':3001',
    body: { name },
  });
  input.value = '';
});

document.getElementById('add-order-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('new-order-product');
  const product = input.value.trim();
  if (!product) return;
  sendApiRequest({
    method: 'POST',
    path: '/api/orders',
    target: 'order-service',
    targetPort: ':3003',
    body: { userId: 1, product, quantity: 1 },
  });
  input.value = '';
});

async function loadDeployInfo() {
  try {
    const res = await fetch('/version', { cache: 'no-store' });
    const data = await res.json();
    document.getElementById('deploy-build').textContent = `#${data.version}`;
    document.getElementById('deploy-domain').textContent = data.domain || 'localhost';
    document.getElementById('deploy-services').textContent = data.serviceCount;
  } catch (err) {
    document.getElementById('deploy-build').textContent = 'unreachable';
  }
}

buildHealthGrid();
pollHealth();
loadUsers();
loadProducts();
loadOrders();
loadInventory();
loadStats();
loadDeployInfo();
setInterval(pollHealth, 8000);
setInterval(loadStats, 8000);
setInterval(loadDeployInfo, 30000);
