import type { SvgIconProps } from '@mui/material/SvgIcon';
import { SplitCheckboxIcon } from '../../../lib/ui/SplitCheckboxIcon.tsx';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import { useParticipantColors } from '../use-participant-colors.ts';

/**
 * 予定の印（`VennMark`）。参加者 1 人ずつの色の円を重ねる（`useParticipantColors`）。
 * `size` は描く大きさ（px）。省略すると一覧の行の印の大きさ
 */
export function ParticipantsMark({
  participantIds,
  size,
}: {
  participantIds: string[];
  size?: number;
}) {
  const colors = useParticipantColors(participantIds);
  return <VennMark colors={colors.map((c) => c.mark)} size={size} />;
}

/**
 * タスクのチェックボックスのアイコン（`SplitCheckboxIcon`）。参加者 1 人ずつの色で塗り分ける。
 * 色の並びは `ParticipantsMark` と同じなので、同じ参加者なら印とチェックボックスで同じ位置に同じ色が来る
 */
export function ParticipantsCheckIcon({
  participantIds,
  ...props
}: SvgIconProps & { participantIds: string[]; checked: boolean }) {
  const colors = useParticipantColors(participantIds);
  return <SplitCheckboxIcon colors={colors.map((c) => c.line)} {...props} />;
}
