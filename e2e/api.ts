import { type APIRequestContext, expect } from '@playwright/test';

/**
 * 画面の API（tRPC。`server/lib/trpc.ts`）を、ブラウザを通さずに呼ぶ。テストの準備と後片付けに使う
 * （画面から作ると 1 件ごとに数秒かかり、確かめたいことより前の操作でテストが落ちうる所も増える）。
 */

/** 読み出しの手続きを呼び、結果を返す。入力は JSON にしてクエリに載せる（tRPC の GET の形） */
export async function query<T>(
  request: APIRequestContext,
  procedure: string,
  input?: unknown,
): Promise<T> {
  const search = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await request.get(`/api/trpc/${procedure}${search}`);
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { result: { data: T } }).result.data;
}

/** 書き込みの手続きを呼ぶ（入力は JSON の本文） */
export async function mutate(
  request: APIRequestContext,
  procedure: string,
  input: unknown,
): Promise<void> {
  const res = await request.post(`/api/trpc/${procedure}`, { data: input });
  expect(res.ok(), await res.text()).toBe(true);
}
