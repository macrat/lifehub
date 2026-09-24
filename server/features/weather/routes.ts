import { Hono } from 'hono';
import type { AppEnv } from '../../lib/app-env.ts';
import * as service from './service.ts';

export const weatherRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listWeather()))
  .get('/hourly', async (c) => c.json(await service.listHourlyWeather()));
