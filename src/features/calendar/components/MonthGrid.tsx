import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import type { DailyWeather } from '../../../../shared/weather.ts';
import {
  formatDateWithYear,
  isToday,
  WEEKDAY_LABELS,
  weekdayLabelColor,
} from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import type { GridDraft } from '../draft.ts';
import {
  type Draft,
  draftColumns,
  draftDays,
  draftKind,
  editingItemOn,
  sameOccurrence,
} from '../draft.ts';
import { completedLast, foldLanes, freeLane, layoutLanes } from '../lane-layout.ts';
import { useCalendarDays } from '../queries.ts';
import { useDayDrag } from '../use-day-drag.ts';
import { useMonthGrid } from '../use-month-grid.ts';
import { DayNumber } from './DayNumber.tsx';
import { CenteredWithWeather } from './DayWeather.tsx';
import { DraftBar } from './DraftBlock.tsx';
import { GridChip } from './GridChip.tsx';
import { syncScrollProps } from './markers.ts';

type Props = {
  /** 表示する月 "YYYY-MM"（月外の日を薄く出す判定） */
  month: string;
  /** グリッドの 42 日（月曜始まり 6 週）。取得範囲と同じものを渡す */
  days: DateString[];
  itemsByDate: Map<DateString, CalendarItem[]>;
  /** 日を選んだとき（日表示へ移る）。スマホは項目の無い所のタップ、PC は日付の数字 */
  onSelectDate: (date: DateString) => void;
  /** 項目をタップ・クリックしたとき（詳細を開く） */
  onSelectItem: (item: CalendarItem) => void;
  /** 追加・編集しようとしている予定の枠。なぞり終えるまで（`settled`）は枠を追いかけてスクロールしない */
  draft: GridDraft | null;
  /** 日のセルをなぞって期間を選んだとき。done はポインタを離したか */
  onChangeDraft: (draft: Draft, done: boolean) => void;
  /** グリッド全体の高さ（画面の残り全部） */
  height: string;
  /** クイック入力のシートが下から覆っている高さ（px）。下に同じだけ余白を足す */
  bottomInset: number;
};

const DAY_NUMBER_HEIGHT = 22;

/**
 * 月グリッド（Google カレンダー方式）。
 * - 複数日の予定は週の行をまたいで 1 本の帯にする（レーンを割り当てて重ならないように置く）
 * - 終日は塗り帯、時間指定の予定は点＋タイトル、タスクはチェック印＋タイトル。タイトルを優先し、時刻は PC でだけ添える
 * - 高さは画面の残り全部。6 週で等分し、入りきらない項目は「+n」にまとめる。
 *   シートが下から覆う分（`bottomInset`）は 1 日の高さを変えずに下へ余白として足すので、
 *   隠れた週はスクロールすれば見られる。隠れた所に枠を置いたときは、見える所まで送る
 * - 完了したタスクは日ごとに一番下へ回す（`completedLast`）
 * - 色は参加者が 1 人ならそのユーザーの色、そうでなければ共有の無彩色
 * - 項目はタップで詳細、長押しでつまんで編集（アプリ全体の「単押しは閲覧、長押しは編集」）
 * - 日のセルをなぞると終日の予定を追加できる。PC は空いている所をクリック、スマホは長押しから（タップは日表示へ）。
 *   出ている枠（終日・時間指定のどちらも帯で出す）に掛かるセルを押したときは、選び直さずに
 *   その枠をつまむ（長押しは待たない）。つまむ所の決め方と理由は `day-draft.ts` の `dayGrab`
 * - 保存済みの予定は長押しでつまむと編集モードに入り、同じ指のまま日を動かせる。編集中は枠を帯で出し、
 *   元の項目は隠す（同じ予定が二重に出ないように）
 */
