// Load .env before anything reads process.env, so PORT and DATABASE_URL work in
// development without exporting them by hand.
import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudRunRouter } from './src/server/routes/cloudRunRoutes.ts';
import { createNetlabRouter } from './src/server/routes/netlabRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// Cloud Run Emulation Management & Proxy Routes
app.use('/api/run', cloudRunRouter);

async function startServer() {
  // Networking lab state persistence. The route is always mounted so the client
  // can discover the active backend, but it only stores anything when DATABASE_URL
  // is set and Postgres answers. Without it the lab persists to localStorage.
  const { router: netlabRouter, backend } = await createNetlabRouter();
  app.use('/api/netlab', netlabRouter);
  console.log(`Lab state persistence: ${backend}`);

  if (!isProduction) {
    // In dev: mount Vite middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production: serve built assets from dist/
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));

    // Unknown API routes must 404 as JSON rather than falling through to the SPA,
    // otherwise the client cannot tell "no such endpoint" from "here is the app".
    app.use('/api', (_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LocalCloud server listening on port ${port} (mode: ${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
