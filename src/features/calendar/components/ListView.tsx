import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { firstDayOfMonth, formatMonth, toMonthString } from '../../../lib/date.ts';
import { ALL, dateOrUndefined, optionOrUndefined } from '../../../lib/search.ts';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { InfiniteScroll } from '../../../lib/ui/InfiniteScroll.tsx';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { type CalendarItem, groupByDate, useCalendarItems } from '../queries.ts';
import { type ListFilters, type ListFiltersPatch, matchesListFilters } from '../search.ts';
import { useListMonths } from '../use-list-months.ts';
import { DayList } from './DayList.tsx';

type Props = {
  /** 最初に一番上へ出す日 */
  date: DateString;
  filters: ListFilters;
  filtersOpen: boolean;
  onChangeFilters: (next: ListFiltersPatch) => void;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelectItem: (item: CalendarItem, editing: boolean) => void;
};

/**
 * リスト表示（Google カレンダーの「スケジュール」）。種別・参加者・完了状態・キーワード・期間で絞り込める時系列の一覧。
 * 上が古く下が新しい。最初は基準の日（既定は今日）を一番上に出し、上下の端へ近づくと前後の月を 1 か月ずつ読み足す
 * （`useListMonths`）。月ごとに見出しを立てるので、項目の無い月も見出しの分だけ一覧が伸び、端が見えたまま
 * 読み続けることがない。基準の日は項目が無くても「予定なし」として出し、今どこにいるかを示す。
 */
export function ListView({ date, filters, filtersOpen, onChangeFilters, onSelectItem }: Props) {
  const { users } = useUserLabels();
  const { months, range, extendStart, extendEnd } = useListMonths(date, filters);
  // 期間はサーバーに投げ、それ以外の絞り込みは手元で掛ける（打つたびに取り直さない）
  const itemsQuery = useCalendarItems(range);
  const filterPanel = (
    <FilterPanel open={filtersOpen}>
      <TextField
        label="開始"
        type="date"
        size="small"
        value={filters.from ?? ''}
        onChange={(e) => onChangeFilters({ from: dateOrUndefined(e.target.value) })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="終了"
        type="date"
        size="small"
        value={filters.to ?? ''}
        onChange={(e) => onChangeFilters({ to: dateOrUndefined(e.target.value) })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="種別"
        select
        size="small"
        value={filters.kind ?? ALL}
        onChange={(e) => onChangeFilters({ kind: optionOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        <MenuItem value="event">予定</MenuItem>
        <MenuItem value="task">タスク</MenuItem>
      </TextField>
      <TextField
        label="参加者"
        select
        size="small"
        value={filters.participant ?? ALL}
        onChange={(e) => onChangeFilters({ participant: optionOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        {users.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="完了"
        select
        size="small"
        value={filters.completed ?? ALL}
        onChange={(e) => onChangeFilters({ completed: optionOrUndefined(e.target.value) })}
      >
        <MenuItem value={ALL}>すべて</MenuItem>
        <MenuItem value="open">未完了</MenuItem>
        <MenuItem value="done">完了済み</MenuItem>
      </TextField>
    </FilterPanel>
  );
  // 読み込み中は広げない（空の月が見出しの分しか伸びず、端が見えたまま次々と広げてしまう）
  const loaded = itemsQuery.complete;
  return (
    <InfiniteScroll
      header={filterPanel}
      onReachStart={loaded ? extendStart : undefined}
      onReachEnd={loaded ? extendEnd : undefined}
      initialTarget={(list) => firstDayFrom(list, date)}
      resetKey={JSON.stringify({ date, filters })}
      // 最初の位置は出している月が揃ってから決める
      ready={loaded}
    >
      <QueryView query={itemsQuery} skeleton={<ListSkeleton rows={4} />}>
        {(items) => {
          const grouped = groupByDate(items.filter((item) => matchesListFilters(item, filters)));
          if (date >= range.from && date <= range.to && !grouped.has(date)) grouped.set(date, []);
          const byMonth = Map.groupBy(
            [...grouped].sort(([a], [b]) => a.localeCompare(b)),
            ([day]) => toMonthString(day),
          );
          return months.map((month) => (
            <Box key={month} component="section">
              <Typography
                variant="subtitle2"
                component="h2"
                sx={{ px: 2, pt: 2, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}
              >
                {formatMonth(firstDayOfMonth(month))}
              </Typography>
              <Stack spacing={1}>
                {(byMonth.get(month) ?? []).map(([day, dayItems]) => (
                  <Box key={day} data-date={day}>
                    <DayList date={day} items={dayItems} onSelectItem={onSelectItem} />
                  </Box>
                ))}
              </Stack>
            </Box>
          ));
        }}
      </QueryView>
    </InfiniteScroll>
  );
}

/** date かそれより後で最初の日の要素（無ければ末尾に置く） */
function firstDayFrom(list: HTMLElement, date: DateString): Element | null {
  return (
    [...list.querySelectorAll<HTMLElement>('[data-date]')].find(
      (el) => (el.dataset.date ?? '') >= date,
    ) ?? null
  );
}
