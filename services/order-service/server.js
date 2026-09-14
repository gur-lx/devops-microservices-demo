const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

const orders = [
  { id: 1, userId: 1, product: 'Keyboard', quantity: 1, status: 'shipped' },
  { id: 2, userId: 2, product: 'Mouse', quantity: 2, status: 'processing' },
];
let nextId = 3;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order-service' }));
app.get('/orders', (req, res) => res.json(orders));
app.get('/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json(order);
});
app.post('/orders', (req, res) => {
  const { userId, product, quantity } = req.body || {};
  if (!userId || !product || !quantity) {
    return res.status(400).json({ error: 'userId, product and quantity are required' });
  }
  const order = { id: nextId++, userId, product, quantity, status: 'processing' };
  orders.push(order);
  res.status(201).json(order);
});

app.listen(PORT, () => console.log(`order-service listening on ${PORT}`));
