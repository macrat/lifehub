import type { APIRequestContext } from '@playwright/test';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../server/app.ts';

/**
 * 画面の API（tRPC。`server/lib/trpc.ts`）を、ブラウザを通さずに呼ぶクライアント。テストの準備と後片付けに使う
 * （画面から作ると 1 件ごとに数秒かかり、確かめたいことより前の操作でテストが落ちうる所も増える）。
 * 要求は Playwright の request で送るので、そのコンテキストのログイン（Cookie）がそのまま載る。
 */
export function apiOf(request: APIRequestContext) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: '/api/trpc',
        fetch: async (url, init) => {
          const res = await request.fetch(String(url), {
            method: init?.method,
            headers: init?.headers as Record<string, string> | undefined,
            data: init?.body ?? undefined,
          });
          return new Response(await res.text(), { status: res.status(), headers: res.headers() });
        },
      }),
    ],
  });
}

export type Api = ReturnType<typeof apiOf>;
