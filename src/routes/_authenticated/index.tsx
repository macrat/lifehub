import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { AddForm } from '../../features/add/components/AddForm.tsx';
import { AddMenu } from '../../features/add/components/AddMenu.tsx';
import type { AddFormKind } from '../../features/add/kinds.ts';
import { StatusCards } from '../../features/dashboard/components/StatusCards.tsx';
import { CareLogForm } from '../../features/lemon/components/CareLogForm.tsx';
import { TimelineEntrySheet } from '../../features/timeline/components/TimelineEntrySheet.tsx';
import { TimelineFilterForm } from '../../features/timeline/components/TimelineFilterForm.tsx';
import { TimelineList } from '../../features/timeline/components/TimelineList.tsx';
import { type TimelineEntry, useTimeline } from '../../features/timeline/queries.ts';
import { countActiveFilters, timelineSearchSchema } from '../../features/timeline/search.ts';
import { useAddEventOnCalendar, useAddShortcut } from '../../lib/add-search.ts';
import { useFilterSearch } from '../../lib/search.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { ScrollAwayHeader } from '../../lib/ui/ScrollAwayHeader.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';
import { useIsDesktop } from '../../lib/ui/use-breakpoint.ts';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';
import { settingsNavItem } from '../../navigation.ts';

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: timelineSearchSchema,
  component: HomePage,
});

/**
 * タイムラインの幅の上限（PC）。X の投稿の列と同じく、1 行を目で追える幅に留める
 * （画面いっぱいに伸ばすと、左のアイコンと右端の日時が離れすぎる）
 */
const MAX_WIDTH = 640;

/**
 * ホーム。上から、最新の状態（立替残高・葉水・水やりのタイル）と、
 * 予定・タスク・立替・レモン・メモを 1 本に並べたタイムライン（上が新しい）。メモは右下の追加ボタンから書く。
 * タイルは下へスクロールすると隠れ、少し戻すと出てくる（`ScrollAwayHeader`）。
 * 行を押すとその記録の詳細がホームの上に開く（単押しは閲覧、長押しは編集）。
 * AppBar の検索窓はすべての記録の文字で、その右の絞り込みボタンは日付の範囲でタイムラインを絞り込む
 * （タイルは絞り込みに関わらず今の状態を示す）。スマホでは右端の歯車が設定への入口
 * （PC はサイドナビにあるので出さない）。
 */
function HomePage() {
  const search = Route.useSearch();
  const isDesktop = useIsDesktop();
  const { filters, listFilter, setKeyword, setFilters, activeFilters, filtering } = useFilterSearch(
    search,
    countActiveFilters,
  );
  // 詳細な絞り込みのフォームを開いているか（URL には載せない。開き直したら閉じている）
  const panel = useToggle();
  const timeline = useTimeline(listFilter);
  const selection = useRecordSelection<TimelineEntry>();
  // 追加ボタンとタイルから開く入力。世話はタイルの項目にチェックを入れて開く
  const adding = useOpenWith<AddFormKind>();
  const addingCare = useOpenWith<CareType[]>();
  const addEventOnCalendar = useAddEventOnCalendar();

  useAddShortcut(search.add, adding.open);

  return (
    <>
      <AppBarContent>
        <SearchField label="記録を検索" value={filters.q} onChange={setKeyword}>
          <FilterButton open={panel.value} count={activeFilters} onToggle={panel.toggle} />
          {!isDesktop && (
            <IconButton
              component={Link}
              to={settingsNavItem.to}
              aria-label={settingsNavItem.label}
              size="small"
            >
              <settingsNavItem.icon />
            </IconButton>
          )}
        </SearchField>
      </AppBarContent>

      <Box sx={{ maxWidth: MAX_WIDTH, mx: 'auto' }}>
        <ScrollAwayHeader pinned={panel.value}>
          <TimelineFilterForm open={panel.value} filters={filters} onChange={setFilters} />
          <StatusCards onAddExpense={() => adding.open('expense')} onAddCare={addingCare.open} />
        </ScrollAwayHeader>
        <TimelineList
          timeline={timeline}
          emptyMessage={filtering ? '一致する記録はありません' : 'まだ記録はありません'}
          onSelect={selection.open}
        />
      </Box>

      <AddMenu
        kinds={['memo', 'lemon', 'expense', 'task', 'event']}
        onSelect={adding.open}
        onAddEvent={addEventOnCalendar}
      />
      {adding.value && <AddForm kind={adding.value} onClose={adding.close} />}
      {addingCare.value && (
        <CareLogForm initialCareTypes={addingCare.value} onClose={addingCare.close} />
      )}
      {selection.selected && (
        <TimelineEntrySheet
          entry={selection.selected.record}
          initialEditing={selection.selected.editing}
          onClose={selection.close}
        />
      )}
    </>
  );
}
