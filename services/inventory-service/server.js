const express = require('express');
const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

const inventory = [
  { id: 1, product: 'Keyboard', stock: 120 },
  { id: 2, product: 'Mouse', stock: 85 },
];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory-service' }));
app.get('/inventory', (req, res) => res.json(inventory));
app.get('/inventory/:id', (req, res) => {
  const item = inventory.find(i => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.listen(PORT, () => console.log(`inventory-service listening on ${PORT}`));
