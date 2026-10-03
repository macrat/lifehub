import * as repository from './repository.ts';

/**
 * ユーザーの ID と名前（登録順）。MCP の出力に名前を出し、入力の名前を ID に引き当てるのに使う。
 * WHY service.ts と分ける: users の service は通知を予約し直す（notifications の service を読む）。
 * 通知を配る notifications の service は MCP Events（mcp-events の service）を呼び、mcp-events はこの一覧を読むので、
 * service.ts に置くと import が一巡する（biome の noImportCycles が禁じる）。ここは repository だけを読む。
 */
export async function listPeople(): Promise<{ id: string; name: string }[]> {
  return (await repository.findAll()).map(({ id, name }) => ({ id, name }));
}
