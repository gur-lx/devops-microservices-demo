const express = require('express');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

const cart = [
  { id: 1, userId: 1, product: 'Keyboard', quantity: 1 },
  { id: 2, userId: 2, product: 'Mouse', quantity: 1 },
];
let nextId = 3;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'cart-service' }));
app.get('/cart', (req, res) => res.json(cart));
app.get('/cart/:id', (req, res) => {
  const item = cart.find(c => c.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});
app.post('/cart', (req, res) => {
  const { userId, product, quantity } = req.body || {};
  if (!userId || !product || !quantity) {
    return res.status(400).json({ error: 'userId, product and quantity are required' });
  }
  const item = { id: nextId++, userId, product, quantity };
  cart.push(item);
  res.status(201).json(item);
});

app.listen(PORT, () => console.log(`cart-service listening on ${PORT}`));
