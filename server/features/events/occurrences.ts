import {
  type CalendarItem,
  type EventMaster,
  type Occurrence,
  placeOccurrence,
  sortItems,
} from '../../../shared/calendar.ts';
import {
  type DateRange,
  type InstantRange,
  instantRange,
  toDateString,
  today,
} from '../../../shared/date.ts';
import { matchesKeyword } from '../../../shared/search.ts';
import type { EventKind } from '../../../shared/validation/events.ts';
import { expandOccurrences } from '../../lib/recurrence/index.ts';
import type { EventWithParticipants } from './repository.ts';
import * as repository from './repository.ts';

export type { CalendarItem, EventMaster } from '../../../shared/calendar.ts';

/** 同時に表示する未完了の発生の上限（繰り返しタスク） */
const MAX_VISIBLE_UNCOMPLETED = 2;

/** 発生の絞り込み: 種別（kind）と、タイトルかメモの部分一致（q）。どちらも省けば絞らない */
type OccurrenceFilter = { kind?: EventKind | undefined; q?: string | undefined };

/**
 * [from, to]（両端含む JST 暦日）の項目を placementDate 順に返す。
 * 同日内は「終日の予定 → 時刻のある項目（予定の開始、タスクの開始または期限）→ 時刻の無いタスク」。
 * filter は `listOccurrences` にそのまま渡す（種別とキーワードの絞り込み）。
 */
export async function listItems(
  range: DateRange,
  now: Date = new Date(),
  filter: OccurrenceFilter = {},
): Promise<CalendarItem[]> {
  const occurrences = await listOccurrences(range, now, filter);
  return sortItems(occurrences.flatMap((occurrence) => placeOccurrence(occurrence, range, now)));
}

/**
 * [from, to]（両端含む JST 暦日）に掛かる発生。繰り返しを展開し、実体化された回を反映する。
 * 暦日への割り当て（`placeOccurrence`）はしないので、複数日の予定も 1 件のまま出る。
 * カレンダーは暦日に置いた `listItems` を読み、ics の配信（calendar-feeds）は日ごとに割らない
 * この形を読む（iCalendar の VEVENT は予定 1 件が 1 つで、日ごとには分かれないため）。
 *
 * `q` を渡すとタイトルかメモが当たる回だけを返す（「この回だけ」で直した回は回そのものの値で見る）。
 * `kind` を渡すとその種別だけを展開する。展開は繰り返し 1 つにつき期間の長さぶん走るので、
 * 片方しか要らない呼び出し（ics の配信は 1 年以上を読み、予定しか出さない）が、
 * 捨てるものを展開してから捨てずに済む。
 */
export async function listOccurrences(
  range: DateRange,
  now: Date = new Date(),
  { kind, q }: OccurrenceFilter = {},
): Promise<Occurrence[]> {
  const instants = instantRange(range);
  const rows = await repository.findCalendarRows(instants.from, instants.to, q);

  // 繰り返し元・単発の行と、それに属する実体化された回に仕分ける
  const masters: EventWithParticipants[] = [];
  const bySeries = new Map<string, Map<number, EventWithParticipants>>();
  for (const row of rows) {
    if (!row.seriesId || !row.occurrenceStart) {
      masters.push(row);
      continue;
    }
    const inner = bySeries.get(row.seriesId) ?? new Map<number, EventWithParticipants>();
    inner.set(row.occurrenceStart.getTime(), row);
    bySeries.set(row.seriesId, inner);
  }

  const result: Occurrence[] = [];
  for (const master of masters) {
    if (kind && master.kind !== kind) continue;
    const ctx: ExpandContext = { master, occurrences: bySeries.get(master.id) ?? new Map() };
    result.push(...(master.kind === 'event' ? expandEvent(ctx, instants) : expandTask(ctx, now)));
  }
  return result.filter((o) => matchesKeyword(q, o.title, o.note));
}

/** EventMaster に載る列。DB から読んだ行も、保存したばかりの値（読み直さない）もこの形で渡せる */
type MasterFields = Pick<EventWithParticipants, keyof EventMaster>;

/** 応答の EventMaster を組み立てる唯一の場所（日時を ISO 文字列にし、応答に出す列だけを選ぶ） */
export function toMaster(row: MasterFields): EventMaster {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    allDay: row.allDay,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    location: row.location,
    note: row.note,
    participantIds: row.participantIds,
    rrule: row.rrule,
    remindStartMinutes: row.remindStartMinutes,
    remindEndMinutes: row.remindEndMinutes,
  };
}

