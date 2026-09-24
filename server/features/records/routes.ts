import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { recordSchema } from '../../../shared/validation/records.ts';
import { validationHook } from '../../lib/validator.ts';
import { authenticate } from '../api-keys/service.ts';
import * as service from './service.ts';

/** API キーで認証した要求の変数。セッションのユーザーではなく、キーの持ち主の ID だけを持つ */
type RecordsEnv = { Variables: { userId: string } };

/**
 * 記録投入用エンドポイント（`POST /api/records`）。デバイスや外部のサービスから記録を 1 件入れる。
 * 資格は `Authorization: Bearer <API キー>` だけ（Cookie を持てない相手のため、セッションは使わない）。
 * キーの持ち主が記録したことになる。
 */
export const recordsRoutes = new Hono<RecordsEnv>()
  .use(
    bearerAuth({
      verifyToken: async (token, c) => {
        const userId = await authenticate(token);
        if (!userId) return false;
        // bearerAuth は Context の変数の型を受け取らない（verifyToken の c は既定の Env）ので、ここで絞る
        (c as Context<RecordsEnv>).set('userId', userId);
        return true;
      },
    }),
  )
  .post('/', zValidator('json', recordSchema, validationHook), async (c) =>
    c.json(await service.ingest(c.req.valid('json'), c.get('userId')), 201),
  );
