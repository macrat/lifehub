import { wedgeBackground } from '../../../lib/ui/wedge.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { colorUserOf, colorUsersOf } from '../queries.ts';

/**
 * 帯・ブロック（月表示・終日欄の帯、時間軸の予定）の塗りと、その上に載せる文字色。
 * 参加者 1 人ずつの色で面を塗り分ける（`wedgeBackground`）。誰もいなければ共有の無彩色。
 * WHY 面ごと塗り分ける: 帯は低く、縁だけだと色が細い線になって誰の予定か見分けにくい。
 * 塗り分ける色はどれも明度が同じ fill なので、境目をまたいでも文字色 1 つで読める。
 */
export function useParticipantsFill(participantIds: string[]): {
  text: string;
  background: string;
} {
  const colorFor = useUserColor();
  const users = colorUsersOf(participantIds);
  return {
    text: colorFor(colorUserOf(participantIds)).text,
    background: wedgeBackground(users.map((id) => colorFor(id).fill)),
  };
}
