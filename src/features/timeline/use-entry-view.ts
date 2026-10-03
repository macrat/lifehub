import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { ComponentType } from 'react';
import {
  type CalendarEventItem,
  type CalendarTaskItem,
  isCompletedTask,
} from '../../../shared/calendar.ts';
import { addDays, allDayDate } from '../../../shared/date.ts';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { ADD_KINDS } from '../../lib/add-kinds.ts';
import { formatTimelineDays, formatTimelineTime } from '../../lib/date.ts';
import { participantColors } from '../events/use-participant-colors.ts';
import { formatYen } from '../expenses/format.ts';
import { PARTIES_SEPARATOR, partiesInOrder } from '../expenses/parties.ts';
import { MCP_MEMO_ICON, memoAuthorLabel } from '../memos/author.ts';
import { useUserColor } from '../users/use-user-color.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import type { TimelineEntry } from './queries.ts';

/** タイムラインの 1 行に出すもの。行の部品はこれを並べるだけにする */
export type EntryView = {
  /** 左の丸の背景。人の色（複数なら塗り分ける）、誰のものでもない記録は無彩色 */
  colors: string[];
  /** 左の丸に置くアイコン。追加ボタンと同じもの（レモンは下部ナビとも同じ。MCP で書いたメモはロボット） */
  icon: ComponentType<SvgIconProps>;
  /** タスクなら左の丸が完了のチェックボックスになる（中にチェックの印を出す） */
  task: CalendarTaskItem | null;
  /** 上段: 予定・タスクはタイトル、立替は参加者、レモンは記録した人（API キーで入れた記録はキーの名前）、メモは書いた人（MCP で書いたメモはクライアントの名前） */
  heading: string;
  /** 上段に取り消し線を引く（完了したタスク） */
  struck: boolean;
  /** 上段を赤字にする（期限を過ぎた未完了のタスク。リスト表示・詳細の超過と同じ色） */
  overdue: boolean;
  /** 上段の右に薄く添える日時。一番上にまとめたタスクは null */
  time: string | null;
  /** 下段の前に並べる項目のアイコン（レモン）。無ければその行は詰める */
  careTypes: CareType[];
  /** 上段の下に場所のアイコンを添えて出す場所（予定・タスク）。無ければその行は詰める */
  location: string | null;
  /** 場所の下に、メモのアイコンを添えて出す予定・タスクのメモ。無ければその行は詰める */
  note: string | null;
  /** 下段（予定・タスク以外の中身）。無ければ上段だけの 1 行で出す */
  body: string | null;
};

/** タイムラインの行（`TimelineRow`）の中身を、記録の種類ごとの規則で組み立てる */
export function useEntryView(entry: TimelineEntry): EntryView {
  const { label, authorName } = useUserLabels();
  const colorFor = useUserColor();
  const time = entry.at && formatTimelineTime(entry.at, entry.dateOnly);
  const view = {
    time,
    task: null,
    struck: false,
    overdue: false,
    careTypes: [],
    location: null,
    note: null,
    body: null,
  };
  switch (entry.type) {
    case 'event': {
      const { item } = entry;
      // 参加者は丸の色で分かるので、名前の代わりにタイトルを出し、その下に場所とメモを出す（詳細と同じアイコンを添える）
      return {
        ...view,
        time: item.kind === 'event' && item.allDay ? allDayPeriod(item) : time,
        colors: participantColors(item.participantIds, colorFor).map((c) => c.fill),
        icon: ADD_KINDS.event.icon,
        task: item.kind === 'task' ? item : null,
        heading: item.title,
        struck: isCompletedTask(item),
        overdue: item.kind === 'task' && item.isOverdue,
        location: item.location,
        note: item.note,
      };
    }
    case 'expense': {
      const { fromUserId, toUserId, amount, description } = entry.expense;
      // 名前と色の並びは立替の履歴と同じ「To ← From」。共有なら払った人だけ
      const people = partiesInOrder({ toUserId, fromUserId });
      return {
        ...view,
        colors: people.map((id) => colorFor(id).fill),
        icon: ADD_KINDS.expense.icon,
        heading: people.map(label).join(PARTIES_SEPARATOR),
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
        // 誰が記録したか。API キーで入れた記録は人が分からないので、どこから入ったか（キーの名前）を出す。
        // 人とキーの名前はちょうど一方だけを持つ（lemon_care_logs の CHECK 制約）
        heading: apiKeyName ?? authorName(createdBy),
        careTypes,
        body: note,
      };
    }
    case 'memo': {
      const { memo } = entry;
      return {
        ...view,
        // 書いた人の色。MCP で書いたメモはその上にロボットのアイコンを置き、名前の代わりに MCP クライアントの名前を出す
        colors: [colorFor(memo.createdBy).fill],
        icon: memo.mcpClientName ? MCP_MEMO_ICON : ADD_KINDS.memo.icon,
        heading: memoAuthorLabel(memo, authorName),
        body: memo.body,
      };
    }
  }
}

/** 終日の予定は期間の中の日（今日を含めば今日）に置くので、日付は置いた日ではなく期間を出す（「9/24(木)〜今日」） */
function allDayPeriod(item: CalendarEventItem): string {
  const first = allDayDate(item.startsAt, 'start');
  return formatTimelineDays(first, addDays(first, item.dayCount - 1));
}
