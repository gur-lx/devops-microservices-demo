const express = require('express');
const app = express();
const PORT = process.env.PORT || 3002;

const products = [
  { id: 1, name: 'Keyboard', price: 29.99 },
  { id: 2, name: 'Mouse', price: 14.99 },
];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product-service' }));
app.get('/products', (req, res) => res.json(products));
app.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json(product);
});

app.listen(PORT, () => console.log(`product-service listening on ${PORT}`));
