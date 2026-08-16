import express from 'express';
import config from './config/index.js';
import healthRouter from './routes/healthCheck.js';

const app = express();

app.use(express.json());
app.use('/api/v1', healthRouter);

app.all('/{*splat}', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot find ${req.originalUrl} on this server`,
  });
});

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
