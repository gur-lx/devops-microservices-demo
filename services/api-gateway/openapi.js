// Hand-written OpenAPI 3.0 spec describing every route the gateway proxies
// through to the backend microservices. Served via swagger-ui-express at
// /api-docs (see server.js) so the whole demo API surface is browsable and
// callable from one place, without needing per-service Swagger instances.

const idParam = (name, example) => ({
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', example },
  description: `${name} id`,
});

const listResponse = (ref) => ({
  description: 'OK',
  content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } } } },
});

const itemResponse = (ref) => ({
  description: 'OK',
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const notFound = { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const badRequest = { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

const healthPath = (service) => ({
  get: {
    tags: ['health'],
    summary: `Health check for ${service}`,
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } } } },
  },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Microservices Demo API',
    version: '1.0.0',
    description:
      'Combined API surface for the devops-microservices-demo project. Every route below is proxied by the API Gateway to the matching backend microservice — try any GET request with "Try it out".',
  },
  servers: [{ url: '/', description: 'Via the API Gateway (or the frontend at :8090)' }],
  tags: [
    { name: 'health', description: 'Per-service health checks' },
    { name: 'users' }, { name: 'products' }, { name: 'orders' }, { name: 'cart' },
    { name: 'inventory' }, { name: 'payments' }, { name: 'notifications' }, { name: 'reviews' },
    { name: 'auth' }, { name: 'shipping' }, { name: 'search' }, { name: 'analytics' },
  ],
  paths: {
    '/api/health/user-service': healthPath('user-service'),
    '/api/health/product-service': healthPath('product-service'),
    '/api/health/order-service': healthPath('order-service'),
    '/api/health/cart-service': healthPath('cart-service'),
    '/api/health/inventory-service': healthPath('inventory-service'),
    '/api/health/payment-service': healthPath('payment-service'),
    '/api/health/notification-service': healthPath('notification-service'),
    '/api/health/review-service': healthPath('review-service'),
    '/api/health/auth-service': healthPath('auth-service'),
    '/api/health/shipping-service': healthPath('shipping-service'),
    '/api/health/search-service': healthPath('search-service'),
    '/api/health/analytics-service': healthPath('analytics-service'),

    '/api/users': {
      get: { tags: ['users'], summary: 'List users', responses: { 200: listResponse('User') } },
      post: {
        tags: ['users'], summary: 'Create a user',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewUser' } } } },
        responses: { 201: itemResponse('User'), 400: badRequest },
      },
    },
    '/api/users/{id}': {
      get: { tags: ['users'], summary: 'Get a user by id', parameters: [idParam('user', 1)], responses: { 200: itemResponse('User'), 404: notFound } },
    },

    '/api/products': {
      get: { tags: ['products'], summary: 'List products', responses: { 200: listResponse('Product') } },
    },
    '/api/products/{id}': {
      get: { tags: ['products'], summary: 'Get a product by id', parameters: [idParam('product', 1)], responses: { 200: itemResponse('Product'), 404: notFound } },
    },

    '/api/orders': {
      get: { tags: ['orders'], summary: 'List orders', responses: { 200: listResponse('Order') } },
      post: {
        tags: ['orders'], summary: 'Create an order',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewOrder' } } } },
        responses: { 201: itemResponse('Order'), 400: badRequest },
      },
    },
    '/api/orders/{id}': {
      get: { tags: ['orders'], summary: 'Get an order by id', parameters: [idParam('order', 1)], responses: { 200: itemResponse('Order'), 404: notFound } },
    },

    '/api/cart': {
      get: { tags: ['cart'], summary: 'List cart items', responses: { 200: listResponse('CartItem') } },
      post: {
        tags: ['cart'], summary: 'Add an item to the cart',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewCartItem' } } } },
        responses: { 201: itemResponse('CartItem'), 400: badRequest },
      },
    },
    '/api/cart/{id}': {
      get: { tags: ['cart'], summary: 'Get a cart item by id', parameters: [idParam('cart item', 1)], responses: { 200: itemResponse('CartItem'), 404: notFound } },
    },

    '/api/inventory': {
      get: { tags: ['inventory'], summary: 'List inventory stock levels', responses: { 200: listResponse('InventoryItem') } },
    },
    '/api/inventory/{id}': {
      get: { tags: ['inventory'], summary: 'Get an inventory item by id', parameters: [idParam('inventory item', 1)], responses: { 200: itemResponse('InventoryItem'), 404: notFound } },
    },

    '/api/payments': {
      get: { tags: ['payments'], summary: 'List payments', responses: { 200: listResponse('Payment') } },
      post: {
        tags: ['payments'], summary: 'Record a payment',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPayment' } } } },
        responses: { 201: itemResponse('Payment'), 400: badRequest },
      },
    },
    '/api/payments/{id}': {
      get: { tags: ['payments'], summary: 'Get a payment by id', parameters: [idParam('payment', 1)], responses: { 200: itemResponse('Payment'), 404: notFound } },
    },

    '/api/notifications': {
      get: { tags: ['notifications'], summary: 'List notifications', responses: { 200: listResponse('Notification') } },
      post: {
        tags: ['notifications'], summary: 'Send a notification',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewNotification' } } } },
        responses: { 201: itemResponse('Notification'), 400: badRequest },
      },
    },

    '/api/reviews': {
      get: { tags: ['reviews'], summary: 'List product reviews', responses: { 200: listResponse('Review') } },
      post: {
        tags: ['reviews'], summary: 'Submit a review',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewReview' } } } },
        responses: { 201: itemResponse('Review'), 400: badRequest },
      },
    },

    '/api/auth/login': {
      post: {
        tags: ['auth'], summary: 'Log in and receive a mock token',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/api/shipments': {
      get: { tags: ['shipping'], summary: 'List shipments', responses: { 200: listResponse('Shipment') } },
    },
    '/api/shipments/{id}': {
      get: { tags: ['shipping'], summary: 'Get a shipment by id', parameters: [idParam('shipment', 1)], responses: { 200: itemResponse('Shipment'), 404: notFound } },
    },

    '/api/search': {
      get: {
        tags: ['search'], summary: 'Search the product catalog',
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string', example: 'mouse' }, description: 'search term' }],
        responses: { 200: itemResponse('SearchResult') },
      },
    },

    '/api/stats': {
      get: { tags: ['analytics'], summary: 'Get platform-wide stats', responses: { 200: itemResponse('Stats') } },
    },
  },
  components: {
    schemas: {
      Health: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, service: { type: 'string' } } },
      Error: { type: 'object', properties: { error: { type: 'string' } } },

      User: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
      NewUser: { type: 'object', required: ['name'], properties: { name: { type: 'string', example: 'Charlie' } } },

      Product: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, price: { type: 'number' } } },

      Order: {
        type: 'object',
        properties: { id: { type: 'integer' }, userId: { type: 'integer' }, product: { type: 'string' }, quantity: { type: 'integer' }, status: { type: 'string' } },
      },
      NewOrder: {
        type: 'object', required: ['userId', 'product', 'quantity'],
        properties: { userId: { type: 'integer', example: 1 }, product: { type: 'string', example: 'Keyboard' }, quantity: { type: 'integer', example: 1 } },
      },

      CartItem: { type: 'object', properties: { id: { type: 'integer' }, userId: { type: 'integer' }, product: { type: 'string' }, quantity: { type: 'integer' } } },
      NewCartItem: {
        type: 'object', required: ['userId', 'product', 'quantity'],
        properties: { userId: { type: 'integer', example: 1 }, product: { type: 'string', example: 'Mouse' }, quantity: { type: 'integer', example: 1 } },
      },

      InventoryItem: { type: 'object', properties: { id: { type: 'integer' }, product: { type: 'string' }, stock: { type: 'integer' } } },

      Payment: { type: 'object', properties: { id: { type: 'integer' }, orderId: { type: 'integer' }, amount: { type: 'number' }, status: { type: 'string' } } },
      NewPayment: { type: 'object', required: ['orderId', 'amount'], properties: { orderId: { type: 'integer', example: 1 }, amount: { type: 'number', example: 29.99 } } },

      Notification: { type: 'object', properties: { id: { type: 'integer' }, userId: { type: 'integer' }, message: { type: 'string' } } },
      NewNotification: { type: 'object', required: ['userId', 'message'], properties: { userId: { type: 'integer', example: 1 }, message: { type: 'string', example: 'Your order shipped' } } },

      Review: { type: 'object', properties: { id: { type: 'integer' }, productId: { type: 'integer' }, rating: { type: 'integer' }, comment: { type: 'string' } } },
      NewReview: {
        type: 'object', required: ['productId', 'rating'],
        properties: { productId: { type: 'integer', example: 1 }, rating: { type: 'integer', example: 5 }, comment: { type: 'string', example: 'Great keyboard' } },
      },

      LoginRequest: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string', example: 'alice' }, password: { type: 'string', example: 'password1' } } },
      LoginResponse: { type: 'object', properties: { token: { type: 'string' }, username: { type: 'string' } } },

      Shipment: { type: 'object', properties: { id: { type: 'integer' }, orderId: { type: 'integer' }, carrier: { type: 'string' }, status: { type: 'string' } } },

      SearchResult: { type: 'object', properties: { query: { type: 'string' }, results: { type: 'array', items: { type: 'string' } } } },

      Stats: {
        type: 'object',
        properties: { totalUsers: { type: 'integer' }, totalOrders: { type: 'integer' }, totalRevenue: { type: 'number' }, uptimeSeconds: { type: 'integer' } },
      },
    },
  },
};
