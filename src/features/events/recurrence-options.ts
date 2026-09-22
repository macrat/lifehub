import { isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { RecurrenceScope } from '../../../shared/validation/events.ts';

/** 繰り返しのどこを直しているかの表示（詳細の編集とクイック入力で同じ言葉を使う） */
export const SCOPE_LABELS: Record<RecurrenceScope, string> = {
  this: 'この回だけ編集',
  following: 'これ以降を編集',
  all: 'すべての回を編集',
};

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
