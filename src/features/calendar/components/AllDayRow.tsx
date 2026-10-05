import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { type Draft, draftOn, isAllDayDraft, sameOccurrence } from '../draft.ts';
import { draftKind, type GridDraft } from '../grid-draft.ts';
import { layoutLanes } from '../lane-layout.ts';
import { useDayDrag } from '../use-day-drag.ts';
import { DraftBar } from './DraftBlock.tsx';
import { GridChip } from './GridChip.tsx';

const LANE_HEIGHT = 20;

type Props = {
  days: DateString[];
  /** 日ごとの、終日欄に出す項目（終日・複数日の予定、時刻の無いタスク） */
  allDayByDate: Map<DateString, CalendarItem[]>;
  /** 時間軸と揃える列（`grid-template-columns`）。左端は時刻の欄 */
  columns: string;
  onSelectItem: (item: CalendarItem) => void;
  /** 追加・編集しようとしている予定の枠。終日のときだけここに出す */
  draft: GridDraft | null;
  onChangeDraft: (draft: Draft, done: boolean) => void;
};

/**
 * 週・日のタイムラインの終日欄。なぞると終日の予定を追加できる。
 * 終日の帯は月表示と同じ見た目（つまむ丸は出さない）で、直すのは下のセルから（`day-draft.ts` の `dayGrab`）。
 * 終日の予定も長押しでつまむと編集モードに入り、そのまま日を動かせる（編集中は元の項目を隠して帯で出す）。
 */
export function AllDayRow({
  days,
  allDayByDate,
  columns,
  onSelectItem,
  draft,
  onChangeDraft,
}: Props) {
  const compact = useIsMobile();
  // 時間指定はこの面では時間軸に枠で出るので持たない（出していない物は掴めない）
  const barDraft = draft && isAllDayDraft(draft.range) ? draft : null;
  const dayDrag = useDayDrag({ draft: barDraft, onChange: onChangeDraft });
  // 配置は日付と項目だけで決まる。つまんで高さが変わるたびに数え直さない
  const lanes = useMemo(() => layoutLanes(days, allDayByDate), [days, allDayByDate]);
  const laneCount = Math.max(1, ...lanes.map((p) => p.lane + 1));
  // 終日の下書きは既存の帯とぶつからないよう、1 行足してその行に置く。出している間は元の帯を隠す
  const shown = draftOn(draft, days, isAllDayDraft);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: columns,
        gridTemplateRows: `0px repeat(${laneCount + (shown ? 1 : 0)}, ${LANE_HEIGHT}px)`,
        borderBottom: 1,
        borderColor: 'divider',
        pb: '2px',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          gridColumn: 1,
          gridRow: '2 / -1',
          alignSelf: 'start',
          textAlign: 'right',
          pr: 0.5,
          fontSize: '0.65rem',
          color: 'text.secondary',
          lineHeight: `${LANE_HEIGHT}px`,
        }}
      >
        終日
      </Typography>
      {days.map((day, i) => (
        <Box
          key={day}
          data-date={day}
          {...dayDrag.props}
          sx={{ gridColumn: i + 2, gridRow: '1 / -1', borderLeft: 1, borderColor: 'divider' }}
        />
      ))}
      {lanes.map((p) => (
        <GridChip
          key={p.key}
          placed={{ ...p, col: p.col + 1 }}
          compact={compact}
          showTime={false}
          onClick={() => onSelectItem(p.item)}
          grab={dayDrag.grabItemProps(p.item)}
          hidden={sameOccurrence(shown?.draft.item, p.item)}
        />
      ))}
      {shown && (
        <DraftBar
          columns={{ ...shown.columns, col: shown.columns.col + 1 }}
          lane={laneCount}
          kind={draftKind(shown.draft)}
          participantIds={shown.draft.participantIds}
        />
      )}
    </Box>
  );
}
