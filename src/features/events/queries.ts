import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { z } from 'zod';
import { occurrenceKey } from '../../../shared/calendar.ts';
import { eventEntry } from '../../../shared/timeline.ts';
import type { updateEventSchema } from '../../../shared/validation/events.ts';
import { type ApiInputs, api, write } from '../../lib/api.ts';
import { useCreateMutation, useOptimisticMutation } from '../../lib/mutation.ts';
import { applyToTimeline, findInTimeline, recordWriteKeys } from '../timeline/queries.ts';
import { insertItem, removeItem, setCompleted, updateItem } from './optimistic.ts';
import { CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY } from './query-keys.ts';
import { writeTarget } from './recurrence-options.ts';

/** API へ送る形（日時は ISO 文字列）。サーバーの Zod スキーマの入力型から導く。 */
export type CreateEventBody = ApiInputs['events']['create'];
export type UpdateEventBody = z.input<typeof updateEventSchema>;

/** 保存されている行そのもの。繰り返しの「すべて」を編集するときに使う。 */
export function eventQueryOptions(id: string) {
  return queryOptions({
    queryKey: [...EVENTS_QUERY_KEY, id],
    queryFn: ({ signal }) => api.events.get.query({ id }, { signal }),
  });
}

/**
 * 繰り返し元の行を読む。繰り返しの「すべて」を編集し始めたとき（利用者の操作）に呼び、
 * 詳細は store から読む（`useStoreQuery(eventQueryOptions(id))`）。
 */
export function loadEvent(client: QueryClient, id: string): void {
  void client.prefetchQuery(eventQueryOptions(id));
}

/**
 * 書き込みが変えるクエリ（カレンダーの各期間と、繰り返し元の行と、全機能の記録を並べるタイムライン）。
 * タイムラインには先回りして書かず、取り直しに任せる（`applyToTimeline` の理由）
 */
const WRITE_KEYS = recordWriteKeys(CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY);

export function useCreateEvent() {
  return useCreateMutation<CreateEventBody>({
    request: write.events.create,
    keys: WRITE_KEYS,
    apply: insertItem,
  });
}

export function useUpdateEvent() {
  return useOptimisticMutation({
    request: write.events.update,
    keys: WRITE_KEYS,
    apply: updateItem,
  });
}

export function useDeleteEvent() {
  return useOptimisticMutation({
    request: write.events.delete,
    keys: WRITE_KEYS,
    apply: removeItem,
  });
}

/** タスクの完了・完了取り消し。カレンダーのリスト・ホームのタイムラインの行と詳細から呼ぶ。繰り返しでは occurrenceStart で回を指定する */
export function useToggleCompletion() {
  return useOptimisticMutation({
    // 完了日時は押した時刻。送る値と先に出す値に同じものを使い、溜めて後で送っても押した時刻が残る
    prepare: ({
      completed,
      ...target
    }: {
      id: string;
      occurrenceStart: string | null;
      completed: boolean;
    }) => ({ ...target, completedAt: completed ? new Date().toISOString() : null }),
    request: ({ id, occurrenceStart, completedAt }) => {
      const target = { id, occurrenceStart: occurrenceStart ?? undefined };
      return completedAt
        ? write.events.complete({ ...target, completedAt })
        : write.events.uncomplete(target);
    },
    keys: WRITE_KEYS,
    apply: (client, { id, occurrenceStart, completedAt }) => {
      setCompleted(client, writeTarget({ id, occurrenceStart }, 'this'), completedAt);
      toggleOnTimeline(client, id, occurrenceStart, completedAt);
    },
  });
}

/**
 * タイムラインの行（ホームでチェックを押すと、その場で完了の見た目と位置が変わる）。
 * 完了は回ごとの 1 項目だけの変化なので、ほかの書き込みと違ってタイムラインにも先回りして書ける
 */
function toggleOnTimeline(
  client: QueryClient,
  id: string,
  occurrenceStart: string | null,
  completedAt: string | null,
): void {
  const entryId = occurrenceKey({ kind: 'task', id, occurrenceStart });
  const prev = findInTimeline(client, entryId);
  if (prev?.type !== 'event' || prev.item.kind !== 'task') return;
  applyToTimeline(client, entryId, eventEntry({ ...prev.item, completedAt }));
}
