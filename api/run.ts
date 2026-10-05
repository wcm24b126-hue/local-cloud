export default function handler(req: any, res: any) {
  const service = req.query?.service || 'hello-service';
  res.status(200).json({
    status: 'healthy',
    service,
    method: req.method || 'GET',
    headers: req.headers,
    timestamp: new Date().toISOString(),
    instanceId: `inst-${Math.random().toString(36).substring(2, 9)}`,
    environment: 'Vercel Serverless Cloud Run Emulator',
  });
}
