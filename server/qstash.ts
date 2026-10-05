import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { notificationMessageSchema } from './features/notifications/publisher.ts';
import { deliver } from './features/notifications/service.ts';
import { verifyQStashSignature } from './lib/qstash.ts';
import { validate } from './lib/validator.ts';

const verifySignature: MiddlewareHandler = async (c, next) => {
  if (!(await verifyQStashSignature(c.req.raw, await c.req.text()))) {
    throw new HTTPException(401, { message: 'invalid signature' });
  }
  await next();
};

/**
 * QStash が予約した時刻に呼ぶ入口をすべてここに集める（予約する側は機能ごと。通知は server/features/notifications/publisher.ts）。
 * セッションではなく QStash の署名で保護する。検査はこの集まり全体に 1 度だけ掛けるので、
 * 入口を足しても保護を付け忘れることがない（`/api` の下の外からの入口は、それぞれが自分を守る。
 * docs/architecture.md の「認証・認可」）。
 * 署名は本文に対して付くので、検査で本文を読む（Hono が読んだ本文を覚えているので、後から validate が
 * json() で読み直せる）。
 */
export const qstashRoutes = new Hono()
  .use(verifySignature)
  // 通知 1 件の配信（docs/features/notifications.md）
  .post('/notifications', validate('json', notificationMessageSchema), async (c) => {
    const { key, ref } = c.req.valid('json');
    return c.json({ result: await deliver(key, ref) });
  });
