import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { hourlyWeatherQuerySchema } from '../../../shared/validation/weather.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

export const weatherRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listWeather()))
  .get('/hourly', zValidator('query', hourlyWeatherQuerySchema, validationHook), async (c) =>
    c.json(await service.listHourlyWeather(c.req.valid('query').date)),
  );
