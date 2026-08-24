import { pathToFileURL } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import errorHandler from './middlewares/error.middleware.js';
import requestLogger from './middlewares/logging.middleware.js';
import healthRouter from './routes/healthCheck.js';
import authRouter from './routes/auth.routes.js';
import specialtyRouter from './routes/specialty.routes.js'
import doctorsRouter from './routes/doctors.routes.js';

const app = express();

// Middlewares
app.use(requestLogger); // Logging must be early
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1' , specialtyRouter);
app.use('/api/v1', doctorsRouter);

// 404 handler for undefined routes
app.use((req, res, next) => {
  const error = new Error(`Cannot find ${req.originalUrl} on this server`);
  error.statusCode = 404;
  next(error);
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start the HTTP server only when this file is executed directly
// (node src/app.js). When imported (e.g. by tests via supertest),
// only the configured app is exported.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
}

export default app;

