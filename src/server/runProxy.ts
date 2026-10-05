import type { IncomingMessage, ServerResponse } from 'http';

/**
 * LocalCloud Cloud Run Reverse Proxy Middleware
 * Handles incoming HTTP requests to `/api/run/:serviceName/*`
 * Emulates the Google Cloud Run front-end routing proxy on student localhost.
 */

export function handleCloudRunProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  const url = req.url || '';

  // Only handle /api/run/... paths
  if (!url.startsWith('/api/run')) {
    return next();
  }

  // Parse path: /api/run/{serviceName}/{subpath}
  const cleanUrl = url.replace(/^\/api\/run\/?/, '');
  const slashIndex = cleanUrl.indexOf('/');
  const serviceName = slashIndex === -1 ? cleanUrl : cleanUrl.substring(0, slashIndex);
  const subpath = slashIndex === -1 ? '/' : cleanUrl.substring(slashIndex);

  if (!serviceName) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Missing service name in path. Expected format: /api/run/<service-name>/<endpoint>',
      example: '/api/run/hello-service/'
    }, null, 2));
    return;
  }

  // Read request body if present
  let bodyChunks: Buffer[] = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(bodyChunks).toString('utf-8');
    let parsedBody: any = null;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }
    }

    const start = Date.now();
    const traceId = Math.random().toString(36).substring(2, 16);

    // Standard Cloud Run Google Frontend headers
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Server', 'Google Frontend (LocalCloud Cloud Run Emulator)');
    res.setHeader('X-Cloud-Trace-Context', `${traceId}/1;o=1`);
    res.setHeader('X-LocalCloud-Scale-Status', 'scaled-from-zero (active instances: 1)');

    const method = req.method || 'GET';

    if (subpath === '/healthz' || subpath === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('OK');
      return;
    }

    if (subpath === '/echo') {
      res.statusCode = 200;
      res.end(JSON.stringify({
        service: serviceName,
        method,
        path: subpath,
        receivedBody: parsedBody,
        headers: req.headers,
        timestamp: new Date().toISOString(),
        executionLatencyMs: Date.now() - start
      }, null, 2));
      return;
    }

    // Default handler
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'healthy',
      message: `Hello from Google Cloud Run service "${serviceName}"!`,
      service: serviceName,
      invokedEndpoint: subpath,
      method,
      activeInstances: 1,
      scaleToZeroConfigured: true,
      timestamp: new Date().toISOString(),
      proxyInfo: {
        reverseProxyPath: `/api/run/${serviceName}${subpath}`,
        targetRegion: 'us-central1',
        poweredBy: 'LocalCloud Serverless Engine'
      }
    }, null, 2));
  });
}
