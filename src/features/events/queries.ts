import { queryOptions, useQueries, useQueryClient } from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { useEffect } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { monthRange, monthsInRange } from '../../lib/date.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { insertItem, removeItem, setCompleted, updateItem } from './optimistic.ts';
import { CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY } from './query-keys.ts';
import { type WriteTarget, writeTarget } from './recurrence-options.ts';

/** API へ送る形（日時は ISO 文字列）。サーバーの Zod スキーマの入力型から導く。 */
export type CreateEventBody = InferRequestType<typeof api.events.$post>['json'];
export type UpdateEventBody = InferRequestType<(typeof api.events)[':id']['$put']>['json'];

/** 保存されている行そのもの。繰り返しの「すべて」を編集するときに使う。 */
export function eventQueryOptions(id: string) {
  return queryOptions({
    queryKey: [...EVENTS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await ensureOk(await api.events[':id'].$get({ param: { id } }));
      return res.json();
    },
  });
}

/** 書き込みが変えるクエリ（カレンダーの各期間と、繰り返し元の行） */
const WRITE_KEYS = [CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY];

export function useCreateEvent() {
  return useCreateMutation<CreateEventBody>({
    request: (input) => ({
      method: 'POST' as const,
      path: api.events.$url().pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: insertItem,
  });
}

export function useUpdateEvent() {
  return useOptimisticMutation({
    request: ({ id, ...input }: UpdateEventBody & { id: string }) => ({
      method: 'PUT' as const,
      path: api.events[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: updateItem,
  });
}

export function useDeleteEvent() {
  return useOptimisticMutation({
    request: ({ id, ...input }: WriteTarget) => ({
      method: 'DELETE' as const,
      path: api.events[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    keys: WRITE_KEYS,
    apply: removeItem,
  });
}

/** タスクの完了・完了取り消し。カレンダー／ホームのカードから直接呼ぶ。繰り返しでは occurrenceStart で回を指定する */
export function useToggleCompletion() {
  return useOptimisticMutation({
    request: ({
      id,
      occurrenceStart,
      completed,
    }: {
      id: string;
      occurrenceStart: string | null;
      completed: boolean;
    }) => ({
      method: completed ? ('POST' as const) : ('DELETE' as const),
      path: api.events[':id'].complete.$url({ param: { id } }).pathname,
      body: { occurrenceStart: occurrenceStart ?? undefined },
    }),
    keys: WRITE_KEYS,
    apply: (client, { id, occurrenceStart, completed }) =>
      setCompleted(client, writeTarget({ id, occurrenceStart }, 'this'), completed),
  });
}

// ---- カレンダーに並ぶ項目（予定とタスクを暦日に置いたもの） ----

/** 項目の形はサーバーと共有する（楽観的更新もこの形で組み立てる。shared/calendar.ts） */
export type { CalendarItem } from '../../../shared/calendar.ts';
export type CalendarEventItem = Extract<CalendarItem, { kind: 'event' }>;
export type CalendarTaskItem = Extract<CalendarItem, { kind: 'task' }>;

/**
 * 1 か月（JST 暦月）分の項目。キャッシュの単位を表示範囲ではなく暦月に固定する。
 * 月・週・日・リストのどの表示も、同じ日を見ているなら同じ月のキャッシュに当たるので、
 * 表示や日付を切り替えても手元の内容をそのまま出したまま裏で取り直せる
 * （範囲をキーにすると切り替えのたびに別のキーになり、必ず一度空になる）。
 * 予定・タスクの書き込み後は CALENDAR_QUERY_KEY を invalidate する。
 */
function calendarMonthQueryOptions(month: string) {
  return queryOptions({
    queryKey: [...CALENDAR_QUERY_KEY, month],
    /**
     * 一度取った月は古くならない。取り直しは画面に入ったとき（`useRefreshCalendarItems`）と
     * 書き込みの後（`useOptimisticMutation` の invalidate）にだけ起こす。
     * WHY: 月・週・日・リストの切り替えは同じ月のキャッシュを読むだけで、内容は変わらない。
     * 既定（staleTime: 0）だと切り替えのたびに読む側が付け替わって、そこで毎回取り直しになる。
     * WHY NOT 'static': 'static' は invalidate や refetch でも取り直さなくなり、書き込み後に
     * サーバーの値へ合わせられない。
     */
    staleTime: Number.POSITIVE_INFINITY,
    // 返り値を共通の型で受けることで、サーバーの応答と楽観的更新の形がずれたら型検査で気づける
    queryFn: async (): Promise<CalendarItem[]> => {
      const res = await ensureOk(await api.events.$get({ query: monthRange(month) }));
      return res.json();
    },
  });
}

/**
 * [from, to]（両端含む JST 暦日）の項目。範囲に掛かる月のキャッシュを繋いで返す。
 * 揃っていない月だけが後から埋まるので、既に持っている月は待たずに表示できる。
 * どの月もまだ手元に無いときだけ data が undefined になる（画面はそれを見て骨組みを出す）。
 * complete は範囲のすべての月が揃っているか（揃ってから位置を決めたい画面が見る）。
 */
export function useCalendarItems(range: {
  from: DateString;
  to: DateString;
}): QueryState<CalendarItem[]> & { complete: boolean } {
  return useQueries({
    queries: monthsInRange(range.from, range.to).map(calendarMonthQueryOptions),
    combine: (results) => ({
      // 月は互いに重ならず昇順なので、範囲で絞って繋ぐだけで重複せず placementDate 順も保たれる
      // （月をまたぐ予定はサーバーが日ごとの項目にして返すため、月ごとに別の日として分かれる）
      data: results.some((result) => result.data !== undefined)
        ? results
            .flatMap((result) => result.data ?? [])
            .filter((item) => item.placementDate >= range.from && item.placementDate <= range.to)
        : undefined,
      error: results.find((result) => result.error)?.error ?? null,
      complete: results.every((result) => result.data !== undefined),
    }),
  });
}

/**
 * カレンダーの項目を出す画面（カレンダー・ホームの「今日」カード）が、入ったときに取り直すためのもの。
 * マウントの 1 回だけ取り直すので、同じ画面に留まる限り（表示や日付の切り替え）取り直しは起きない。
 * 画面を行き来したとき（マウントし直す）と、再読み込みしたとき（読み込み直す）だけサーバーに問い合わせる。
 *
 * 出している月はその場で取り直し、キャッシュにあるだけの月は古い印を付ける（次に出すときに取り直す）。
 * cancelRefetch: false = 始まっている取得はそのまま使う（初回表示の取得を中断して二重に投げない）。
 */
export function useRefreshCalendarItems() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_KEY }, { cancelRefetch: false });
  }, [queryClient]);
}
