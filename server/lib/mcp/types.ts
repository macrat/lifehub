import type { McpServer } from '@modelcontextprotocol/server';

/** MCP の出力に名前を出し、入力の名前を ID に引き当てるためのユーザー（`people.ts`） */
export type Person = { id: string; name: string };

/** MCP ツールの実行文脈 */
export type McpContext = {
  /** OAuth のアクセストークンから得た、ツールを呼んでいるユーザーの ID */
  userId: string;
  /** ユーザーの一覧（登録順）。1 回の要求の中では 1 度だけ読む */
  people(): Promise<Person[]>;
};

/** 各 feature の mcp.ts が export する登録関数。server/mcp.ts が列挙する。 */
export type ToolRegistrar = (server: McpServer, ctx: McpContext) => void;

/**
 * ツールの結果をテキスト（JSON）で返す。字下げはしない（LLM は字下げが無くても読め、字下げの分だけ文脈を食う）。
 * null / undefined の項目は `compact` で落としてから渡す。
 */
export function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

/**
 * 値が null / undefined の項目を落とす。LLM に返す形では「無い」ことを項目ごと省いて示す
 * （`location: null` のような項目が並ぶと、読む量が増えるうえに要点が埋もれる）。
 */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>;
}

/** ツールの性質（MCP の tool annotations）。クライアントが確認の要否を決めるのに使う */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
export const ADDITIVE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;
export const EDITING = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;
