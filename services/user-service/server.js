const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
let nextId = 3;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'user-service' }));
app.get('/users', (req, res) => res.json(users));
app.get('/users/:id', (req, res) => {
  const user = users.find(u => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});
app.post('/users', (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const user = { id: nextId++, name };
  users.push(user);
  res.status(201).json(user);
});

app.listen(PORT, () => console.log(`user-service listening on ${PORT}`));
