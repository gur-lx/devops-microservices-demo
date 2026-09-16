const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./openapi');

const app = express();
const PORT = process.env.PORT || 8080;

const SERVICES = {
  'user-service': { url: process.env.USER_SERVICE_URL || 'http://user-service:3001', apiPath: '/api/users', targetPath: '/users' },
  'product-service': { url: process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002', apiPath: '/api/products', targetPath: '/products' },
  'order-service': { url: process.env.ORDER_SERVICE_URL || 'http://order-service:3003', apiPath: '/api/orders', targetPath: '/orders' },
  'cart-service': { url: process.env.CART_SERVICE_URL || 'http://cart-service:3004', apiPath: '/api/cart', targetPath: '/cart' },
  'inventory-service': { url: process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3005', apiPath: '/api/inventory', targetPath: '/inventory' },
  'payment-service': { url: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3006', apiPath: '/api/payments', targetPath: '/payments' },
  'notification-service': { url: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007', apiPath: '/api/notifications', targetPath: '/notifications' },
  'review-service': { url: process.env.REVIEW_SERVICE_URL || 'http://review-service:3008', apiPath: '/api/reviews', targetPath: '/reviews' },
  'auth-service': { url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3009', apiPath: '/api/auth', targetPath: '' },
  'shipping-service': { url: process.env.SHIPPING_SERVICE_URL || 'http://shipping-service:3010', apiPath: '/api/shipments', targetPath: '/shipments' },
  'search-service': { url: process.env.SEARCH_SERVICE_URL || 'http://search-service:3011', apiPath: '/api/search', targetPath: '/search' },
  'analytics-service': { url: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3012', apiPath: '/api/stats', targetPath: '/stats' },
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

app.get('/version', (req, res) => res.json({
  version: process.env.BUILD_VERSION || 'dev',
  domain: process.env.BUILD_DOMAIN || null,
  serviceCount: Object.keys(SERVICES).length,
}));

app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Microservices Demo API Docs',
}));

// Mounted at app-level (not via app.use('/api/x', ...)) so Express does
// NOT strip the prefix from req.url before the proxy sees it — pathRewrite
// needs the full original path to rewrite it correctly.
// Health-check passthroughs (checked before the general routes below, since
// pathFilter matches by prefix and '/api/health/*' would otherwise never be reached).
Object.entries(SERVICES).forEach(([name, { url }]) => {
  app.use(createProxyMiddleware({
    pathFilter: `/api/health/${name}`,
    target: url,
    changeOrigin: true,
    pathRewrite: { [`^/api/health/${name}`]: '/health' },
  }));
});

Object.entries(SERVICES).forEach(([, { url, apiPath, targetPath }]) => {
  app.use(createProxyMiddleware({
    pathFilter: apiPath,
    target: url,
    changeOrigin: true,
    pathRewrite: { [`^${apiPath}`]: targetPath },
  }));
});

app.listen(PORT, () => console.log(`api-gateway listening on ${PORT}`));
