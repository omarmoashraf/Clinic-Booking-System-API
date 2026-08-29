import { pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import config from './config/index.js';
import prisma from './lib/prisma.js';
import errorHandler from './middlewares/error.middleware.js';
import requestLogger from './middlewares/logging.middleware.js';
import { openApiSpec } from './docs/openapi.js';
import healthRouter from './routes/healthCheck.js';
import authRouter from './routes/auth.routes.js';
import specialtyRouter from './routes/specialty.routes.js';
import doctorsRouter from './routes/doctors.routes.js';
import patientsRouter from './routes/patients.routes.js';
import usersRouter from './routes/users.routes.js';
import availabilityRouter from './routes/availability.routes.js';
import appointmentsRouter from './routes/appointments.routes.js';
import adminRouter from './routes/admin.routes.js';

const app = express();

// Security & Base Middlewares
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(requestLogger); // Logging early
app.use(express.json());
app.use(cookieParser());

// API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get('/api/docs.json', (req, res) => res.json(openApiSpec));

// Application Routes
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1', specialtyRouter);
app.use('/api/v1', doctorsRouter);
app.use('/api/v1', patientsRouter);
app.use('/api/v1', usersRouter);
app.use('/api/v1', availabilityRouter);
app.use('/api/v1', appointmentsRouter);
app.use('/api/v1/admin', adminRouter);

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
  const server = app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
