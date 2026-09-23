/**
 * 全 feature の Drizzle スキーマを集約する。drizzle-kit と `db` の両方がここを参照する。
 * 新しい feature を追加したら `export * from '../features/<name>/schema.ts'` を足す。
 */

export * from '../features/calendar-feeds/schema.ts';
export * from '../features/events/schema.ts';
export * from '../features/expenses/schema.ts';
export * from '../features/holidays/schema.ts';
export * from '../features/lemon/schema.ts';
export * from '../features/users/schema.ts';
export * from '../features/weather/schema.ts';
export * from './mcp/schema.ts';
export * from './notifications/schema.ts';
export * from './push/schema.ts';
