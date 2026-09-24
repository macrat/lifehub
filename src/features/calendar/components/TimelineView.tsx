import Box from '@mui/material/Box';
import { useMemo } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import type { Draft } from '../draft.ts';
import type { CalendarItem } from '../queries.ts';
import type { GridDraft } from '../use-event-composer.ts';
import { AllDayRow } from './AllDayRow.tsx';
import { TimeGrid } from './TimeGrid.tsx';
import { TimelineHeader } from './TimelineHeader.tsx';
import { partitionTimeline } from './timeline-layout.ts';

type Props = {
  /** 表示する日（週なら 7 日、日なら 1 日） */
  days: DateString[];
  itemsByDate: Map<DateString, CalendarItem[]>;
  onSelectItem: (item: CalendarItem) => void;
  /** 週表示で日付の見出しをタップしたとき（日表示へ） */
  onSelectDate?: (date: DateString) => void;
  /** 追加・編集しようとしている予定の枠（終日欄と時間軸に出す） */
  draft: GridDraft | null;
  /** なぞって範囲を決めたとき。done はポインタを離したか */
  onChangeDraft: (draft: Draft, done: boolean) => void;
  /** 全体の高さ（画面の残り全部）。時間軸はこの中でスクロールする */
  height: string;
  /** 時間軸（`TimeGrid`）へそのまま渡す */
  hourHeight: number;
  onZoom: (ratio: number) => void;
  fitItems: boolean;
  bottomInset: number;
};

/** 左端の時刻の欄の幅（px）。見出し・終日欄・時間軸で列を揃える */
const GUTTER_WIDTH = 44;

/**
 * 週・日のタイムライン表示（Google カレンダー方式）。
 * 上に日付の見出し（`TimelineHeader`）と終日欄（`AllDayRow`）、下に 0〜24 時の時間軸（`TimeGrid`）。
 * ここでは項目を終日欄と時間軸に振り分けて列を揃えるだけで、描画は各部品に任せる。
 * 終日欄をなぞると終日の予定、時間軸をなぞるとその時間帯の予定を追加できる。
 */
export function TimelineView({
  days,
  itemsByDate,
  onSelectItem,
  onSelectDate,
  draft,
  onChangeDraft,
  height,
  hourHeight,
  onZoom,
  fitItems,
  bottomInset,
}: Props) {
  // 振り分けは日付と項目だけで決まる。つまんで高さが変わるたびに数え直さない
  // （指を動かしている間は毎フレーム描き直される所なので）
  const { allDayByDate, timedByDate } = useMemo(
    () => partitionTimeline(days, itemsByDate),
    [days, itemsByDate],
  );
  const columns = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <Box sx={{ height, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
      <TimelineHeader days={days} columns={columns} onSelectDate={onSelectDate} />
      <AllDayRow
        days={days}
        allDayByDate={allDayByDate}
        columns={columns}
        onSelectItem={onSelectItem}
        draft={draft}
        onChangeDraft={onChangeDraft}
      />
      <TimeGrid
        days={days}
        timedByDate={timedByDate}
        hourHeight={hourHeight}
        onZoom={onZoom}
        gutterWidth={GUTTER_WIDTH}
        onSelectItem={onSelectItem}
        draft={draft}
        onChangeDraft={onChangeDraft}
        fitItems={fitItems}
        bottomInset={bottomInset}
      />
    </Box>
  );
}
