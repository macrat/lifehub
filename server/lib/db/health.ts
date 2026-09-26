import { sql } from 'drizzle-orm';
import { db } from './client.ts';

/** DB に繋がるか（ヘルスチェック。`GET /api/health`）。繋がらなければ投げる */
export async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}
