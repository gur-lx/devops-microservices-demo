const express = require('express');
const app = express();
const PORT = process.env.PORT || 3007;

app.use(express.json());

const notifications = [
  { id: 1, userId: 1, message: 'Your order has shipped' },
  { id: 2, userId: 2, message: 'Welcome to the platform' },
];
let nextId = 3;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));
app.get('/notifications', (req, res) => res.json(notifications));
app.post('/notifications', (req, res) => {
  const { userId, message } = req.body || {};
  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message are required' });
  }
  const notification = { id: nextId++, userId, message };
  notifications.push(notification);
  res.status(201).json(notification);
});

app.listen(PORT, () => console.log(`notification-service listening on ${PORT}`));
