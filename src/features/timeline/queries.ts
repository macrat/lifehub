import type { QueryClient } from '@tanstack/react-query';
import type { CareLog } from '../../../shared/lemon.ts';
import type { Memo } from '../../../shared/memos.ts';
import type { MoneyRecord } from '../../../shared/money.ts';
import {
  careLogEntry,
  entryDay,
  expenseEntry,
  memoEntry,
  sortTimeline,
  type TimelineEntry,
  timelineEntryId,
} from '../../../shared/timeline.ts';
import type { TimelineFilter } from '../../../shared/validation/timeline.ts';
import { api } from '../../lib/api.ts';
import { applyToHistories, findInHistories, type HistorySource } from '../../lib/history.ts';

/** 行の形はサーバーと共有する（楽観的更新もこの形で組み立てる。shared/timeline.ts） */
export type { TimelineEntry } from '../../../shared/timeline.ts';

/** タイムラインのクエリのキー */
const TIMELINE_QUERY_KEY = ['timeline'] as const;

/**
 * 記録の書き込みが invalidate するキー（各機能の mutation の `keys`）: 自分のクエリと、タイムライン。
 * タイムラインは全機能の記録を並べるので、どの機能の書き込みもタイムラインを取り直す。
 * タイムラインのキーは外に出さないので、記録の書き込みはこの関数でキーを作る
 */
export function recordWriteKeys(...own: (readonly unknown[])[]): (readonly unknown[])[] {
  return [...own, TIMELINE_QUERY_KEY];
}

/**
 * ホームのタイムライン（`src/lib/history.ts`。画面は `useScreenHistory` で購読する）。ページの分け方は
 * 立替・レモンの履歴と同じで、絞り込みはサーバーが掛ける。各ページの中は古い順なので、画面は繋いだものを
 * 逆さに（新しい順に）出す。
 */
export const timelineHistory: HistorySource<TimelineEntry, TimelineFilter> = {
  key: TIMELINE_QUERY_KEY,
  fetch: (filter, before, signal) => api.timeline.get.query({ ...filter, before }, { signal }),
  dayOf: (entry) => entryDay(entry),
  sort: sortTimeline,
};

/** 読んだタイムラインのどこかにある行（編集・削除の前の値。記録の画面の履歴を読んでいないときの控え） */
export function findInTimeline(client: QueryClient, id: string): TimelineEntry | undefined {
  return findInHistories(client, timelineHistory, id);
}

/** 1 件が 1 行になる記録（立替・レモン・メモ）の種類と、その行が持つ記録 */
type TimelineRecords = { expense: MoneyRecord; lemon: CareLog; memo: Memo };

/** 種類ごとの、行から記録を取り出す・記録から行を作る組 */
const RECORD_ENTRY: {
  [K in keyof TimelineRecords]: {
    recordOf: (entry: TimelineEntry) => TimelineRecords[K] | undefined;
    entryOf: (record: TimelineRecords[K]) => TimelineEntry;
  };
} = {
  expense: {
    recordOf: (entry) => (entry.type === 'expense' ? entry.expense : undefined),
    entryOf: expenseEntry,
  },
  lemon: {
    recordOf: (entry) => (entry.type === 'lemon' ? entry.log : undefined),
    entryOf: careLogEntry,
  },
  memo: {
    recordOf: (entry) => (entry.type === 'memo' ? entry.memo : undefined),
    entryOf: memoEntry,
  },
};

/**
 * 1 件が 1 行になる記録（立替・レモン・メモ）の、読んだキャッシュへの先回りの読み書き（楽観的更新）。
 * 記録を読む画面の履歴（`history`。メモのように画面を持たなければ省く）とタイムラインの両方を同じ規則で扱う。
 * - find: 編集・削除の前の値。まず自分の履歴を探し、無ければタイムラインを見る
 *   （ホームから直すときは、その機能の画面の履歴を読んでいないことがあるため）
 * - apply: 記録 1 件の変化（id の記録が next になる。削除は null）を、履歴（`applyToHistories`）と
 *   タイムライン（`applyToTimeline`）に書き込む
 * 立替の合計や状況のタイルのような、機能ごとの書き込みは各機能が足す。
 */
export function timelineRecordCache<K extends keyof TimelineRecords, F>(
  type: K,
  history?: HistorySource<TimelineRecords[K], F>,
) {
  const { recordOf, entryOf } = RECORD_ENTRY[type];
  return {
    find: (client: QueryClient, id: string): TimelineRecords[K] | undefined => {
      const found = history && findInHistories(client, history, id);
      if (found) return found;
      const entry = findInTimeline(client, timelineEntryId(type, id));
      return entry && recordOf(entry);
    },
    apply: (client: QueryClient, id: string, next: TimelineRecords[K] | null): void => {
      if (history) applyToHistories(client, history, id, next);
      applyToTimeline(client, timelineEntryId(type, id), next && entryOf(next));
    },
  };
}

/**
 * 記録 1 件の変化（id の行が next になる。削除は null）を、読んだタイムラインに先回りして書き込む（楽観的更新）。
 * 記録の書き込み（立替・レモン・メモ）が、自分の画面の履歴と一緒に呼ぶ。
 * 予定・タスクは繰り返しの回ごとに行があり、どの回が変わるかは展開してみないと分からないので、
 * 書き込み後の取り直し（invalidate）に任せる。回 1 つだけが変わるタスクの完了・取り消しだけは先回りする。
 */
export function applyToTimeline(client: QueryClient, id: string, next: TimelineEntry | null): void {
  applyToHistories(client, timelineHistory, id, next);
}
