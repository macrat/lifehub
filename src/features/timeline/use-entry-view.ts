import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType } from 'react';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { formatTimelineTime } from '../../lib/date.ts';
import { ADD_KINDS } from '../add/kinds.ts';
import type { CalendarTaskItem } from '../events/queries.ts';
import { participantColors } from '../events/use-participant-colors.ts';
import { formatYen } from '../expenses/format.ts';
import { CARE_TYPE_ICONS } from '../lemon/care-type-icons.tsx';
import { leadingCareType } from '../lemon/care-type-priority.ts';
import { useUserColor } from '../users/use-user-color.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import type { TimelineEntry } from './queries.ts';

/** タイムラインの 1 行に出すもの。行の部品はこれを並べるだけにする */
export type EntryView = {
  /** 左の丸の背景。人の色（複数なら塗り分ける）、誰のものでもない記録は無彩色 */
  colors: string[];
  /** 左の丸に置くアイコン。予定・立替・メモは追加ボタンと同じもの */
  icon: ComponentType<SvgIconProps>;
  /** タスクなら左の丸が完了のチェックボックスになる（中にチェックの印を出す） */
  task: CalendarTaskItem | null;
  /** 上段: 予定・タスクはタイトル、立替は参加者、レモンは「レモン」、メモは書いた人 */
  heading: string;
  /** 上段に取り消し線を引く（完了したタスク） */
  struck: boolean;
  /** 上段の右に薄く添える日時。今日の一番上にまとめたタスクは null */
  time: string | null;
  /** 下段の前に並べる項目のアイコン（レモン）。無ければその行は詰める */
  careTypes: CareType[];
  /** 下段。無ければ上段だけの 1 行で出す */
  body: string | null;
};

/** タイムラインの行（`TimelineRow`）の中身を、記録の種類ごとの規則で組み立てる */
export function useEntryView(entry: TimelineEntry): EntryView {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const time = entry.at && formatTimelineTime(entry.at, entry.dateOnly);
  const view = { time, task: null, struck: false, careTypes: [] };
  switch (entry.type) {
    case 'event': {
      const { item } = entry;
      // 複数日の終日の予定は終わる日に置くので、始まりの日も添える（「9/24(木)〜今日」）
      const spans = item.kind === 'event' && item.allDay && item.dayCount > 1;
      // 参加者は丸の色で分かるので、名前の代わりにタイトルを出し、下段にメモを出す
      return {
        ...view,
        time: spans ? `${formatTimelineTime(item.startsAt, true)}〜${time}` : time,
        colors: participantColors(item.participantIds, colorFor).map((c) => c.fill),
        icon: ADD_KINDS.event.icon,
        task: item.kind === 'task' ? item : null,
        heading: item.title,
        struck: item.kind === 'task' && item.completedAt !== null,
        body: item.note,
      };
    }
    case 'expense': {
      const { fromUserId, toUserId, amount, description } = entry.expense;
      // 名前と色の並びは立替の履歴と同じ「To ← From」。共有なら払った人だけ
      const people = toUserId === null ? [fromUserId] : [toUserId, fromUserId];
      return {
        ...view,
        colors: people.map((id) => colorFor(id).fill),
        icon: ADD_KINDS.expense.icon,
        heading: people.map(label).join(' ← '),
        body: `${formatYen(amount)} ${description}`,
      };
    }
    case 'lemon': {
      const { careTypes, note, createdBy } = entry.log;
      const leading = leadingCareType(careTypes);
      return {
        ...view,
        // 記録した人の色。API キーで入れた記録は誰のものか分からないので無彩色
        colors: [colorFor(createdBy).fill],
        icon: leading ? CARE_TYPE_ICONS[leading] : ADD_KINDS.lemon.icon,
        heading: ADD_KINDS.lemon.label,
        careTypes,
        body: note,
      };
    }
    case 'memo':
      return {
        ...view,
        colors: [colorFor(entry.memo.createdBy).fill],
        icon: ADD_KINDS.memo.icon,
        heading: label(entry.memo.createdBy),
        body: entry.memo.body,
      };
  }
}
