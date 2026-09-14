const express = require('express');
const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json());

const shipments = [
  { id: 1, orderId: 1, carrier: 'FedEx', status: 'in-transit' },
  { id: 2, orderId: 2, carrier: 'UPS', status: 'delivered' },
];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'shipping-service' }));
app.get('/shipments', (req, res) => res.json(shipments));
app.get('/shipments/:id', (req, res) => {
  const shipment = shipments.find(s => s.id === Number(req.params.id));
  if (!shipment) return res.status(404).json({ error: 'not found' });
  res.json(shipment);
});

app.listen(PORT, () => console.log(`shipping-service listening on ${PORT}`));
