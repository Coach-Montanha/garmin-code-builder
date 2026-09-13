import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import garminRoutes from './routes/garminRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory store for runs and mock Garmin activities
const savedRuns = [];
const mockGarminActivities = [
  {
    id: "garmin-act-101",
    name: "Corrida Matinal - Parque Ibirapuera",
    date: new Date().toISOString(),
    durationSeconds: 1650, // 27:30
    durationFormatted: "00:27:30",
    distanceKm: 5.2,
    avgPace: "5:17",
    calories: 410,
    track: [
      [-23.587411, -46.657634],
      [-23.588200, -46.656500],
      [-23.589100, -46.655200],
      [-23.590500, -46.654100],
      [-23.591800, -46.655800],
      [-23.591000, -46.657200],
      [-23.589500, -46.658500],
      [-23.587411, -46.657634]
    ]
  },
  {
    id: "garmin-act-102",
    name: "Treino de TI de 10k",
    date: new Date(Date.now() - 86400000).toISOString(),
    durationSeconds: 3180, // 53:00
    durationFormatted: "00:53:00",
    distanceKm: 10.05,
    avgPace: "5:16",
    calories: 780,
    track: [
      [-23.587411, -46.657634],
      [-23.592000, -46.651000],
      [-23.598000, -46.645000],
      [-23.592000, -46.651000],
      [-23.587411, -46.657634]
    ]
  }
];

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check API
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Garmin Running Tracker',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Garmin Connect OAuth & Activities REST API (Milestone 2)
app.use('/api/garmin', garminRoutes);

// Save & Fetch Runs History API
app.get('/api/runs', (req, res) => {
  res.status(200).json({
    success: true,
    runs: savedRuns
  });
});

app.post('/api/runs', (req, res) => {
  const runData = req.body;
  if (!runData || !runData.plannedRoute || !runData.actualTrack) {
    return res.status(400).json({ error: 'Dados incompletos da corrida' });
  }

  const newRun = {
    id: `run-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...runData
  };

  savedRuns.unshift(newRun);
  res.status(201).json({
    success: true,
    run: newRun
  });
});

// Serve static assets from public/
app.use(express.static(PUBLIC_DIR));

// SPA fallback for client-side navigation
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

let server = null;
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution || process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`[Garmin Running Tracker] Server running on http://localhost:${PORT}`);
  });
}

export { app, server };
export default app;