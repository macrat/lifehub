import type { QueryClient } from '@tanstack/react-query';
import type { Expense } from '../../../shared/expenses.ts';
import type { CareLog } from '../../../shared/lemon.ts';
import type { Memo } from '../../../shared/memos.ts';
import {
  entryDay,
  sortTimeline,
  type TimelineEntry,
  timelineEntryId,
} from '../../../shared/timeline.ts';
import type { TimelineFilter } from '../../../shared/validation/timeline.ts';
import { api, ensureOk } from '../../lib/api.ts';
import {
  applyToHistories,
  findInHistories,
  type HistorySource,
  useHistory,
} from '../../lib/history.ts';
import { TIMELINE_QUERY_KEY } from './query-key.ts';

/** 行の形はサーバーと共有する（楽観的更新もこの形で組み立てる。shared/timeline.ts） */
export type { TimelineEntry } from '../../../shared/timeline.ts';

/**
 * タイムライン（`src/lib/history.ts`）。ページの分け方は立替・レモンの履歴と同じで、絞り込みはサーバーが掛ける。
 * 各ページの中は古い順なので、画面は繋いだものを逆さに（新しい順に）出す。
 */
const timeline: HistorySource<TimelineEntry, TimelineFilter> = {
  key: TIMELINE_QUERY_KEY,
  fetch: async (filter, before, signal) =>
    (
      await ensureOk(
        await api.timeline.$get({ query: { ...filter, before } }, { init: { signal } }),
      )
    ).json(),
  dayOf: (entry) => entryDay(entry),
  sort: sortTimeline,
};

/** ホームのタイムライン（`useHistory`。data は古い順） */
export function useTimeline(filter: TimelineFilter) {
  return useHistory(timeline, filter);
}

/** 読んだタイムラインのどこかにある行（編集・削除の前の値。記録の画面の履歴を読んでいないときの控え） */
export function findInTimeline(client: QueryClient, id: string): TimelineEntry | undefined {
  return findInHistories(client, timeline, id);
}

/** 1 件が 1 行になる記録（立替・レモン・メモ）の種類と、その行が持つ記録 */
type TimelineRecords = { expense: Expense; lemon: CareLog; memo: Memo };

const RECORD_OF: {
  [K in keyof TimelineRecords]: (entry: TimelineEntry) => TimelineRecords[K] | undefined;
} = {
  expense: (entry) => (entry.type === 'expense' ? entry.expense : undefined),
  lemon: (entry) => (entry.type === 'lemon' ? entry.log : undefined),
  memo: (entry) => (entry.type === 'memo' ? entry.memo : undefined),
};

/**
 * 読んだタイムラインにある記録（編集・削除の前の値）。ホームから直すときはその機能の画面の履歴を
 * 読んでいないことがあるので、各機能はまず自分の履歴を探し、無ければここを見る
 */
export function findTimelineRecord<K extends keyof TimelineRecords>(
  client: QueryClient,
  type: K,
  id: string,
): TimelineRecords[K] | undefined {
  const entry = findInTimeline(client, timelineEntryId(type, id));
  return entry && RECORD_OF[type](entry);
}

/**
 * 記録 1 件の変化（id の行が next になる。削除は null）を、読んだタイムラインに先回りして書き込む（楽観的更新）。
 * 記録の書き込み（立替・レモン・メモ）が、自分の画面の履歴と一緒に呼ぶ。
 * 予定・タスクは繰り返しの回ごとに行があり、どの回が変わるかは展開してみないと分からないので、
 * 書き込み後の取り直し（invalidate）に任せる。回 1 つだけが変わるタスクの完了・取り消しだけは先回りする。
 */
export function applyToTimeline(client: QueryClient, id: string, next: TimelineEntry | null): void {
  applyToHistories(client, timeline, id, next);
}
