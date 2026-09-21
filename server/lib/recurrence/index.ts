import { TZDate } from '@date-fns/tz';
import rrule, { type RRule as RRuleType } from 'rrule';
import { TIME_ZONE } from '../../../shared/constants.ts';
import { ValidationError } from '../errors.ts';

// rrule は package.json に exports が無く、ESM ビルドも "type": "module" を持たないため、Node の
// ESM ローダーからは名前付き import ができない（UMD の main だけが読める）。default import で
// module.exports を受け取る。createRequire で読むと Vercel の依存トレース（nft）が追えず、
// 関数のバンドルに dist/es5/rrule.js が入らない。
const { RRule, datetime } = rrule;
type RRule = RRuleType;

/**
 * RFC 5545 RRULE の展開。予定・タスクの両方がこれを使い、展開ロジックを自作しない。
 *
 * rrule ライブラリは「浮動時刻」（Date の UTC フィールドを壁時計として扱う）で動くため、
 * Asia/Tokyo の壁時計を UTC フィールドに載せた「浮動 Date」に変換してから渡し、結果を戻す。
 * 保存する RRULE 文字列は DTSTART を含まず（DTSTART は行の starts_at 等）、UNTIL があれば
 * JST の壁時計として解釈する（`UNTIL=20261231T235959` は JST 12/31 23:59:59）。
 */

/** 瞬間 → 浮動 Date（UTC フィールド = JST の壁時計） */
function toFloating(date: Date): Date {
  const z = new TZDate(date, TIME_ZONE);
  return datetime(
    z.getFullYear(),
    z.getMonth() + 1,
    z.getDate(),
    z.getHours(),
    z.getMinutes(),
    z.getSeconds(),
  );
}

/** 浮動 Date → 瞬間 */
function fromFloating(floating: Date): Date {
  return new Date(
    new TZDate(
      floating.getUTCFullYear(),
      floating.getUTCMonth(),
      floating.getUTCDate(),
      floating.getUTCHours(),
      floating.getUTCMinutes(),
      floating.getUTCSeconds(),
      TIME_ZONE,
    ).getTime(),
  );
}

/**
 * RRULE 文字列を検証し、正規形（rrule ライブラリの出力）にして返す。
 * DTSTART を含むものは拒否する（DTSTART は行の日時列で持つため）。
 */
export function normalizeRRule(rrule: string): string {
  const trimmed = rrule
    .trim()
    .toUpperCase()
    .replace(/^RRULE:/, '');
  if (trimmed.includes('DTSTART')) {
    throw new ValidationError('RRULE に DTSTART は含めないでください');
  }
  let options: ReturnType<typeof RRule.parseString>;
  try {
    options = RRule.parseString(trimmed);
  } catch {
    throw new ValidationError('繰り返しルールの形式が正しくありません');
  }
  if (options.freq === undefined) {
    throw new ValidationError('繰り返しルールには FREQ が必要です');
  }
  if (options.freq > RRule.DAILY) {
    throw new ValidationError('繰り返しの最小単位は日です');
  }
  return RRule.optionsToString(options).replace(/^RRULE:/, '');
}

/**
 * dtstart から始まる繰り返しのうち、[from, to) に開始する発生を返す（瞬間）。
 * RRULE の UNTIL / COUNT を尊重する。
 */
export function expandOccurrences(input: {
  rrule: string;
  dtstart: Date;
  from: Date;
  to: Date;
}): Date[] {
  const rule = buildRule(input.rrule, input.dtstart);
  return rule
    .between(toFloating(input.from), toFloating(input.to), true)
    .filter((d) => d.getTime() < toFloating(input.to).getTime())
    .map(fromFloating);
}

/** dtstart 以降の発生を順に返すイテレータ。タスクの「未完了 2 件まで」の走査など、上限を動的に決めたい場合に使う。 */
export function* iterateOccurrences(input: { rrule: string; dtstart: Date }): Generator<Date> {
  const rule = buildRule(input.rrule, input.dtstart);
  let cursor = toFloating(input.dtstart);
  // 最初の発生は dtstart 自身（RRULE の規約）
  let next = rule.after(cursor, true);
  while (next) {
    yield fromFloating(next);
    cursor = next;
    next = rule.after(cursor, false);
  }
}

/** UNTIL を「指定した瞬間の直前」に設定した RRULE を返す（「これ以降すべて」の分割に使う） */
export function withUntilBefore(rrule: string, instant: Date): string {
  const options = RRule.parseString(rrule);
  const until = toFloating(new Date(instant.getTime() - 1000));
  return RRule.optionsToString({ ...options, until, count: undefined }).replace(/^RRULE:/, '');
}

function buildRule(rrule: string, dtstart: Date): RRule {
  return new RRule({ ...RRule.parseString(rrule), dtstart: toFloating(dtstart) });
}
