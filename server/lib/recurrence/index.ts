import { TZDate } from '@date-fns/tz';
import rrule, { type Options, type RRule as RRuleType } from 'rrule';
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
 *
 * rrule の走査は必ず DTSTART から始まる（途中から始める API が無い）。走査の費用は
 * 「DTSTART から取り出した発生の数」に比例するので、公開する関数はどれも **1 回の走査で
 * 必要な分だけを取り切る** 形にしてある。同じルールに対して after() や between() を繰り返すと、
 * そのたびに DTSTART から走査し直すため発生数の 2 乗に比例して遅くなる。
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
 * RRULE 文字列を検証して rrule のオプションにする。
 * DTSTART を含むものは拒否する（DTSTART は行の日時列で持つため）。
 */
function parseRRule(rrule: string): Partial<Options> {
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
  if (
    options.interval !== undefined &&
    (!Number.isSafeInteger(options.interval) || options.interval < 1)
  ) {
    throw new ValidationError('繰り返しの間隔は正の整数で指定してください');
  }
  if (options.count != null && (!Number.isSafeInteger(options.count) || options.count < 1)) {
    throw new ValidationError('繰り返しの回数は正の整数で指定してください');
  }
  if (options.freq > RRule.DAILY) {
    throw new ValidationError('繰り返しの最小単位は日です');
  }
  return options;
}

/** rrule のオプションを、保存する RRULE 文字列（`RRULE:` を付けない）にする */
function toRRuleString(options: Partial<Options>): string {
  return RRule.optionsToString(options).replace(/^RRULE:/, '');
}

/**
 * RRULE 文字列を検証し、正規形（rrule ライブラリの出力）にして返す。保存する前（予定・タスクの書き込み）に通す。
 * COUNT と UNTIL の両方を持つものは拒む（RFC 5545 が禁じている。どちらで終わるかが決まらない）。
 * WHY NOT 展開（`parseRRule`）でも拒む: 保存済みのルールが両方を持っていると、その予定を含む期間の
 * 読み出しがすべて失敗する。拒むのは書き込みだけにし、保存済みのものは rrule ライブラリの解釈で展開を続ける。
 */
export function normalizeRRule(rrule: string): string {
  const options = parseRRule(rrule);
  if (options.count != null && options.until != null) {
    throw new ValidationError(
      '繰り返しの終わりは、回数（COUNT）か終了日（UNTIL）のどちらか一方で指定してください',
    );
  }
  return toRRuleString(options);
}

/**
 * dtstart から始まる繰り返しのうち、[from, to) に開始する発生を返す（瞬間）。
 * RRULE の UNTIL / COUNT を尊重する。
 *
 * lookbehind / lookahead を指定すると、窓の手前・後ろの発生もその個数だけ返す。
 * 「未完了の回を先頭から数えつつ、2 つ先の発生で放棄を判定する」ような、終端が
 * 動的に決まる走査のためにある。返す配列は発生の並びの連続した一部分なので、
 * 添字の差はそのまま「何回先か」を表す。
 */
export function expandOccurrences(input: {
  rrule: string;
  dtstart: Date;
  from: Date;
  to: Date;
  lookbehind?: number;
  lookahead?: number;
}): Date[] {
  const from = toFloating(input.from).getTime();
  const to = toFloating(input.to).getTime();
  const lookbehind = input.lookbehind ?? 0;
  const lookahead = input.lookahead ?? 0;
  // 窓の外は瞬間に戻さずに数えるだけにする（戻す処理が展開の費用の大半を占める）
  const behind: Date[] = [];
  const inside: Date[] = [];
  const ahead: Date[] = [];
  buildRule(input.rrule, input.dtstart).all((floating) => {
    const time = floating.getTime();
    if (time < from) {
      if (lookbehind === 0) return true;
      behind.push(floating);
      if (behind.length > lookbehind) behind.shift();
      return true;
    }
    if (time < to) {
      inside.push(floating);
      return true;
    }
    if (ahead.length >= lookahead) return false;
    ahead.push(floating);
    return ahead.length < lookahead;
  });
  return [...behind, ...inside, ...ahead].map(fromFloating);
}

/** UNTIL を「指定した瞬間の直前」に設定した RRULE を返す（「これ以降すべて」の分割に使う） */
export function withUntilBefore(rrule: string, instant: Date): string {
  const options = parseRRule(rrule);
  const until = toFloating(new Date(instant.getTime() - 1000));
  return toRRuleString({ ...options, until, count: undefined });
}

/**
 * 「これ以降すべて」で分けた後ろ側の繰り返しに引き継ぐ RRULE。COUNT は繰り返し全体の回数なので、
 * at より前の回の数だけ減らす（そのまま引き継ぐと、分けた前後で合わせた回数が元より増える）。
 * COUNT を持たないルールはそのまま返す。at は繰り返しの回であること（at 以降に 1 回以上残る）。
 */
export function continuationFrom(rrule: string, dtstart: Date, at: Date): string {
  const options = parseRRule(rrule);
  if (options.count == null) return rrule;
  const before = expandOccurrences({ rrule, dtstart, from: dtstart, to: at }).length;
  return toRRuleString({ ...options, count: options.count - before });
}

function buildRule(rrule: string, dtstart: Date): RRule {
  return new RRule({ ...parseRRule(rrule), dtstart: toFloating(dtstart) });
}
