import type { z } from 'zod';
import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { occurrenceTargetSchema, RecurrenceScope } from '../../../shared/validation/events.ts';

/**
 * グリッドでつまんで直すときの範囲。繰り返しの回はその回だけを直す（つまんだのはその回で、
 * ほかの回の日時まで動かさないため）。単発は行そのもの（＝すべて）を直す。
 * 保存の指定（`scope`）と入力欄の出し分け（`thisOnly`）が食い違わないよう、決め方はここだけに置く。
 */
export function grabbedScope(item: { isRecurring: boolean } | null | undefined): RecurrenceScope {
  return item?.isRecurring ? 'this' : 'all';
}

/**
 * 書き込み（更新・削除）が指す行と回。回の指定の形は API のスキーマ（`occurrenceTargetSchema`）から導く
 * （all 以外は繰り返しの回の基準日時が要る）。書き写さないので、サーバーの規則が変われば型検査で気づける。
 */
export type OccurrenceTarget = { id: string } & z.input<typeof occurrenceTargetSchema>;

/** 項目と範囲 → 書き込みが指す回。単発（基準日時が無い）は範囲に関わらず行そのもの（all） */
export function occurrenceTarget(
  item: { id: string; occurrenceStart: string | null },
  scope: RecurrenceScope,
): OccurrenceTarget {
  return scope === 'all' || item.occurrenceStart === null
    ? { id: item.id, scope: 'all' }
    : { id: item.id, scope, occurrenceStart: item.occurrenceStart };
}

/**
 * フォームの繰り返し選択肢と RRULE 文字列の相互変換。
 * フォームは頻度と終了日だけを扱う。より複雑なルール（BYDAY など）は API / MCP から直接 RRULE で指定できる。
 */
export type RecurrenceFreq = 'none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const RECURRENCE_FREQ_OPTIONS: { value: RecurrenceFreq; label: string }[] = [
  { value: 'none', label: '繰り返さない' },
  { value: 'DAILY', label: '毎日' },
  { value: 'WEEKLY', label: '毎週' },
  { value: 'MONTHLY', label: '毎月' },
  { value: 'YEARLY', label: '毎年' },
];

export function buildRRule(freq: RecurrenceFreq, until: DateString | undefined): string | null {
  if (freq === 'none') return null;
  const parts = [`FREQ=${freq}`];
  if (until) parts.push(`UNTIL=${until.replaceAll('-', '')}T235959`);
  return parts.join(';');
}

export function parseRRule(rrule: string | null): {
  freq: RecurrenceFreq;
  until: DateString | undefined;
  isSimple: boolean;
} {
  if (!rrule) return { freq: 'none', until: undefined, isSimple: true };
  // RRULE の "KEY=VALUE;KEY=VALUE" は区切りが ; なだけのクエリ文字列なので URLSearchParams で読む
  const params = new URLSearchParams(rrule.replaceAll(';', '&'));
  const freq = RECURRENCE_FREQ_OPTIONS.find((o) => o.value === params.get('FREQ'))?.value;
  const untilRaw = params.get('UNTIL') ?? '';
  const untilDate = `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`;
  const until = isDateString(untilDate) ? untilDate : undefined;
  const knownKeys = new Set(['FREQ', 'UNTIL']);
  const isSimple =
    freq !== undefined && freq !== 'none' && [...params.keys()].every((k) => knownKeys.has(k));
  return { freq: isSimple && freq ? freq : 'none', until, isSimple };
}

export function describeRRule(rrule: string | null): string {
  const { freq, until, isSimple } = parseRRule(rrule);
  if (!rrule) return '';
  if (!isSimple) return `繰り返し（${rrule}）`;
  const label = RECURRENCE_FREQ_OPTIONS.find((o) => o.value === freq)?.label ?? '';
  return until ? `${label}（${until.replaceAll('-', '/')} まで）` : label;
}
