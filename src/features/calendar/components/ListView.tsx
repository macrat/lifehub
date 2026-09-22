import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { isDateString } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import { matchesKeyword } from '../../../lib/search.ts';
import { FilterPanel } from '../../../lib/ui/FilterPanel.tsx';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { type CalendarItem, groupByDate, useCalendarItems } from '../queries.ts';
import { DayList } from './DayList.tsx';

export type ListFilters = {
  from: DateString;
  to: DateString;
  kind: 'all' | 'event' | 'task';
  /** 'all' = すべて、それ以外は参加者のユーザー ID */
  participant: string;
  /** タスクの完了状態。all = 両方、open = 未完了のみ、done = 完了のみ（予定は除く） */
  completed: 'all' | 'open' | 'done';
  q: string;
};

/** 更新する項目だけ。undefined は既定に戻す。キーワードは AppBar の検索窓が持つのでここには無い */
type ListFiltersPatch = {
  [K in Exclude<keyof ListFilters, 'q'>]?: ListFilters[K] | undefined;
};

type Props = {
  filters: ListFilters;
  filtersOpen: boolean;
  onChangeFilters: (next: ListFiltersPatch) => void;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelectItem: (item: CalendarItem, editing: boolean) => void;
};

/** リスト表示（Google カレンダーの「スケジュール」）。期間・種別・参加者・完了状態・キーワードで絞り込める時系列の一覧。 */
export function ListView({ filters, filtersOpen, onChangeFilters, onSelectItem }: Props) {
  const { users } = useUserLabels();
  // 期間はサーバーに投げ、それ以外の絞り込みは手元で掛ける（打つたびに取り直さない）
  const itemsQuery = useCalendarItems({ from: filters.from, to: filters.to });
  return (
    <>
      <FilterPanel open={filtersOpen}>
        <TextField
          label="開始"
          type="date"
          size="small"
          value={filters.from}
          onChange={(e) => onChangeFilters({ from: dateOrDefault(e.target.value) })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="終了"
          type="date"
          size="small"
          value={filters.to}
          onChange={(e) => onChangeFilters({ to: dateOrDefault(e.target.value) })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="種別"
          select
          size="small"
          value={filters.kind}
          onChange={(e) => onChangeFilters({ kind: e.target.value as ListFilters['kind'] })}
        >
          <MenuItem value="all">すべて</MenuItem>
          <MenuItem value="event">予定</MenuItem>
          <MenuItem value="task">タスク</MenuItem>
        </TextField>
        <TextField
          label="参加者"
          select
          size="small"
          value={filters.participant}
          onChange={(e) => onChangeFilters({ participant: e.target.value })}
        >
          <MenuItem value="all">すべて</MenuItem>
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
          value={filters.completed}
          onChange={(e) =>
            onChangeFilters({ completed: e.target.value as ListFilters['completed'] })
          }
        >
          <MenuItem value="all">すべて</MenuItem>
          <MenuItem value="open">未完了</MenuItem>
          <MenuItem value="done">完了済み</MenuItem>
        </TextField>
      </FilterPanel>
      <QueryView query={itemsQuery} skeleton={<ListSkeleton rows={4} />}>
        {(items) => {
          const grouped = groupByDate(items.filter((item) => matches(item, filters)));
          return grouped.size === 0 ? (
            <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
              この期間の項目はありません
            </Typography>
          ) : (
            <Stack spacing={1}>
              {[...grouped.entries()].map(([date, dayItems]) => (
                <DayList key={date} date={date} items={dayItems} onSelectItem={onSelectItem} />
              ))}
            </Stack>
          );
        }}
      </QueryView>
    </>
  );
}

/** date 入力は消すと空文字になるので、そのときは既定の期間に戻す */
function dateOrDefault(value: string): DateString | undefined {
  return isDateString(value) ? value : undefined;
}

function matches(item: CalendarItem, f: ListFilters): boolean {
  if (f.kind !== 'all' && item.kind !== f.kind) return false;
  if (f.participant !== 'all' && !item.participantIds.includes(f.participant)) return false;
  if (f.completed === 'open' && isCompletedTask(item)) return false;
  if (f.completed === 'done' && !isCompletedTask(item)) return false;
  return matchesKeyword(f.q, item.title, item.location, item.note);
}
