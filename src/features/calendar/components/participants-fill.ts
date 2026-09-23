import { wedgeGradient } from '../../../lib/ui/wedge.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { colorUserOf, colorUsersOf } from '../queries.ts';

/** 共有の項目の縁の太さ（px） */
const RIM = 4;

/**
 * 帯・ブロック（月表示・終日欄の帯、時間軸の予定）の面の塗りと、その上に載せる文字色。
 * 参加者が 1 人ならそのユーザーの色、誰もいなければ共有の無彩色で塗る。
 * 2 人以上なら面は共有の無彩色のまま、縁を参加者の色で塗り分ける（`wedgeGradient`）。
 * `open` の辺には縁を付けない（週をまたいで続く帯の切れ目。そこで終わっているように見えるため）。
 * `rim` は左右の縁の太さ。呼ぶ側は文字が縁に掛からないよう、その分だけ左右の余白を足す。
 *
 * WHY 縁だけ塗り分ける: 面は文字が載るので、塗り分けると文字が読みにくくなる。
 * 縁なら文字の下を避けたまま、誰の予定かが色で分かる。
 * WHY border ではなく背景 2 枚で描く: border は中身を押し縮めるので、15 分の予定のような低いブロックでは
 * タイトルが縁に削られて読めなくなる。背景なら中身の寸法は変わらず、足りないときは文字が縁に重なる。
 * 塗り分けを全面に敷き、その上に無彩色を縁の分だけ内側に寄せて重ねる。
 */
export function useParticipantsFill(
  participantIds: string[],
  open: { start?: boolean; end?: boolean } = {},
): {
  text: string;
  sx: { bgcolor: string } | { background: string };
  rim: { start: number; end: number };
} {
  const colorFor = useUserColor();
  const own = colorFor(colorUserOf(participantIds));
  const users = colorUsersOf(participantIds);
  if (users.length < 2) {
    return { text: own.text, sx: { bgcolor: own.fill }, rim: { start: 0, end: 0 } };
  }
  const start = open.start ? 0 : RIM;
  const end = open.end ? 0 : RIM;
  const face = `linear-gradient(${own.fill}, ${own.fill}) ${start}px ${RIM}px / calc(100% - ${start + end}px) calc(100% - ${RIM * 2}px) no-repeat`;
  const rim = wedgeGradient(users.map((id) => colorFor(id).fill));
  return { text: own.text, sx: { background: `${face}, ${rim}` }, rim: { start, end } };
}
