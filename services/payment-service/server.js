const express = require('express');
const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

const payments = [
  { id: 1, orderId: 1, amount: 29.99, status: 'paid' },
  { id: 2, orderId: 2, amount: 29.98, status: 'pending' },
];
let nextId = 3;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment-service' }));
app.get('/payments', (req, res) => res.json(payments));
app.get('/payments/:id', (req, res) => {
  const payment = payments.find(p => p.id === Number(req.params.id));
  if (!payment) return res.status(404).json({ error: 'not found' });
  res.json(payment);
});
app.post('/payments', (req, res) => {
  const { orderId, amount } = req.body || {};
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'orderId and amount are required' });
  }
  const payment = { id: nextId++, orderId, amount, status: 'paid' };
  payments.push(payment);
  res.status(201).json(payment);
});

app.listen(PORT, () => console.log(`payment-service listening on ${PORT}`));
