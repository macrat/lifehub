import Box from '@mui/material/Box';
import type { MouseEvent } from 'react';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { formatTime } from '../../../lib/date.ts';
import { SplitCheckboxIcon } from '../../../lib/ui/SplitCheckboxIcon.tsx';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import type { ItemColors } from '../../users/use-user-color.ts';
import type { DragHandlers } from '../use-range-drag.ts';
import { itemTransitionName } from './item-transition.ts';
import type { Placed } from './lane-layout.ts';

type Props = {
  placed: Placed;
  compact: boolean;
  colors: ItemColors;
  /** 参加者 1 人ずつの色（`colorUsersOf` の並び）。点とチェック印を一覧と同じように塗り分ける */
  participantColors: ItemColors[];
  /** タップ・クリックしたとき（詳細を開く） */
  onClick: () => void;
  /** 長押しでつまむためのハンドラ。つまめない項目（タスクなど）では undefined */
  grab?: DragHandlers;
  /** 編集中（枠を帯で出している）か。場所は残して隠す */
  hidden: boolean;
  /** 時刻をタイトルの前に添えるか */
  showTime?: boolean;
};

/**
 * グリッド（月表示・タイムラインの終日欄）の 1 項目。
 * 帯（終日・複数日の予定）／点＋タイトル（時間指定の予定）／チェック印＋タイトル（タスク）。
 * 帯の色は参加者が 1 人ならそのユーザーの色、そうでなければ共有の無彩色。
 * 点とチェック印は一覧（`ItemCard`）と同じく参加者の色で塗り分ける（`VennMark`・`SplitCheckboxIcon`）。
 * WHY 帯だけ 1 色: 帯は面が広く文字が載るので、塗り分けると文字が読みにくくなる。
 * タイトルを優先し、時刻は広い画面でだけ添える。
 * 単押しは閲覧（詳細を開く）、長押しは編集（`grab`。つまんでそのまま日時を直す）で、アプリ全体の約束と同じ。
 * 編集中は枠（`DraftBar`）で出すので隠すが、DOM からは消さない:
 * つまんだ要素が消えるとその場でタッチが途切れ、指を離さずに動かせなくなる（横スワイプに化ける）。
 */
export function GridChip({
  placed,
  compact,
  colors,
  participantColors,
  onClick,
  grab,
  hidden,
  showTime = !compact,
}: Props) {
  const { item, col, span, lane, roundStart, roundEnd } = placed;
  const isBar = item.kind === 'event' && (item.allDay || span > 1 || item.dayCount > 1);
  const isTask = item.kind === 'task';
  const completed = isCompletedTask(item);
  const overdue = isTask && item.isOverdue;
  const time = item.kind === 'event' && !item.allDay && showTime ? formatTime(item.startsAt) : null;
  const radius = 4;
  const markSize = compact ? 10 : 12;
  return (
    <Box
      component="button"
      type="button"
      {...grab}
      onClick={
        hidden
          ? undefined
          : (e: MouseEvent) => {
              e.stopPropagation();
              onClick();
            }
      }
      aria-label={item.title}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        // 表示を切り替えたとき、同じ項目がこの位置から動く
        viewTransitionName: itemTransitionName(item),
        // 隠すのは見た目だけ（場所は残す）。display: none にすると掴んだ指が離れてしまう
        visibility: hidden ? 'hidden' : undefined,
        gridColumn: `${col + 1} / span ${span}`,
        gridRow: lane + 2,
        alignSelf: 'center',
        height: '100%',
        ml: isBar && !roundStart ? 0 : '2px',
        mr: isBar && !roundEnd ? 0 : '2px',
        px: '3px',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        minWidth: 0,
        cursor: 'pointer',
        fontSize: compact ? '0.62rem' : '0.72rem',
        lineHeight: 1,
        borderRadius: `${roundStart ? radius : 0}px ${roundEnd ? radius : 0}px ${roundEnd ? radius : 0}px ${roundStart ? radius : 0}px`,
        bgcolor: isBar ? colors.fill : 'transparent',
        color: isBar
          ? colors.text
          : overdue
            ? 'error.main'
            : completed
              ? 'text.disabled'
              : 'text.primary',
        textDecoration: completed ? 'line-through' : 'none',
        '&:hover': {
          filter: isBar ? 'brightness(0.92)' : undefined,
          bgcolor: isBar ? colors.fill : 'action.hover',
        },
        // all: unset はフォーカスの輪郭も消すので、キーボード操作のときだけ戻す
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
        },
      }}
    >
      {isTask ? (
        <SplitCheckboxIcon
          colors={participantColors.map((c) => c.fill)}
          checked={completed}
          sx={{ fontSize: markSize, flexShrink: 0 }}
        />
      ) : (
        !isBar && (
          <Box sx={{ flexShrink: 0 }}>
            <VennMark colors={participantColors.map((c) => c.mark)} size={markSize} />
          </Box>
        )
      )}
      <Box
        component="span"
        sx={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
      >
        {time && (
          <Box component="span" sx={{ color: 'text.secondary', mr: '3px' }}>
            {time}
          </Box>
        )}
        {item.title}
      </Box>
    </Box>
  );
}
