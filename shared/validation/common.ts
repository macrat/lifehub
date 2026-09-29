import { z } from 'zod';
import { isDateString } from '../date.ts';
import type { DateString } from '../types.ts';

/** JST の暦日（YYYY-MM-DD） */
export const dateStringSchema = z
  .string()
  .refine(isDateString, '日付は YYYY-MM-DD 形式で指定してください')
  .transform((v) => v as DateString);

/** ISO 8601 の日時。Date に変換する。 */
export const instantSchema = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

/** 期間指定（両端を含む JST 暦日） */
export const dateRangeQuerySchema = z
  .object({ from: dateStringSchema, to: dateStringSchema })
  .refine((v) => v.from <= v.to, { message: 'from は to 以前にしてください' });

export const uuidSchema = z.uuid();

/** 人が付ける名前（ユーザー、API キー、配信 URL） */
export const nameSchema = z.string().trim().min(1, '名前を入力してください').max(50);

/**
 * API が受け取る作成の入力に足す、行の ID（`schema.safeExtend(clientIdShape)`）。
 * ID はクライアントが決めて送れ、省略時はサーバー（各 feature の service の作成の既定の引数）が採番する。
 * WHY: オフラインで作った記録をオンラインに戻る前に編集・削除でき（ID が仮のものにならない）、
 * 通信が切れて送り直しても同じ行になる（二重に作られない）。
 * WHY NOT 入力のスキーマそのものに持たせる: MCP は ID を考える必要がなく、持たせると
 * ツールの入力欄が増えて誤った ID を渡す余地ができる。
 */
export const clientIdShape = { id: uuidSchema.optional() };

/**
 * 履歴の 1 ページの問い合わせ（shared/types.ts の `HistoryPage`）で絞り込みに足す、続きのページの
 * カーソル（`filterSchema.extend(cursorShape)`）。before を省くと最新のページ、渡すとその日より前のページ（前のページの `nextCursor` をそのまま渡す）
 */
export const cursorShape = { before: dateStringSchema.optional() };

/** 記録 1 件を指す入力（1 件の読み出し・削除。書き込みは `withId`）。どの feature の ID も UUID なので 1 つを共有する */
export const idParamSchema = z.object({ id: uuidSchema });

/**
 * 記録 1 件への書き込みの入力（画面の API の手続き）: 記録の ID と、その記録への入力を 1 つにしたもの。
 * 入力の規則（refine など）はそのまま効く
 */
export function withId<T extends z.ZodType<object>>(schema: T) {
  return idParamSchema.and(schema);
}

/**
 * 参加者（ユーザー ID の集合）。1 人以上で、重複は落とす。
 * 予定・タスクの参加者（`events.ts`）と、配信 URL に表示する対象者（`calendar-feeds.ts`）が
 * 同じ選択（`ParticipantsField`）から来るので、規則と文面はここ 1 か所に置く。
 */
export const participantIdsSchema = z
  .array(uuidSchema)
  .min(1, '参加者を 1 人以上選んでください')
  .transform((ids) => [...new Set(ids)]);
