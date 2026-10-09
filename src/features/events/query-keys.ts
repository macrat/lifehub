/**
 * 予定・タスクのクエリのキー。クエリ（queries.ts）と楽観的更新（optimistic.ts）の両方が使い、
 * カレンダーの項目の取得（`src/features/calendar/queries.ts`）もこのキーで読む（書き込みが invalidate するのはこちら）。
 * queries.ts は optimistic.ts を読むので、キーを queries.ts に置くと import が一巡する。
 */

/** 保存されている行そのもの（繰り返し元の編集に使う） */
export const EVENTS_QUERY_KEY = ['events'] as const;

/** カレンダーに並ぶ項目（JST 暦月ごと）。予定・タスクの書き込み後はこのキーを invalidate する */
export const CALENDAR_QUERY_KEY = ['calendar'] as const;
