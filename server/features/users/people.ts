import * as repository from './repository.ts';

/**
 * 人の一覧と、人ごとの設定・MCP クライアントの名前の読み出し。ほかの feature と入口（`server/mcp.ts`）が
 * service.ts を読まずに users のデータを読む口。
 * WHY service.ts と分ける: users の service は通知時刻が変わると通知を予約し直す（notifications の service を読む）。
 * その notifications の service と、通知を配るときに呼ぶ mcp-events の service がここを読むので、
 * service.ts に置くと import が一巡する（biome の noImportCycles が禁じる）。ここは repository だけを読む。
 */

/** ユーザーの ID と名前（登録順）。MCP の出力に名前を出し、入力の名前を ID に引き当てるのに使う */
export async function listPeople(): Promise<{ id: string; name: string }[]> {
  return (await repository.findAll()).map(({ id, name }) => ({ id, name }));
}

/** OAuth クライアント（MCP クライアント）の登録の名前。名前を登録しないクライアントは null */
export function getOAuthClientName(clientId: string): Promise<string | null> {
  return repository.findOAuthClientName(clientId);
}

/** 全ユーザーの終日の予定・タスクの通知時刻（ユーザー ID → その日の 0:00 からの分）。通知の列挙と再検証が読む */
export function listAllDayNotifyMinutes(): Promise<Map<string, number>> {
  return repository.findAllDayNotifyMinutes();
}
