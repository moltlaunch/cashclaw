import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { configureRoutes } from './routes/index.js';
import { setupWebSocket } from './websocket/index.js';
import { serveStaticAssets } from './static.js';
import type { CashClawConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  port: number;
  config: CashClawConfig;
}

export function createExpressServer(options: ServerOptions) {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Enable CORS for all routes
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
  }));

  // Parse JSON bodies
  app.use(express.json());

  // Setup API routes
  configureRoutes(app, options.config);

  // Setup WebSocket handling
  setupWebSocket(wss, options.config);

  // Serve static assets from Vite build
  serveStaticAssets(app);

  // Fallback to serve index.html for SPA routing
  app.get('*', (req, res) => {
    const distPath = path.join(__dirname, '../../dist');
    res.sendFile(path.join(distPath, 'index.html'));
  });

  return { app, server, wss };
}

export function startServer(options: ServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const { server } = createExpressServer(options);

      server.listen(options.port, () => {
        console.log(`CashClaw server running on port ${options.port}`);
        console.log(`Dashboard: http://localhost:${options.port}`);
        resolve();
      });

      server.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}