/** 繰り返しの基準日時（DTSTART）: starts_at、無ければ ends_at */
export function baseOf(row: { startsAt: Date | null; endsAt: Date | null }): Date | null {
  return row.startsAt ?? row.endsAt;
}

/** 繰り返し元の日時を、基準日時が occurrenceStart になるようずらしたもの。開始と終了の間隔は保つ */
export function shiftTo(
  master: { startsAt: Date | null; endsAt: Date | null },
  occurrenceStart: Date,
): { startsAt: Date | null; endsAt: Date | null } {
  const base = baseOf(master);
  const delta = base ? occurrenceStart.getTime() - base.getTime() : 0;
  return {
    startsAt: master.startsAt ? new Date(master.startsAt.getTime() + delta) : null,
    endsAt: master.endsAt ? new Date(master.endsAt.getTime() + delta) : null,
  };
}

/** 繰り返しの回が実在するか（ルール上の発生の基準日時か） */
export function occurrenceExists(
  master: { rrule: string | null; startsAt: Date | null; endsAt: Date | null },
  at: Date,
): boolean {
  const base = baseOf(master);
  if (!master.rrule || !base) return false;
  const hits = expandOccurrences({
    rrule: master.rrule,
    dtstart: base,
    from: at,
    to: new Date(at.getTime() + 1000),
  });
  return hits.length > 0;
}

// ---- 内部 ----

type ExpandContext = {
  master: EventWithParticipants;
  /** 実体化された回（基準日時のミリ秒 → 行） */
  occurrences: Map<number, EventWithParticipants>;
};

/** ルール上の回の値（実体化されていない回）、または実体化された行の値から発生を組み立てる */
function buildOccurrence(
  ctx: ExpandContext,
  occurrenceStart: Date | null,
  row: EventWithParticipants | undefined,
): Occurrence {
  const { master } = ctx;
  if (!row) {
    const shifted = occurrenceStart ? shiftTo(master, occurrenceStart) : master;
    return {
      ...toMaster(master),
      startsAt: shifted.startsAt?.toISOString() ?? null,
      endsAt: shifted.endsAt?.toISOString() ?? null,
      occurrenceStart: occurrenceStart?.toISOString() ?? null,
      isRecurring: master.rrule !== null,
      isModified: false,
    };
  }
  return {
    ...toMaster(row),
    id: master.id,
    rrule: master.rrule,
    occurrenceStart: row.occurrenceStart?.toISOString() ?? null,
    isRecurring: true,
    isModified: differsFromRule(ctx, row),
  };
}

/** 実体化された行が、ルールから導かれる値（日時をずらした繰り返し元）と違うか */
function differsFromRule(ctx: ExpandContext, row: EventWithParticipants): boolean {
  const { master } = ctx;
  if (!row.occurrenceStart) return true;
  const shifted = shiftTo(master, row.occurrenceStart);
  const sameInstant = (a: Date | null, b: Date | null) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  return !(
    row.title === master.title &&
    row.allDay === master.allDay &&
    sameInstant(row.startsAt, shifted.startsAt) &&
    sameInstant(row.endsAt, shifted.endsAt) &&
    row.location === master.location &&
    row.note === master.note &&
    row.remindStartMinutes === master.remindStartMinutes &&
    row.remindEndMinutes === master.remindEndMinutes &&
    sameSet(row.participantIds, master.participantIds)
  );
}

function overlaps(startsAt: Date, endsAt: Date, range: InstantRange): boolean {
  if (startsAt.getTime() >= range.to.getTime()) return false;
  if (endsAt.getTime() > range.from.getTime()) return true;
  // 長さ 0 の予定は開始が範囲内なら含める
  return endsAt.getTime() === startsAt.getTime() && startsAt.getTime() >= range.from.getTime();
}

