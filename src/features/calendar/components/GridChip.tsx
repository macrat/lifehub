import Box from '@mui/material/Box';
import type { MouseEvent } from 'react';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { formatTime } from '../../../lib/date.ts';
import { wedgeBackground } from '../../../lib/ui/wedge.ts';
import { COMPLETED_SX, COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import {
  ParticipantsCheckIcon,
  ParticipantsMark,
} from '../../events/components/ParticipantsMark.tsx';
import { useParticipantColors } from '../../events/use-participant-colors.ts';
import { itemMargins, itemMask } from '../item-shape.ts';
import { itemTransitionName } from '../item-transition.ts';
import { LANE_ITEM_HEIGHT, type Placed } from '../lane-layout.ts';
import type { DragHandlers } from '../use-range-drag.ts';

type Props = {
  placed: Placed;
  compact: boolean;
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
 * 帯・点・チェック印は、一覧（`ItemCard`）と同じく参加者の色で塗り分ける
 * （`wedgeBackground`・`ParticipantsMark`・`ParticipantsCheckIcon`）。
 * 完了したタスクはリスト表示と同じく、印を薄く・タイトルに取り消し線を引く。
 * タイトルを優先し、時刻は広い画面でだけ添える。
 * 単押しは閲覧（詳細を開く）、長押しは編集（`grab`。つまんでそのまま日時を直す）で、アプリ全体の約束と同じ。
 * 編集中は枠（`DraftBar`）で出すので隠すが、DOM からは消さない:
 * つまんだ要素が消えるとその場でタッチが途切れ、指を離さずに動かせなくなる（横スワイプに化ける）。
 */
export function GridChip({ placed, compact, onClick, grab, hidden, showTime = !compact }: Props) {
  const { item, col, span, lane } = placed;
  const isBar = item.kind === 'event' && (item.allDay || span > 1 || item.dayCount > 1);
  const isTask = item.kind === 'task';
  const completed = isCompletedTask(item);
  const colors = useParticipantColors(item.participantIds);
  const overdue = isTask && item.isOverdue;
  const time = item.kind === 'event' && !item.allDay && showTime ? formatTime(item.startsAt) : null;
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
      style={{ mask: itemMask(placed) }}
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
        height: LANE_ITEM_HEIGHT,
        ...itemMargins(placed),
        px: '3px',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        minWidth: 0,
        cursor: 'pointer',
        fontSize: compact ? '0.62rem' : '0.72rem',
        lineHeight: 1,
        background: isBar ? wedgeBackground(colors.map((c) => c.fill)) : undefined,
        color: isBar
          ? FILL_TEXT
          : overdue
            ? 'error.main'
            : completed
              ? 'text.disabled'
              : 'text.primary',
        ...(completed && COMPLETED_TITLE_SX),
        '&:hover': isBar ? { filter: 'brightness(0.92)' } : { bgcolor: 'action.hover' },
        // all: unset はフォーカスの輪郭も消すので、キーボード操作のときだけ戻す
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
        },
      }}
    >
      {isTask ? (
        <ParticipantsCheckIcon
          participantIds={item.participantIds}
          checked={completed}
          // 文字は text.disabled で既に薄いので、薄くするのは印だけ
          sx={{ fontSize: markSize, flexShrink: 0, ...(completed && COMPLETED_SX) }}
        />
      ) : (
        !isBar && <ParticipantsMark participantIds={item.participantIds} size={markSize} />
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
