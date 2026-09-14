const express = require('express');
const app = express();
const PORT = process.env.PORT || 3012;

const startedAt = Date.now();

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'analytics-service' }));
app.get('/stats', (req, res) => {
  res.json({
    totalUsers: 2,
    totalOrders: 2,
    totalRevenue: 59.97,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

app.listen(PORT, () => console.log(`analytics-service listening on ${PORT}`));
