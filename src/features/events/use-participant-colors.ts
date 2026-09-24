import { type ItemColors, useUserColor } from '../users/use-user-color.ts';

/**
 * 項目を塗り分ける色: 参加者 1 人ずつの色（並びは参加者の順）、誰もいなければ共有の無彩色 1 つ。
 * 印（`ParticipantsMark`）・チェックボックス（`ParticipantsCheckIcon`）・帯とブロック・下書きの枠が
 * どれもこの並びで塗り分けるので、同じ参加者なら同じ位置に同じ色が来る。
 * 用途ごとの色（fill・mark など）は呼ぶ側が選ぶ。
 */
export function useParticipantColors(participantIds: string[]): ItemColors[] {
  const colorFor = useUserColor();
  return participantIds.length > 0 ? participantIds.map((id) => colorFor(id)) : [colorFor(null)];
}
