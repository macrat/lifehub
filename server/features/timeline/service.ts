import {
  addDays,
  type DateRange,
  diffDays,
  instantRange,
  startOfDate,
  startOfDay,
  toDateString,
} from '../../../shared/date.ts';
import {
  entryDay,
  entryStart,
  eventEntry,
  sortTimeline,
  type TimelineEntry,
} from '../../../shared/timeline.ts';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import type { TimelineQuery } from '../../../shared/validation/timeline.ts';
import type { DailyWeather } from '../../../shared/weather.ts';
import type { TimelineSource } from '../../lib/timeline-source.ts';
import * as events from '../events/service.ts';
import * as expenses from '../expenses/service.ts';
import { listHolidays } from '../holidays/service.ts';
import * as lemon from '../lemon/service.ts';
import * as memos from '../memos/service.ts';
import { listDailyWeather } from '../weather/service.ts';

/**
 * 1 ページの件数の目安。ページは日の途中では切らないので、これより多くなることがある
 * （立替・レモンの履歴の `HISTORY_PAGE_SIZE` と同じ考え方）
 */
const PAGE_SIZE = 50;

/** 最新のページに出す未来の幅。これより先の予定はまだ出さない */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * 予定・タスク以外の記録の出どころ。新しい種類の記録はここに 1 行足す。
 * 日ごとのタイムライン（`listDays`）は予定・タスクだけをカレンダーと同じ規則で置くので、分けて持つ
 */
const recordSources = {
  expense: expenses.timelineSource,
  lemon: lemon.timelineSource,
  memo: memos.timelineSource,
} satisfies Record<Exclude<TimelineEntry['type'], 'event'>, TimelineSource>;

/** タイムラインに並べる記録の出どころ */
const sources: TimelineSource[] = [events.timelineSource, ...Object.values(recordSources)];

/**
 * ホームのタイムラインの 1 ページ（古い順。画面は逆さに出す）。予定・タスク・立替・レモン・メモを 1 本に並べる。
 *
 * ページの分け方は立替・レモンの履歴（`HistoryPage`）と同じで、日の途中では切らない。記録の種類ごとに
 * 新しいほうから PAGE_SIZE 件の日時を集め、全体で PAGE_SIZE 件目の日からをこのページにする。
 * 日数ではなく件数で区切るので、記録の無い期間が続いても空のページを読み続けない。
 * WHY NOT 種類ごとに別々のページを読んで画面で繋ぐ: 種類ごとに読み進んだ位置が違うので、
 * どこまで出してよいかを画面が決めることになり、並びの規則が画面とサーバーに割れる。
 *
 * 最新のページ（before なし）は 24 時間先までに始まるものを出し、未完了で開始を過ぎたか日時を持たないタスクを一番上に置く
 * （日付で絞り込んでいるときは、一番上のタスクは置く日を持たないので出さない）。
 */
export async function getTimelinePage(
  query: TimelineQuery,
  now: Date = new Date(),
): Promise<HistoryPage<TimelineEntry>> {
  const { q, since, until, before } = query;
  const upper = earliest(
    before ? startOfDate(before) : new Date(now.getTime() + LOOKAHEAD_MS),
    until ? startOfDate(addDays(until, 1)) : null,
  );
  const floor = since ? startOfDate(since) : new Date(0);
  if (upper.getTime() <= floor.getTime()) return { items: [], nextCursor: null };

  const instants = (
    await Promise.all(sources.map((source) => source.recentInstants(upper, q, PAGE_SIZE)))
  )
    .flat()
    .sort((a, b) => b.getTime() - a.getTime());
  // 全体で PAGE_SIZE 件目の日の始まりから。それが無ければ残りすべて
  const boundary = instants[PAGE_SIZE - 1];
  const lower = boundary ? latest(startOfDay(boundary), floor) : floor;
  const range = { from: lower, to: upper };

  const includeUndated = before === undefined && since === undefined && until === undefined;
  // 最新のページの上端（24 時間先・until の終わり）は、行の日時ではなく始まりで見る（`entryStart`）。
  // 終日の予定は置く日の終わりに置くので、行の日時で見ると明日の終日の予定や、until を越えて続く予定が出なくなる。
  // 続きのページは上のページと行の日時で分け合うので、行の日時で見る（同じ行を 2 つのページに出さない）
  const inRange = (entry: TimelineEntry) => {
    if (entry.at === null) return includeUndated;
    const reach = (before === undefined ? entryStart(entry) : null) ?? entry.at;
    return new Date(entry.at) >= lower && new Date(reach) < upper;
  };
  const entries = (await Promise.all(sources.map((source) => source.entries(range, q, now))))
    .flat()
    .filter(inRange);

  return {
    items: sortTimeline(entries),
    nextCursor: boundary && lower.getTime() > floor.getTime() ? toDateString(lower) : null,
  };
}

