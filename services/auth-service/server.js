const express = require('express');
const app = express();
const PORT = process.env.PORT || 3009;

app.use(express.json());

const accounts = [
  { username: 'alice', password: 'password1' },
  { username: 'bob', password: 'password2' },
];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const account = accounts.find(a => a.username === username && a.password === password);
  if (!account) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ token: `mock-token-${username}-${Date.now()}`, username });
});

app.listen(PORT, () => console.log(`auth-service listening on ${PORT}`));
