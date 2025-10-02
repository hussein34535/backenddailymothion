const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Import routes
const videoRoutes = require('./api/video');

// Use routes
app.use('/api', videoRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to DailyMotion Backend API' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

