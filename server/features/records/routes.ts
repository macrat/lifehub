import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { recordSchema } from '../../../shared/validation/records.ts';
import { validate } from '../../lib/validator.ts';
import { authenticate } from '../api-keys/service.ts';
import * as service from './service.ts';

/** 照合したキーの名前。記録がどこから入ったかとして残す（`service.ingest`） */
type RecordsEnv = { Variables: { apiKeyName: string } };

/**
 * 記録投入用エンドポイント（`POST /api/records`）。デバイスや外部のサービスから記録を 1 件入れる。
 * 資格は `Authorization: Bearer <API キー>` だけ（Cookie を持てない相手のため、セッションは使わない）。
 * 記録した人は不明になる（`service.ingest`）ので、キーの持ち主は照合にだけ使い、記録にはキーの名前を残す。
 */
export const recordsRoutes = new Hono<RecordsEnv>()
  .use(
    bearerAuth<RecordsEnv>({
      verifyToken: async (token, c) => {
        const key = await authenticate(token);
        if (key) c.set('apiKeyName', key.name);
        return key !== undefined;
      },
    }),
  )
  .post('/', validate('json', recordSchema), async (c) =>
    c.json(await service.ingest(c.req.valid('json'), c.get('apiKeyName')), 201),
  );
