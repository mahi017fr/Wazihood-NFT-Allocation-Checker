/**
 * Vercel serverless entry point. Exposes the Express application under /api/*
 * while Vercel's static hosting serves the Vite frontend from the `dist/`
 * outputDirectory.
 *
 * Request flow on Vercel:
 *   /api/*  -->  Vercel serverless function (this handler) --> Express routes
 *   /*      -->  static file from dist/ (Vercel edge/CDN)
 *
 * Usage in vercel.json:
 *   "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../server/app';

const server = createServer(buildApp());

export default async function wazihoodApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  server.emit('request', req, res);
}
