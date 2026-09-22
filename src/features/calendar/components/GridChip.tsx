import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import Box from '@mui/material/Box';
import type { MouseEvent } from 'react';
import { formatTime } from '../../../lib/date.ts';
import type { ItemColors } from '../../users/use-user-color.ts';
import type { DragHandlers } from '../use-range-drag.ts';
import { itemTransitionName } from './item-transition.ts';
import type { Placed } from './lane-layout.ts';

type Props = {
  placed: Placed;
  compact: boolean;
  colors: ItemColors;
  /** 無ければ表示専用（スマホの月表示: セルのどこをタップしても日を選ぶ。項目は日表示から開く） */
  onClick?: () => void;
  /** 長押しでつまむためのハンドラ。つまめない項目（タスクなど）では undefined */
  grab?: DragHandlers;
  /** 編集中（枠を帯で出している）か。場所は残して隠す */
  hidden?: boolean;
  /** 時刻をタイトルの前に添えるか */
  showTime?: boolean;
};

/**
 * グリッド（月表示・タイムラインの終日欄）の 1 項目。
 * 帯（終日・複数日の予定）／点＋タイトル（時間指定の予定）／チェック印＋タイトル（タスク）。
 * 色は参加者が 1 人ならそのユーザーの色、そうでなければ共有の無彩色。タイトルを優先し、時刻は広い画面でだけ添える。
 * 長押しでつまむと編集モード（`grab`）。編集中は枠（`DraftBar`）で出すので隠すが、DOM からは消さない:
 * つまんだ要素が消えるとその場でタッチが途切れ、指を離さずに動かせなくなる（横スワイプに化ける）。
 */
export function GridChip({
  placed,
  compact,
  colors,
  onClick,
  grab,
  hidden = false,
  showTime = !compact,
}: Props) {
  const { item, col, span, lane, roundStart, roundEnd } = placed;
  const isBar = item.kind === 'event' && (item.allDay || span > 1 || item.dayCount > 1);
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const overdue = isTask && item.isOverdue;
  const time = item.kind === 'event' && !item.allDay && showTime ? formatTime(item.startsAt) : null;
  const radius = 4;
  return (
    <Box
      component={onClick ? 'button' : 'span'}
      type={onClick ? 'button' : undefined}
      {...grab}
      onClick={
        onClick && !hidden
          ? (e: MouseEvent) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      aria-label={item.title}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        // 表示を切り替えたとき、同じ項目がこの位置から動く
        viewTransitionName: itemTransitionName(item),
        // 隠すのは見た目だけ（場所は残す）。display: none にすると掴んだ指が離れてしまう
        visibility: hidden ? 'hidden' : undefined,
        // つまめも押せもしないときは見せるだけ。押した先は下のセルに届かせ、日を選べるようにする
        pointerEvents: onClick || grab ? 'auto' : 'none',
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
        cursor: onClick ? 'pointer' : 'default',
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
        completed ? (
          <CheckBoxIcon sx={{ fontSize: compact ? 10 : 12, flexShrink: 0, color: colors.fill }} />
        ) : (
          <CheckBoxOutlineBlankIcon
            sx={{ fontSize: compact ? 10 : 12, flexShrink: 0, color: colors.fill }}
          />
        )
      ) : (
        !isBar && (
          <Box
            sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: colors.fill, flexShrink: 0 }}
          />
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
