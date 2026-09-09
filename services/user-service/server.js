const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'user-service' }));
app.get('/users', (req, res) => res.json(users));
app.get('/users/:id', (req, res) => {
  const user = users.find(u => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});

app.listen(PORT, () => console.log(`user-service listening on ${PORT}`));
