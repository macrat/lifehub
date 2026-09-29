import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { firstDayOfMonth, formatMonth } from '../../../lib/date.ts';
import { InfiniteScroll } from '../../../lib/ui/InfiniteScroll.tsx';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { useCalendarItems } from '../../events/queries.ts';
import { type ListFilters, type ListFiltersPatch, listSections } from '../search.ts';
import type { ListMonths } from '../use-list-months.ts';
import { DayList } from './DayList.tsx';
import { ListFilterForm } from './ListFilterForm.tsx';

type Props = {
  /** 最初に一番上へ出す日 */
  date: DateString;
  filters: ListFilters;
  /** 出している月と、前後へ広げる操作（画面が持つ。`useListMonths`） */
  listMonths: ListMonths;
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
 * 引っ張って更新はしない。上下どちらの端でも続きを読み足すので、引っ張って更新に使える端が無い（`EdgeSentinel` の印）。
 */
export function ListView({
  date,
  filters,
  listMonths,
  filtersOpen,
  onChangeFilters,
  onSelectItem,
}: Props) {
  const { months, range, extendStart, extendEnd } = listMonths;
  // 期間はサーバーに投げ、それ以外の絞り込みは手元で掛ける（打つたびに取り直さない）
  const itemsQuery = useCalendarItems(range);
  // 読み込み中は広げない（空の月が見出しの分しか伸びず、端が見えたまま次々と広げてしまう）
  const loaded = itemsQuery.complete;
  return (
    <InfiniteScroll
      header={<ListFilterForm open={filtersOpen} filters={filters} onChange={onChangeFilters} />}
      load={{ top: (loaded && extendStart) || null, bottom: (loaded && extendEnd) || null }}
      initial={{ block: 'start', target: (list) => firstDayFrom(list, date) }}
      resetKey={JSON.stringify({ date, filters })}
      // 最初の位置は出している月が揃ってから決める
      ready={loaded}
    >
      <QueryView query={itemsQuery} skeleton={<ListSkeleton rows={4} />}>
        {(items) =>
          listSections(items, filters, { months, date, range }).map(({ month, days }) => (
            <Box key={month} component="section">
              <Typography
                variant="subtitle2"
                component="h2"
                sx={{ px: 2, pt: 2, pb: 0.5, borderBottom: 1, borderColor: 'divider' }}
              >
                {formatMonth(firstDayOfMonth(month))}
              </Typography>
              <Stack spacing={1}>
                {days.map(([day, dayItems]) => (
                  <Box key={day} data-date={day}>
                    <DayList date={day} items={dayItems} onSelectItem={onSelectItem} />
                  </Box>
                ))}
              </Stack>
            </Box>
          ))
        }
      </QueryView>
    </InfiniteScroll>
  );
}

/** date かそれより後で最初の日の要素（無ければ末尾に置く） */
function firstDayFrom(list: HTMLElement, date: DateString): HTMLElement | null {
  return (
    [...list.querySelectorAll<HTMLElement>('[data-date]')].find(
      (el) => (el.dataset.date ?? '') >= date,
    ) ?? null
  );
}
