/**
 * テストで日時を JST の壁時計の書き方で書くための略記。
 * 日付の境目（0 時）や時刻を JST で読めるよう、`2026-09-14T12:00:00` のように時差を省いて書く。
 */

/** JST の日時 → Date */
export const jst = (s: string) => new Date(`${s}+09:00`);

/** JST の日時 → ISO 8601（UTC）。API や service に渡す値の形 */
export const iso = (s: string) => jst(s).toISOString();
