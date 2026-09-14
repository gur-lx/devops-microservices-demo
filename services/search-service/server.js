const express = require('express');
const app = express();
const PORT = process.env.PORT || 3011;

const catalog = ['Keyboard', 'Mouse', 'Monitor', 'Webcam', 'Headset', 'Docking Station'];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'search-service' }));
app.get('/search', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase();
  const results = q ? catalog.filter(item => item.toLowerCase().includes(q)) : catalog;
  res.json({ query: q, results });
});

app.listen(PORT, () => console.log(`search-service listening on ${PORT}`));
