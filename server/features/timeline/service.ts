import { addDays, startOfDate, toDateString } from '../../../shared/date.ts';
import {
  careLogEntry,
  eventEntry,
  expenseEntry,
  memoEntry,
  sortTimeline,
  type TimelineEntry,
} from '../../../shared/timeline.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import type { TimelineQuery } from '../../../shared/validation/timeline.ts';
import * as events from '../events/service.ts';
import * as expenses from '../expenses/service.ts';
import * as lemon from '../lemon/service.ts';
import * as memos from '../memos/service.ts';

/**
 * 1 ページの件数の目安。ページは日の途中では切らないので、これより多くなることがある
 * （立替・レモンの履歴の `HISTORY_PAGE_SIZE` と同じ考え方）
 */
const PAGE_SIZE = 50;

/** 最新のページに出す未来の幅。これより先の予定はまだ出さない */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/** 各 feature の、日時が before より前の新しいほうから limit 件の日時（ページの区切りを決めるのに使う） */
const recentInstantSources = [
  events.recentTimelineInstants,
  expenses.recentTimelineInstants,
  lemon.recentTimelineInstants,
  memos.recentTimelineInstants,
];

/**
 * ホームのタイムラインの 1 ページ（古い順。画面は逆さに出す）。予定・タスク・立替・レモン・メモを 1 本に並べる。
 *
 * ページの分け方は立替・レモンの履歴（`HistoryPage`）と同じで、日の途中では切らない。記録の種類ごとに
 * 新しいほうから PAGE_SIZE 件の日時を集め、全体で PAGE_SIZE 件目の日からをこのページにする。
 * 日数ではなく件数で区切るので、記録の無い期間が続いても空のページを読み続けない。
 * WHY NOT 種類ごとに別々のページを読んで画面で繋ぐ: 種類ごとに読み進んだ位置が違うので、
 * どこまで出してよいかを画面が決めることになり、並びの規則が画面とサーバーに割れる。
 *
 * 最新のページ（before なし）は 24 時間先までを出し、未完了で開始を過ぎたか日時を持たないタスクを一番上に置く
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
    await Promise.all(recentInstantSources.map((source) => source(upper, q, PAGE_SIZE)))
  )
    .flat()
    .sort((a, b) => b.getTime() - a.getTime());
  // 全体で PAGE_SIZE 件目の日の始まりから。それが無ければ残りすべて
  const boundary = instants[PAGE_SIZE - 1];
  const lower = boundary ? latest(startOfDate(toDateString(boundary)), floor) : floor;
  const range = { from: lower, to: upper };

  const [items, expenseRows, logs, memoRows] = await Promise.all([
    events.listTimelineItems(range, q, now),
    expenses.listForTimeline(range, q),
    lemon.listForTimeline(range, q),
    memos.listForTimeline(range, q),
  ]);
  const includeUndated = before === undefined && since === undefined && until === undefined;
  const inRange = (entry: TimelineEntry) =>
    entry.at === null
      ? includeUndated
      : new Date(entry.at).getTime() >= lower.getTime() &&
        new Date(entry.at).getTime() < upper.getTime();
  const entries = [
    ...items.map((item) => eventEntry(item, now)),
    ...expenseRows.map(expenseEntry),
    ...logs.map(careLogEntry),
    ...memoRows.map(memoEntry),
  ].filter(inRange);

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
