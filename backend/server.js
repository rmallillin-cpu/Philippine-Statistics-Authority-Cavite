const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const sheetsService = require('./services/sheetsService');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const lookupRoutes = require('./routes/lookups');
const dashboardRoutes = require('./routes/dashboard');
const accomplishmentRoutes = require('./routes/accomplishments');
const messageRoutes = require('./routes/messages');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', lookupRoutes); // -> /api/departments, /api/positions
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/accomplishments', accomplishmentRoutes);
app.use('/api/messages', messageRoutes);

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;

async function start() {
  console.log('Checking Google Sheet structure...');
  await sheetsService.ensureTabsExist();
  await sheetsService.ensureDefaultAdmin();
  app.listen(PORT, () => console.log(`PSA Cavite Admin System running at http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server. Check your .env and service-account.json setup.');
  console.error(err);
  process.exit(1);
});
