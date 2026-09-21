import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { isDateString } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { type CalendarItem, calendarItemsQueryOptions, groupByDate } from '../queries.ts';
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

type Props = {
  filters: ListFilters;
  filtersOpen: boolean;
  /** 更新する項目だけ。undefined は既定に戻す */
  onChangeFilters: (next: { [K in keyof ListFilters]?: ListFilters[K] | undefined }) => void;
  onSelectItem: (item: CalendarItem) => void;
};

/** リスト表示（Google カレンダーの「スケジュール」）。期間・種別・参加者・完了状態・キーワードで絞り込める時系列の一覧。 */
export function ListView({ filters, filtersOpen, onChangeFilters, onSelectItem }: Props) {
  const { users } = useUserLabels();
  // 期間はサーバーに投げ、それ以外の絞り込みは手元で掛ける（打つたびに取り直さない）
  const { data: items = [] } = useQuery(
    calendarItemsQueryOptions({ from: filters.from, to: filters.to }),
  );
  const grouped = groupByDate(items.filter((item) => matches(item, filters)));
  return (
    <>
      <Collapse in={filtersOpen}>
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            px: { xs: 2, md: 0 },
            pt: 1,
            mb: 2,
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(5, minmax(0, 1fr))',
            },
          }}
        >
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
        </Box>
      </Collapse>
      {grouped.size === 0 ? (
        <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
          この期間の項目はありません
        </Typography>
      ) : (
        <Stack spacing={1}>
          {[...grouped.entries()].map(([date, dayItems]) => (
            <DayList key={date} date={date} items={dayItems} onSelectItem={onSelectItem} />
          ))}
        </Stack>
      )}
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
  if (f.completed === 'open' && item.kind === 'task' && item.completedAt !== null) return false;
  if (f.completed === 'done' && (item.kind !== 'task' || item.completedAt === null)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const text = `${item.title} ${item.location ?? ''} ${item.note ?? ''}`.toLowerCase();
    if (!text.includes(q)) return false;
  }
  return true;
}
