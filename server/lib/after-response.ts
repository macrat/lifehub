import { waitUntil } from '@vercel/functions';

/**
 * 応答を返した後に続ける処理を登録する。応答はこの処理を待たない。
 * Vercel Function は応答を返すと処理を止めうるので、`waitUntil` で終わるまで生かしておく
 * （Vercel の外、ローカルの Node サーバーやテストでは何もしないが、プロセスが生きているので処理は最後まで走る）。
 * 失敗は応答に載せられないので、ログに残すだけにする。
 */
export function afterResponse(label: string, task: () => Promise<unknown>): void {
  waitUntil(
    task().catch((error: unknown) => {
      console.error(`${label} failed`, error);
    }),
  );
}