export function MonthGrid({
  month,
  days,
  itemsByDate,
  onSelectDate,
  onSelectItem,
  draft,
  onChangeDraft,
  height,
  bottomInset,
}: Props) {
  const compact = useIsMobile();
  const { holidays, weather } = useCalendarDays(days);
  const drag = useDayDrag({
    draft,
    onChange: onChangeDraft,
    onTapDate: compact ? onSelectDate : undefined,
  });
  const laneHeight = compact ? 17 : 20;
  // 配置は日付と項目だけで決まる。つまんで動かすたびに数え直さない
  const weeks = useMemo(() => {
    const ordered = completedLast(itemsByDate);
    return Array.from({ length: 6 }, (_, w) => {
      const week = days.slice(w * 7, w * 7 + 7);
      return { days: week, placed: layoutLanes(week, ordered) };
    });
  }, [days, itemsByDate]);
  const editing = editingItemOn(draft, days);

  // レーン数の実測と、置いた枠を見える所まで送るスクロール
  const { firstWeekRef, scrollRef, maxLanes } = useMonthGrid({
    laneHeight,
    headerHeight: DAY_NUMBER_HEIGHT,
    draftSpan: draft?.settled ? draftDays(draft.range) : null,
    bottomInset,
  });

  return (
    <Box
      {...syncScrollProps}
      ref={scrollRef}
      sx={{ height, overflowY: 'auto', scrollPaddingBottom: `${bottomInset}px` }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateRows: 'auto repeat(6, minmax(0, 1fr))',
          height: '100%',
          userSelect: 'none',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Typography
              key={label}
              variant="caption"
              align="center"
              sx={{
                py: 0.25,
                lineHeight: 1.4,
                fontSize: '0.7rem',
                color: weekdayLabelColor(i),
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>
        {weeks.map((week, w) => (
          <WeekRow
            key={week.days[0]}
            ref={w === 0 ? firstWeekRef : undefined}
            days={week.days}
            placed={week.placed}
            month={month}
            onSelectDate={onSelectDate}
            onSelectItem={onSelectItem}
            draft={draft}
            editing={editing}
            drag={drag}
            holidays={holidays}
            weather={weather}
            maxLanes={maxLanes}
            laneHeight={laneHeight}
            compact={compact}
          />
        ))}
      </Box>
      {/* シートが覆う分の余白。1 日の高さは変えずに、隠れた週まで下りられるようにする */}
      <Box sx={{ height: bottomInset }} />
    </Box>
  );
}

type WeekRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  days: DateString[];
  /** その週の帯の配置（`layoutLanes`） */
  placed: ReturnType<typeof layoutLanes>;
  month: string;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  draft: GridDraft | null;
  /** 枠が直している項目（`editingItemOn`）。元の帯は隠す */
  editing: CalendarItem | null;
  drag: ReturnType<typeof useDayDrag>;
  holidays: ReadonlySet<DateString>;
  weather: ReadonlyMap<DateString, DailyWeather>;
  maxLanes: number;
  laneHeight: number;
  compact: boolean;
};

function WeekRow({
  ref,
  days,
  placed,
  month,
  onSelectDate,
  onSelectItem,
  draft,
  editing,
  drag,
  holidays,
  weather,
  maxLanes,
  laneHeight,
  compact,
}: WeekRowProps) {
  const draftCols = draft && draftColumns(draft.range, days);
  const { visible, foldedLane, foldedPerCol } = foldLanes(placed, maxLanes, days.length);

  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        // 最後に伸びる行を置き、日セル（1 / -1）が行の下端まで届くようにする（罫線が途中で切れない）
        gridTemplateRows: `${DAY_NUMBER_HEIGHT}px repeat(${maxLanes}, ${laneHeight}px) minmax(0, 1fr)`,
        minHeight: 0,
        overflow: 'hidden',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* 背景の日セル: 罫線・予定の追加（なぞって選ぶ）。日表示へはスマホなら項目の無い所のタップ、PC は日付の数字から */}
      {days.map((date, col) => {
        const inMonth = date.startsWith(month);
        return (
          <Box
            key={date}
            data-date={date}
            {...drag.props}
            sx={{
              gridColumn: col + 1,
              gridRow: '1 / -1',
              borderLeft: col === 0 ? 0 : 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              pt: '2px',
            }}
          >
            <CenteredWithWeather
              weather={weather.get(date)}
              size={compact ? 12 : 14}
              muted={!inMonth && !isToday(date)}
            >
              <ButtonBase
                aria-label={formatDateWithYear(date)}
                onClick={() => onSelectDate(date)}
                sx={{ borderRadius: '50%' }}
              >
                <DayNumber date={date} size={18} holiday={holidays.has(date)} />
              </ButtonBase>
            </CenteredWithWeather>
          </Box>
        );
      })}
      {visible.map((p) => (
        <GridChip
          key={p.key}
          placed={p}
          compact={compact}
          onClick={() => onSelectItem(p.item)}
          grab={drag.grabItemProps(p.item)}
          hidden={sameOccurrence(editing, p.item)}
        />
      ))}
      {draft && draftCols && (
        <DraftBar
          columns={draftCols}
          lane={freeLane(placed, draftCols.col, draftCols.span, maxLanes)}
          kind={draftKind(draft)}
          participantIds={draft.participantIds}
        />
      )}
      {foldedPerCol.map((n, col) =>
        n > 0 ? (
          <Typography
            key={days[col]}
            variant="caption"
            component="span"
            sx={{
              all: 'unset',
              gridColumn: col + 1,
              gridRow: foldedLane + 2,
              pointerEvents: 'none',
              px: 0.5,
              fontSize: compact ? '0.6rem' : '0.7rem',
              lineHeight: `${laneHeight}px`,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
            }}
          >
            +{n}
          </Typography>
        ) : null,
      )}
    </Box>
  );
}