function earliest(a: Date, b: Date | null): Date {
  return b && b.getTime() < a.getTime() ? b : a;
}

function latest(a: Date, b: Date): Date {
  return b.getTime() > a.getTime() ? b : a;
}

/** 日ごとのタイムライン（`listDays`）の 1 日: その日の記録と、祝日か・日ごとの天気（予報も記録も無ければ null） */
export type TimelineDay = {
  date: DateString;
  holiday: boolean;
  weather: DailyWeather | null;
  entries: TimelineEntry[];
};

/** 日ごとのタイムラインで絞れる記録の種類。予定とタスクは分けて絞れる */
export type DayEntryType = 'event' | 'task' | keyof typeof recordSources;

/**
 * [from, to]（両端を含む JST 暦日）のタイムラインを日ごとに分けたもの（日付順。記録の無い日も含む）。MCP が読む。
 * 記録は q（記録の文字の部分一致）と types（記録の種類）で絞れる。
 *
 * 予定・タスクはカレンダーと同じく暦日に置く（`listItems`）: 複数日の予定は日ごとに 1 件ずつ出し、
 * 未完了のタスクは開始が過ぎたか日時を持たなければ今日に置く。
 * WHY NOT ホームのタイムライン（`getTimelinePage`）と同じく 1 回を 1 行にする: 行は置く日を 1 つしか持たないので、
 * 「10/2 の予定」を訊かれたとき、10/1 から続く旅行が 10/1 の側にしか出ず、10/2 を読んでも見つからない。
 * 日を指して読む相手には、その日に掛かる予定がすべてその日に出るほうが正しい。
 * 1 日の中はホームのタイムラインと同じ並び（`sortTimeline`。行の日時は `eventEntry`）。
 * WHY: 同じ記録が、ホームの画面と AI に訊いたときとで違う順に並ばないようにする。
 */
export async function listDays(
  range: DateRange,
  { q, types }: { q?: string | undefined; types?: readonly DayEntryType[] | undefined },
  now: Date = new Date(),
): Promise<TimelineDay[]> {
  const wants = (type: DayEntryType) => !types || types.includes(type);
  const instants = instantRange(range);
  const records = Object.entries(recordSources).flatMap(([type, source]) =>
    wants(type as DayEntryType) ? [source.entries(instants, q, now)] : [],
  );
  // 予定とタスクの片方だけが要るなら、もう片方は展開しない
  const kind = wants('event') ? (wants('task') ? undefined : 'event') : 'task';
  const [items, holidays, weather, ...recordEntries] = await Promise.all([
    wants('event') || wants('task') ? events.listItems(range, now, { kind, q }) : [],
    listHolidays(range),
    listDailyWeather(range),
    ...records,
  ]);
  const eventEntries = items.map((item) => ({
    date: item.placementDate,
    entry: eventEntry(item, now),
  }));
  const byDay = Map.groupBy(
    [
      ...eventEntries,
      ...recordEntries.flat().map((entry) => ({ date: entryDay(entry, now), entry })),
    ],
    ({ date }) => date,
  );
  const holidaySet = new Set(holidays);
  const weatherByDay = new Map(weather.map((day) => [day.date, day]));
  return Array.from({ length: diffDays(range.from, range.to) + 1 }, (_, i) => {
    const date = addDays(range.from, i);
    return {
      date,
      holiday: holidaySet.has(date),
      weather: weatherByDay.get(date) ?? null,
      entries: sortTimeline((byDay.get(date) ?? []).map(({ entry }) => entry)),
    };
  });
}
