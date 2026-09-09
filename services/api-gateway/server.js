const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002';

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// Mounted at app-level (not via app.use('/api/users', ...)) so Express does
// NOT strip the prefix from req.url before the proxy sees it — pathRewrite
// needs the full original path to rewrite it correctly.
// Health-check passthroughs (checked before the general routes below, since
// pathFilter matches by prefix and '/api/health/*' would otherwise never be reached).
app.use(createProxyMiddleware({
  pathFilter: '/api/health/user-service',
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/health/user-service': '/health' },
}));

app.use(createProxyMiddleware({
  pathFilter: '/api/health/product-service',
  target: PRODUCT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/health/product-service': '/health' },
}));

app.use(createProxyMiddleware({
  pathFilter: '/api/users',
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/users': '/users' },
}));

app.use(createProxyMiddleware({
  pathFilter: '/api/products',
  target: PRODUCT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/products': '/products' },
}));

app.listen(PORT, () => console.log(`api-gateway listening on ${PORT}`));
