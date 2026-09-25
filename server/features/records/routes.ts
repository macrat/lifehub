import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { recordSchema } from '../../../shared/validation/records.ts';
import { validationHook } from '../../lib/validator.ts';
import { authenticate } from '../api-keys/service.ts';
import * as service from './service.ts';

/**
 * 記録投入用エンドポイント（`POST /api/records`）。デバイスや外部のサービスから記録を 1 件入れる。
 * 資格は `Authorization: Bearer <API キー>` だけ（Cookie を持てない相手のため、セッションは使わない）。
 * 記録した人は不明になる（`service.ingest`）ので、キーの持ち主は照合にだけ使う。
 */
export const recordsRoutes = new Hono()
  .use(bearerAuth({ verifyToken: async (token) => (await authenticate(token)) !== undefined }))
  .post('/', zValidator('json', recordSchema, validationHook), async (c) =>
    c.json(await service.ingest(c.req.valid('json')), 201),
  );
