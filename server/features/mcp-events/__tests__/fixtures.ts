import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';
import * as afterResponse from '../../../lib/after-response.ts';
import { grantConsent } from '../../mcp-clients/__tests__/fixtures.ts';
import * as webhook from '../webhook.ts';

/** MCP Events のテストが共有する受け手・鍵・応答の後の配信 */

/** 署名の鍵（`whsec_` + 32 バイトの base64） */
export const newSecret = () => `whsec_${randomBytes(32).toString('base64')}`;

type Received = { url: string; headers: Record<string, string>; body: string };

/**
 * 受け手の代わりに、webhook の送り先（postWebhook）を差し替える。届いたものを覚え、検証の challenge には
 * 同じ値を返す（status で返す応答を変えられる）。呼ぶたびに受け手を置き換える
 */
export function receiver(status: (received: Received) => number = () => 200) {
  const received: Received[] = [];
  vi.spyOn(webhook, 'postWebhook').mockImplementation(async (url, headers, body) => {
    const request = { url, headers, body };
    received.push(request);
    const { type, challenge } = JSON.parse(body) as { type?: string; challenge?: string };
    return {
      status: status(request),
      body: type === 'verification' ? JSON.stringify({ challenge }) : '',
    };
  });
  /** 検証を除いた、届いたイベントの本文 */
  const events = () =>
    received
      .filter((r) => !r.body.includes('"verification"'))
      .map((r) => ({ ...r, json: JSON.parse(r.body) }));
  return { received, events };
}

/**
 * MCP Events の配信（応答の後の処理）をその場で走らせずに溜め、返す関数で走らせて終わるまで待つ。
 * 書き込みの後に配信を待てるようにする。ほかの応答の後の処理（通知の予約など）はそのまま走らせる
 */
export function holdDeliveries(): () => Promise<void> {
  const held: (() => Promise<void>)[] = [];
  vi.spyOn(afterResponse, 'afterResponse').mockImplementation((label, task) => {
    if (label === 'mcp-events') held.push(task);
    else void task();
  });
  return async () => {
    for (const task of held.splice(0)) await task();
  };
}

/** 購読する人と、MCP のテストが既定で使うクライアントへのその人の許可（無ければ作る） */
export async function subscriber(userId: string) {
  return { userId, consentId: await grantConsent(userId) };
}
