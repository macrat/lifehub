/**
 * 全 feature の Drizzle スキーマを集約する。drizzle-kit と `db` の両方がここを参照する。
 * 新しい feature を追加したら `export * from '../../features/<name>/schema.ts'` を足す。
 */

export * from '../../features/api-keys/schema.ts';
export * from '../../features/calendar-feeds/schema.ts';
export * from '../../features/events/schema.ts';
export * from '../../features/expenses/schema.ts';
export * from '../../features/holidays/schema.ts';
export * from '../../features/lemon/schema.ts';
export * from '../../features/memos/schema.ts';
export * from '../../features/notifications/schema.ts';
export * from '../../features/push/schema.ts';
export * from '../../features/users/schema.ts';
export * from '../../features/weather/schema.ts';
export * from './oauth-schema.ts';
