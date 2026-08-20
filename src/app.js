import express from 'express';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import errorHandler from './middlewares/error.middleware.js';
import requestLogger from './middlewares/logging.middleware.js';
import healthRouter from './routes/healthCheck.js';
import authRouter from './routes/auth.routes.js';

const app = express();

// Middleware stack
app.use(requestLogger); // Logging must be early
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);

// 404 handler for undefined routes
app.use((req, res, next) => {
  const error = new Error(`Cannot find ${req.originalUrl} on this server`);
  error.statusCode = 404;
  next(error);
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});

