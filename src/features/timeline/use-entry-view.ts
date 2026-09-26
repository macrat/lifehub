import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType } from 'react';
import { addDays, allDayDate } from '../../../shared/date.ts';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { formatTimelineDays, formatTimelineTime } from '../../lib/date.ts';
import { ADD_KINDS } from '../add/kinds.ts';
import type { CalendarEventItem, CalendarTaskItem } from '../events/queries.ts';
import { participantColors } from '../events/use-participant-colors.ts';
import { formatYen } from '../expenses/format.ts';
import { useUserColor } from '../users/use-user-color.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import type { TimelineEntry } from './queries.ts';

/** タイムラインの 1 行に出すもの。行の部品はこれを並べるだけにする */
export type EntryView = {
  /** 左の丸の背景。人の色（複数なら塗り分ける）、誰のものでもない記録は無彩色 */
  colors: string[];
  /** 左の丸に置くアイコン。追加ボタンと同じもの（レモンは下部ナビとも同じ） */
  icon: ComponentType<SvgIconProps>;
  /** タスクなら左の丸が完了のチェックボックスになる（中にチェックの印を出す） */
  task: CalendarTaskItem | null;
  /** 上段: 予定・タスクはタイトル、立替は参加者、レモンは記録した人（API キーで入れた記録はキーの名前）、メモは書いた人 */
  heading: string;
  /** 上段に取り消し線を引く（完了したタスク） */
  struck: boolean;
  /** 上段を赤字にする（期限を過ぎた未完了のタスク。リスト表示・詳細の超過と同じ色） */
  overdue: boolean;
  /** 上段の右に薄く添える日時。一番上にまとめたタスクは null */
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
  const view = { time, task: null, struck: false, overdue: false, careTypes: [] };
  switch (entry.type) {
    case 'event': {
      const { item } = entry;
      // 参加者は丸の色で分かるので、名前の代わりにタイトルを出し、下段にメモを出す
      return {
        ...view,
        time: item.kind === 'event' && item.allDay ? allDayPeriod(item) : time,
        colors: participantColors(item.participantIds, colorFor).map((c) => c.fill),
        icon: ADD_KINDS.event.icon,
        task: item.kind === 'task' ? item : null,
        heading: item.title,
        struck: item.kind === 'task' && item.completedAt !== null,
        overdue: item.kind === 'task' && item.isOverdue,
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
      const { careTypes, note, createdBy, apiKeyName } = entry.log;
      return {
        ...view,
        // 記録した人の色。API キーで入れた記録は誰のものか分からないので無彩色
        colors: [colorFor(createdBy).fill],
        // 何をしたかは下の項目のアイコンの並びで分かるので、丸はレモンの記録であることだけを示す
        icon: ADD_KINDS.lemon.icon,
        // 誰が記録したか。API キーで入れた記録は人が分からないので、どこから入ったか（キーの名前）を出す
        heading: createdBy ? label(createdBy) : (apiKeyName ?? ADD_KINDS.lemon.label),
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

/** 終日の予定は期間の中の日（今日を含めば今日）に置くので、日付は置いた日ではなく期間を出す（「9/24(木)〜今日」） */
function allDayPeriod(item: CalendarEventItem): string {
  const first = allDayDate(item.startsAt, 'start');
  return formatTimelineDays(first, addDays(first, item.dayCount - 1));
}
