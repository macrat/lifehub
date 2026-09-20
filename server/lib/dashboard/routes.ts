import { Hono } from 'hono';
import type { AppEnv } from '../app-env.ts';
import { loadDashboard } from './registry.ts';

export const dashboardRoutes = new Hono<AppEnv>().get('/', async (c) =>
  c.json(await loadDashboard({ userId: c.get('user').id, now: new Date() })),
);
