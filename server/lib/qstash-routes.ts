import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { notificationRefSchema } from '../features/events/notifications.ts';
import { deliver } from '../features/notifications/service.ts';
import type { AppEnv } from './app-env.ts';
import { verifyQStashSignature } from './qstash.ts';
import { validationHook } from './validator.ts';

const deliverBodySchema = z.object({ key: z.string().min(1), ref: notificationRefSchema });

/**
 * QStash が予約した時刻に呼ぶ入口をすべてここに集める（予約する側は機能ごと。通知は server/features/notifications/publisher.ts）。
 * セッションではなく QStash の署名で保護する。検査はこの集まり全体に 1 度だけ掛けるので、
 * 入口を足しても保護を付け忘れることがない。server/app.ts で認証ミドルウェアより前に `/qstash` へ登録する。
 * 署名は本文に対して付くので、検査で本文を読む（Hono が読んだ本文を覚えているので、後から zValidator が
 * json() で読み直せる）。
 */
export const qstashRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    if (!(await verifyQStashSignature(c.req.raw, await c.req.text()))) {
      throw new HTTPException(401, { message: 'invalid signature' });
    }
    await next();
  })
  // 通知 1 件の配信（docs/features/notifications.md）
  .post('/notifications', zValidator('json', deliverBodySchema, validationHook), async (c) => {
    const { key, ref } = c.req.valid('json');
    return c.json({ result: await deliver(key, ref) });
  });
