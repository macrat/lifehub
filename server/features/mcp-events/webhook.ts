import { request } from 'node:https';
import { globalHttpsAgent } from 'request-filtering-agent';
import { Webhook } from 'standardwebhooks';

/**
 * MCP Events の webhook の送り方: Standard Webhooks の署名と、受け手の URL へ安全に POST すること。
 * 何をいつ送るかは service.ts が決める。
 */

/** 送った結果。届かなかった（接続できない・時間切れ・TLS の失敗・内部のアドレス）ときは status を持たない */
type WebhookResponse =
  | { status: number; body: string }
  | { failure: 'connection_refused' | 'timeout' | 'tls_error' };

const TIMEOUT_MS = 10_000;
/** 受け手の応答は検証の challenge を読むだけなので、それより大きい本文は読まずに切る */
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * 署名付きのヘッダー（Standard Webhooks）。id は受け手が重複を見分ける鍵で、送り直しても変えない。
 * 鍵を入れ替えている間は前の鍵でも署名し、空白で並べる（受け手はどちらかが合えば通す）。
 */
export function webhookHeaders(
  subscriptionId: string,
  secrets: string[],
  id: string,
  body: string,
): Record<string, string> {
  const now = new Date();
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
    'webhook-signature': secrets.map((secret) => new Webhook(secret).sign(id, now, body)).join(' '),
    'x-mcp-subscription-id': subscriptionId,
  };
}

/**
 * HTTPS で POST する。受け手の URL は MCP クライアントが決めるので、内部のサーバーやクラウドのメタデータ
 * （169.254.169.254）を叩かせないよう、名前を引いた後のアドレスが内部・予約のものなら繋がない
 * （`request-filtering-agent`。確かめたアドレスにそのまま繋ぐので、DNS rebinding でも内部に届かない）。
 * WHY NOT fetch: Node の fetch は http.Agent を受けず、繋ぐアドレスを確かめられない。
 * リダイレクトは追わない（3xx はそのまま返す。追うと確かめていない宛先へ送ることになる）。
 */
export function postWebhook(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<WebhookResponse> {
  if (new URL(url).protocol !== 'https:') return Promise.resolve({ failure: 'connection_refused' });
  return new Promise((resolve) => {
    const req = request(
      url,
      { method: 'POST', headers, agent: globalHttpsAgent, timeout: TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk);
          else res.destroy();
        });
        res.on('close', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ failure: 'timeout' });
    });
    req.on('error', (error: NodeJS.ErrnoException) => {
      const tls = error.code?.startsWith('ERR_TLS') || error.code?.includes('CERT');
      resolve({ failure: tls ? 'tls_error' : 'connection_refused' });
    });
    req.end(body);
  });
}
