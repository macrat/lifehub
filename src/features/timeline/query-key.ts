/**
 * タイムライン（ホーム）のクエリのキー。タイムラインは全機能の記録を並べるので、どの機能の書き込みも
 * このキーを invalidate する（各機能の mutation の `keys`）。
 * queries.ts に置くと、それを読む機能のクエリとタイムラインの部品（機能の詳細を読む）で import が一巡するので、
 * 何も読まないこの file に分ける（`events/query-keys.ts` と同じ）。
 */
export const TIMELINE_QUERY_KEY = ['timeline'] as const;
