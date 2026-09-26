import {
  type QueryClient,
  queryOptions,
  type UseQueryResult,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query';
import type { InferRequestType } from 'hono/client';
import { useCallback, useEffect } from 'react';
import {
  type CalendarItem,
  type CalendarPeriod,
  inRange,
  occurrenceKey,
} from '../../../shared/calendar.ts';
import type { DateRange } from '../../../shared/date.ts';
import { eventEntry } from '../../../shared/timeline.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { monthRange, monthsInRange } from '../../lib/date.ts';
import {
  type QueryState,
  useCreateMutation,
  useOptimisticMutation,
} from '../../lib/query-client.ts';
import { applyToTimeline, findInTimeline, TIMELINE_QUERY_KEY } from '../timeline/queries.ts';
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

/**
 * 書き込みが変えるクエリ（カレンダーの各期間と、繰り返し元の行と、全機能の記録を並べるタイムライン）。
 * タイムラインには先回りして書かず、取り直しに任せる（`applyToTimeline` の理由）
 */
const WRITE_KEYS = [CALENDAR_QUERY_KEY, EVENTS_QUERY_KEY, TIMELINE_QUERY_KEY];

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
    request: ({ id, occurrenceStart, completedAt }) => ({
      method: completedAt ? ('POST' as const) : ('DELETE' as const),
      path: api.events[':id'].complete.$url({ param: { id } }).pathname,
      body: {
        occurrenceStart: occurrenceStart ?? undefined,
        completedAt: completedAt ?? undefined,
      },
    }),
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

// ---- カレンダーに並ぶ項目（予定とタスクを暦日に置いたもの） ----

/**
 * 1 か月（JST 暦月）分の項目と、その月の祝日・天気。キャッシュの単位を表示範囲ではなく暦月に固定する。
 * 月・週・日・リストのどの表示も、同じ日を見ているなら同じ月のキャッシュに当たるので、
 * 表示や日付を切り替えても手元の内容をそのまま出したまま裏で取り直せる
 * （範囲をキーにすると切り替えのたびに別のキーになり、必ず一度空になる）。
 * 予定・タスクの書き込み後は CALENDAR_QUERY_KEY を invalidate する。
 */
export function calendarMonthQueryOptions(month: string) {
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
    queryFn: async (): Promise<CalendarPeriod> => {
      const res = await ensureOk(await api.calendar.$get({ query: monthRange(month) }));
      return res.json();
    },
  });
}

/**
 * [from, to]（両端含む JST 暦日）に掛かる月のクエリを読み、`combine` でまとめる。
 * `combine` は範囲ごとに固定した関数を渡す: TanStack Query は combine が前と別の関数だと、
 * 結果が変わっていなくても描くたびに繋ぎ直し、前の結果と中身を 1 件ずつ比べ直す（replaceEqualDeep）。
 * カレンダーはドラッグの 1 コマごとに描き直すので、そのたびに全項目を繋いで比べることになる。
 */
export function useCalendarPeriods<T>(
  range: DateRange | null,
  combine: (results: UseQueryResult<CalendarPeriod>[]) => T,
): T {
  const months = range ? monthsInRange(range.from, range.to) : [];
  return useQueries({ queries: months.map(calendarMonthQueryOptions), combine });
}

/**
 * [from, to]（両端含む JST 暦日）の項目。範囲に掛かる月のキャッシュを繋いで返す。
 * 揃っていない月だけが後から埋まるので、既に持っている月は待たずに表示できる。
 * どの月もまだ手元に無いときだけ data が undefined になる（画面はそれを見て骨組みを出す）。
 * complete は範囲のすべての月が揃っているか（揃ってから位置を決めたい画面が見る）。
 */
export function useCalendarItems(
  range: DateRange,
): QueryState<CalendarItem[]> & { complete: boolean } {
  const { from, to } = range;
  const combine = useCallback(
    (results: UseQueryResult<CalendarPeriod>[]) => ({
      // 月は互いに重ならず昇順なので、範囲で絞って繋ぐだけで重複せず placementDate 順も保たれる
      // （月をまたぐ予定はサーバーが日ごとの項目にして返すため、月ごとに別の日として分かれる）
      data: results.some((result) => result.data !== undefined)
        ? results
            .flatMap((result) => result.data?.items ?? [])
            .filter((item) => inRange(item.placementDate, { from, to }))
        : undefined,
      error: results.find((result) => result.error)?.error ?? null,
      complete: results.every((result) => result.data !== undefined),
    }),
    [from, to],
  );
  return useCalendarPeriods(range, combine);
}

/**
 * カレンダー画面が、入ったときに取り直すためのもの。
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
