import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { useUserColor } from '../../users/use-user-color.ts';

/**
 * 予定の印（`VennMark`）。参加者 1 人ずつの色の円を重ね、重なりは共有の予定と同じ無彩色にする。
 * 参加者がいない予定は、誰の予定でもないので共有の色の円 1 つ。
 */
export function ParticipantsMark({ participantIds }: { participantIds: string[] }) {
  const colorFor = useUserColor();
  const shared = colorFor(null).fill;
  const colors = participantIds.map((id) => colorFor(id).fill);
  return <VennMark colors={colors.length > 0 ? colors : [shared]} overlap={shared} />;
}
