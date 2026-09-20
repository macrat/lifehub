/**
 * 全 feature の Drizzle スキーマを集約する。drizzle-kit と `db` の両方がここを参照する。
 * 新しい feature を追加したら `export * from '../features/<name>/schema.ts'` を足す。
 */
export * from '../features/users/schema.ts';
