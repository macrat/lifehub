import { hc } from 'hono/client';
import type { AppType } from '../../server/app.ts';

/**
 * Hono RPC クライアント。サーバーの AppType を型としてだけ参照し、実行時コードは含まない。
 * 同一オリジンなので baseUrl は空。
 */
export const api = hc<AppType>('').api;