/** 予定: [from, to) と重なる発生 */
function expandEvent(ctx: ExpandContext, range: InstantRange): Occurrence[] {
  const { master } = ctx;
  if (!master.startsAt || !master.endsAt) return [];
  const duration = master.endsAt.getTime() - master.startsAt.getTime();
  const starts = master.rrule
    ? expandOccurrences({
        rrule: master.rrule,
        dtstart: master.startsAt,
        from: new Date(range.from.getTime() - duration),
        to: range.to,
      })
    : [null];

  const result: Occurrence[] = [];
  const seen = new Set<number>();
  const push = (occurrenceStart: Date | null, row: EventWithParticipants | undefined) => {
    if (row?.cancelled) return;
    const occurrence = buildOccurrence(ctx, occurrenceStart, row);
    if (!occurrence.startsAt || !occurrence.endsAt) return;
    if (!overlaps(new Date(occurrence.startsAt), new Date(occurrence.endsAt), range)) return;
    result.push(occurrence);
  };
  for (const start of starts) {
    if (start) seen.add(start.getTime());
    push(start, start ? ctx.occurrences.get(start.getTime()) : undefined);
  }
  // 範囲外の回が「この回だけ」の変更で範囲内に移動している場合
  for (const [key, row] of ctx.occurrences) {
    if (seen.has(key)) continue;
    push(row.occurrenceStart, row);
  }
  return result;
}

/**
 * タスク: 繰り返しは、取り消されていない未完了の発生のうち基準日時が最も早い 2 つだけを表示する。
 * 未完了の発生 N は発生 N+2 の暦日が到来した時点で放棄される（保存せず計算で導く）。
 * 放棄を時刻ではなく暦日で判定するのは、未完了のタスクが今日の位置に繰り越される規則と揃えるため。
 * 時刻で判定すると、今日の回が来るまでの間だけ 2 日前と 1 日前の回が並び、今日の回が出ない。
 */
function expandTask(ctx: ExpandContext, now: Date): Occurrence[] {
  const { master } = ctx;
  if (!master.rrule) return [buildOccurrence(ctx, null, undefined)];
  const base = baseOf(master);
  if (!base) return [];

  // 表示する回は今と繰り返しだけで決まり、読む範囲によらない（暦日に置いた後で範囲に絞る）。
  // 取り出すのは今の前 2 つと後ろの数個（1 回の走査で済ませる）。
  // 2 つ前まで遡れば足りるのは、放棄されずに残る最初の回が「今日以前の最後の発生の 1 つ前」で、
  // 今以後の最初の発生はそこから高々 2 つ先にあるため（今日の回がまだ来ていなければ 2 つ先、
  // 来ていれば 1 つ先）。それより前の回は必ず放棄済みで、完了した回は下の走査外の処理が拾う。
  // 後ろは、飛ばす回（完了・取り消した回。今より後の実体化された回の数を超えない）と未完了の 2 つに、
  // 最後の未完了の回の放棄を判定する 2 つ先までを足した数だけ読めば足りる。
  const ahead = [...ctx.occurrences.keys()].filter((at) => at >= now.getTime()).length;
  const bases = expandOccurrences({
    rrule: master.rrule,
    dtstart: base,
    from: now,
    to: now,
    lookbehind: MAX_VISIBLE_UNCOMPLETED,
    lookahead: ahead + MAX_VISIBLE_UNCOMPLETED * 2,
  });

  const result: Occurrence[] = [];
  const emitted = new Set<number>();
  const todayDate = today(now);
  let visibleUncompleted = 0;
  for (let n = 0; visibleUncompleted < MAX_VISIBLE_UNCOMPLETED; n++) {
    const at = bases[n];
    if (!at) break;
    const row = ctx.occurrences.get(at.getTime());
    if (row?.cancelled) continue;
    if (row?.completedAt) {
      emitted.add(at.getTime());
      result.push(buildOccurrence(ctx, at, row));
      continue;
    }
    const twoAhead = bases[n + MAX_VISIBLE_UNCOMPLETED];
    const abandoned = twoAhead !== undefined && toDateString(twoAhead) <= todayDate;
    if (abandoned) continue;
    visibleUncompleted++;
    emitted.add(at.getTime());
    result.push(buildOccurrence(ctx, at, row));
  }

  // 走査の外で完了した回（走査の打ち切り後や、既に放棄された回の完了）も完了日に表示する
  for (const [key, row] of ctx.occurrences) {
    if (emitted.has(key) || row.cancelled || !row.completedAt) continue;
    result.push(buildOccurrence(ctx, row.occurrenceStart, row));
  }
  return result;
}
