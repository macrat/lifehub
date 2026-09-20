import { defineWidget } from '../../lib/dashboard/types.ts';
import { getStatus } from './service.ts';

/** レモン: 水やり・葉水それぞれの最終実施日からの経過日数 */
export const lemonWidget = defineWidget({
  id: 'lemon',
  order: 40,
  load: async ({ now }) =>
    (await getStatus(now)).filter((s) => s.careType === 'water' || s.careType === 'mist'),
});
