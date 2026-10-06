import { z } from 'zod';
import type { OccurrenceTarget } from '../../../shared/validation/events.ts';
import { ValidationError } from '../errors.ts';

/**
 * タイムラインに並ぶ記録（エントリー）の種類。予定とタスクは DB では同じ表（kind）だが、
 * LLM にとっては別の物なので分ける。
 */
export const ENTRY_TYPES = ['event', 'task', 'expense', 'lemon', 'memo', 'transaction'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  event: '予定',
  task: 'タスク',
  expense: '立替',
  lemon: 'レモンの世話',
  memo: 'メモ',
  transaction: '入出金',
};

/**
 * エントリーを指す 1 つの文字列（ref）。`<種類>:<ID>`、繰り返しの回は `<種類>:<ID>@<回の基準日時>`。
 * 読むツールが返した ref を、書くツールにそのまま渡させる。
 * WHY: 種類・ID・繰り返しの回を別々の引数にすると、LLM は組み合わせを取り違える（別の種類のツールに渡す、
 * 回の指定を落とす）。1 つの値なら写すだけで済み、取り違えはサーバーが種類を見て文で返せる。
 */
export type EntryRef = { type: EntryType; id: string; occurrenceStart: Date | null };

export function toRef(type: EntryType, id: string, occurrenceStart?: Date | string | null): string {
  return occurrenceStart
    ? `${type}:${id}@${new Date(occurrenceStart).toISOString()}`
    : `${type}:${id}`;
}

const REF = /^([a-z]+):([0-9a-f-]{36})(?:@(.+))?$/;

export const refSchema = z
  .string()
  .describe('read_timeline などが返したエントリーの ref（そのまま写す）')
  .transform((value, ctx): EntryRef => {
    const [, type, id, occurrence] = REF.exec(value.trim()) ?? [];
    const occurrenceStart = occurrence ? new Date(occurrence) : null;
    if (
      !ENTRY_TYPES.includes(type as EntryType) ||
      !z.uuid().safeParse(id).success ||
      (occurrenceStart && Number.isNaN(occurrenceStart.getTime()))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `ref の形が正しくありません: ${value}。read_timeline が返した ref をそのまま渡してください`,
      });
      return z.NEVER;
    }
    return { type: type as EntryType, id: id as string, occurrenceStart };
  });

/** ref が期待した種類か確かめる。違えば、どのツールを使えばよいかを文で返す */
export function expectType<T extends EntryType>(
  ref: EntryRef,
  types: readonly T[],
  hint = '',
): EntryRef & { type: T } {
  if ((types as readonly EntryType[]).includes(ref.type)) return ref as EntryRef & { type: T };
  throw new ValidationError(
    `この ref は${ENTRY_TYPE_LABELS[ref.type]}です。${types.map((t) => ENTRY_TYPE_LABELS[t]).join('・')}の ref を渡してください。${hint}`,
  );
}

/** 繰り返しの予定・タスクのどの回に対する書き込みか（LLM に選ばせる語） */
export const scopeSchema = z
  .enum(['this', 'following', 'all'])
  .optional()
  .describe(
    '繰り返しのどの回に効かせるか: this=この回だけ、following=この回以降、all=すべての回。繰り返しの回の ref（@ を含む）では必須、それ以外では省く',
  );

/**
 * ref と scope → service が受け取る回の指定。
 * 繰り返しの回を指す ref で scope が無ければ、黙って決めずに選ばせる。
 * WHY: 既定をすべての回にすると「来週の歯医者を 10 時に」が毎週の歯医者を動かし、この回だけにすると
 * 「毎週の歯医者を 10 時に」がその回だけを動かす。どちらに倒しても取り返しの付かない変更になりうる。
 */
export function occurrenceTargetOf(
  ref: EntryRef,
  scope: z.infer<typeof scopeSchema>,
): OccurrenceTarget {
  const { occurrenceStart } = ref;
  if (!occurrenceStart) {
    if (scope === undefined || scope === 'all') return { scope: 'all' };
    throw new ValidationError(
      `scope が ${scope} のときは、read_timeline が返した繰り返しの回の ref（@ を含む）を渡してください`,
    );
  }
  if (scope === undefined) {
    throw new ValidationError(
      'この ref は繰り返しの 1 回です。scope に this（この回だけ）・following（この回以降）・all（すべての回）のどれかを指定してください',
    );
  }
  return scope === 'all' ? { scope } : { scope, occurrenceStart };
}
