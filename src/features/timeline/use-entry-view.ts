import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType } from 'react';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { formatTimelineTime } from '../../lib/date.ts';
import { ADD_KINDS } from '../add/kinds.ts';
import { itemTransitionName } from '../calendar/item-transition.ts';
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
  /** 左の丸に置くアイコン。予定・タスク・立替・メモは追加ボタンと同じもの */
  icon: ComponentType<SvgIconProps>;
  /** 上段の名前（予定・タスク・立替は参加者、メモは書いた人）。レモンは名前の代わりに項目のアイコンを並べる */
  names: string | null;
  careTypes: CareType[] | null;
  /** 名前の右に薄く添える日時。日時を持たないタスクは null */
  time: string | null;
  /** 下段。無ければ 1 行で出す */
  body: string | null;
  /** 完了したタスク（下段に取り消し線を引く） */
  struck: boolean;
  /** 予定画面へ移ったとき、同じ予定・タスクがこの行から動く（View Transition） */
  transitionName: string | undefined;
};

/** タイムラインの行（`TimelineRow`）の中身を、記録の種類ごとの規則で組み立てる */
export function useEntryView(entry: TimelineEntry): EntryView {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const time = entry.at && formatTimelineTime(entry.at, entry.dateOnly);
  const view = { time, careTypes: null, struck: false, transitionName: undefined };
  switch (entry.type) {
    case 'event': {
      const { item } = entry;
      const ids = item.participantIds;
      return {
        ...view,
        colors: ids.length > 0 ? ids.map((id) => colorFor(id).fill) : [colorFor(null).fill],
        icon: ADD_KINDS[item.kind].icon,
        names: ids.map(label).join('・'),
        body: item.title,
        struck: item.kind === 'task' && item.completedAt !== null,
        transitionName: itemTransitionName(item),
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
        names: people.map(label).join(' ← '),
        body: `${formatYen(amount)} ${description}`,
      };
    }
    case 'lemon': {
      const { careTypes, note } = entry.log;
      const leading = leadingCareType(careTypes);
      return {
        ...view,
        colors: [colorFor(null).fill],
        icon: leading ? CARE_TYPE_ICONS[leading] : ADD_KINDS.lemon.icon,
        names: careTypes.length === 0 ? 'メモ' : null,
        careTypes,
        body: note,
      };
    }
    case 'memo':
      return {
        ...view,
        colors: [colorFor(entry.memo.createdBy).fill],
        icon: ADD_KINDS.memo.icon,
        names: label(entry.memo.createdBy),
        body: entry.memo.body,
      };
  }
}
