import { queryOptions } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { api, ensureOk } from '../../lib/api.ts';

export type DashboardCard = InferResponseType<typeof api.dashboard.$get, 200>[number];
export type DashboardCardOf<Id extends DashboardCard['id']> = Extract<DashboardCard, { id: Id }>;

/** ホームのカード一覧。各 feature の書き込み後は ['dashboard'] を invalidate する。 */
export const dashboardQueryOptions = queryOptions({
  queryKey: ['dashboard'],
  queryFn: async () => (await ensureOk(await api.dashboard.$get())).json(),
});
