import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { buildApiRouter, type Services } from './routes/api';
import { buildAuthRouter } from './routes/auth';
import { ValidationError } from './validation/filters';

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, details: err.details } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
};

export function createApp(services: Services) {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(cors({
    origin: config.frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }));

  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'API_RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  });
  app.use('/api', apiLimiter);

  app.use('/api/auth', buildAuthRouter(services.auth));
  app.use('/api', buildApiRouter(services));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint.' } });
  });

  app.use(errorHandler);
  return app;
}
