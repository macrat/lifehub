import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { notificationRefSchema } from '../../features/events/notifications.ts';
import type { AppEnv } from '../app-env.ts';
import { requireCronSecret } from '../middleware.ts';
import { verifyQStashSignature } from '../qstash.ts';
import { deliver, enqueueTomorrow } from './service.ts';

const deliverBodySchema = z.object({ key: z.string().min(1), ref: notificationRefSchema });

/**
 * 通知の外部エントリ。セッションではなく、Cron secret と QStash の署名で保護する。
 * server/app.ts で認証ミドルウェアより前に登録する。
 */
export const notificationsRoutes = new Hono<AppEnv>()
  .get('/enqueue', requireCronSecret, async (c) => c.json(await enqueueTomorrow()))
  .post('/deliver', async (c) => {
    const rawBody = await c.req.text();
    if (!(await verifyQStashSignature(c.req.raw, rawBody))) {
      throw new HTTPException(401, { message: 'invalid signature' });
    }
    const parsed = deliverBodySchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid body' });
    return c.json({ result: await deliver(parsed.data.key, parsed.data.ref) });
  });
