import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { colorUsersOf } from '../queries.ts';

/** 予定の印（`VennMark`）。参加者 1 人ずつの色の円を重ねる（`colorUsersOf`） */
export function ParticipantsMark({ participantIds }: { participantIds: string[] }) {
  const colorFor = useUserColor();
  return <VennMark colors={colorUsersOf(participantIds).map((id) => colorFor(id).mark)} />;
}
