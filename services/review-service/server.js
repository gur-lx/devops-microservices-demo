const express = require('express');
const app = express();
const PORT = process.env.PORT || 3008;

app.use(express.json());

const reviews = [
  { id: 1, productId: 1, rating: 5, comment: 'Great keyboard' },
  { id: 2, productId: 2, rating: 4, comment: 'Works well' },
];
let nextId = 3;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'review-service' }));
app.get('/reviews', (req, res) => res.json(reviews));
app.post('/reviews', (req, res) => {
  const { productId, rating, comment } = req.body || {};
  if (!productId || !rating) {
    return res.status(400).json({ error: 'productId and rating are required' });
  }
  const review = { id: nextId++, productId, rating, comment: comment || '' };
  reviews.push(review);
  res.status(201).json(review);
});

app.listen(PORT, () => console.log(`review-service listening on ${PORT}`));
