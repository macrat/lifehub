import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { useUserColor } from '../../users/use-user-color.ts';

/**
 * 予定の印（`VennMark`）。参加者 1 人ずつの色の円を重ねる。
 * 参加者がいない予定は、誰の予定でもないので共有の色の円 1 つ。
 */
export function ParticipantsMark({ participantIds }: { participantIds: string[] }) {
  const colorFor = useUserColor();
  const colors = participantIds.map((id) => colorFor(id).mark);
  return <VennMark colors={colors.length > 0 ? colors : [colorFor(null).mark]} />;
}
