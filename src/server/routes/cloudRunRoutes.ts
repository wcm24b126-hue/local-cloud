import { Router, type Request, type Response } from 'express';
import {
  cloudRunEmulationService,
  type DeployContainerImageInput,
  type UpdateTrafficInput,
} from '../services/cloudRunService.ts';

export const cloudRunRouter = Router();

/**
 * List all Cloud Run services
 * GET /api/run/services
 */
cloudRunRouter.get('/services', (req: Request, res: Response) => {
  const projectId = (req.query.projectId as string) || undefined;
  const region = (req.query.region as string) || undefined;
  const services = cloudRunEmulationService.listServices(projectId, region);
  res.json({
    services,
    totalSize: services.length,
  });
});

/**
 * Deploy a container image or create a service
 * POST /api/run/services
 */
cloudRunRouter.post('/services', (req: Request, res: Response) => {
  const body = req.body as DeployContainerImageInput;
  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Service name is required.' });
  }

  try {
    const service = cloudRunEmulationService.deployService(body);
    res.status(201).json(service);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to deploy service' });
  }
});

/**
 * Get a specific service by name or ID
 * GET /api/run/services/:serviceName
 */
cloudRunRouter.get('/services/:serviceName', (req: Request, res: Response) => {
  const service = cloudRunEmulationService.getService(req.params.serviceName);
  if (!service) {
    return res.status(404).json({ error: `Service "${req.params.serviceName}" not found.` });
  }
  res.json(service);
});

/**
 * Delete a service
 * DELETE /api/run/services/:serviceName
 */
cloudRunRouter.delete('/services/:serviceName', (req: Request, res: Response) => {
  const deleted = cloudRunEmulationService.deleteService(req.params.serviceName);
  if (!deleted) {
    return res.status(404).json({ error: `Service "${req.params.serviceName}" not found.` });
  }
  res.json({ message: `Service "${req.params.serviceName}" deleted successfully.` });
});

/**
 * List revisions of a service
 * GET /api/run/services/:serviceName/revisions
 */
cloudRunRouter.get('/services/:serviceName/revisions', (req: Request, res: Response) => {
  const revisions = cloudRunEmulationService.listRevisions(req.params.serviceName);
  res.json({
    service: req.params.serviceName,
    revisions,
    totalSize: revisions.length,
  });
});

/**
 * Get a specific revision of a service
 * GET /api/run/services/:serviceName/revisions/:revisionName
 */
cloudRunRouter.get('/services/:serviceName/revisions/:revisionName', (req: Request, res: Response) => {
  const revision = cloudRunEmulationService.getRevision(req.params.serviceName, req.params.revisionName);
  if (!revision) {
    return res.status(404).json({
      error: `Revision "${req.params.revisionName}" for service "${req.params.serviceName}" not found.`,
    });
  }
  res.json(revision);
});

/**
 * Rollback traffic 100% to a specified revision
 * POST /api/run/services/:serviceName/revisions/:revisionName/rollback
 */
cloudRunRouter.post('/services/:serviceName/revisions/:revisionName/rollback', (req: Request, res: Response) => {
  try {
    const updated = cloudRunEmulationService.rollbackRevision(req.params.serviceName, req.params.revisionName);
    if (!updated) {
      return res.status(404).json({ error: `Service or revision not found.` });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Delete a specific revision
 * DELETE /api/run/services/:serviceName/revisions/:revisionName
 */
cloudRunRouter.delete('/services/:serviceName/revisions/:revisionName', (req: Request, res: Response) => {
  try {
    const deleted = cloudRunEmulationService.deleteRevision(req.params.serviceName, req.params.revisionName);
    if (!deleted) {
      return res.status(404).json({ error: `Revision not found.` });
    }
    res.json({ message: `Revision "${req.params.revisionName}" deleted successfully.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Update traffic split across revisions
 * POST /api/run/services/:serviceName/traffic
 */
cloudRunRouter.post('/services/:serviceName/traffic', (req: Request, res: Response) => {
  const body = req.body as UpdateTrafficInput;
  if (!body.targets || !Array.isArray(body.targets)) {
    return res.status(400).json({ error: 'targets array is required' });
  }

  try {
    const updated = cloudRunEmulationService.updateTraffic(req.params.serviceName, body);
    if (!updated) {
      return res.status(404).json({ error: `Service "${req.params.serviceName}" not found.` });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Live Cloud Run reverse proxy invocation endpoint
 * ALL /api/run/:serviceName*
 */
cloudRunRouter.all('/:serviceName*', async (req: Request, res: Response) => {
  // If the path matches /services (and handled above), next()
  if (req.params.serviceName === 'services') {
    return;
  }

  const serviceName = req.params.serviceName;
  const subpath = req.params[0] || '/';

  try {
    const result = await cloudRunEmulationService.invokeService(
      serviceName,
      subpath,
      req.method,
      req.headers as Record<string, string>,
      req.body
    );

    // Set emulation headers
    Object.entries(result.headers).forEach(([k, v]) => {
      res.setHeader(k, v);
    });

    res.status(result.statusCode).send(result.data);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: 500,
        message: err.message || 'Internal Cloud Run emulation error',
        status: 'INTERNAL',
      },
    });
  }
});
