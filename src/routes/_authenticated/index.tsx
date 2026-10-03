import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { StatusCards } from '../../features/dashboard/components/StatusCards.tsx';
import { CareLogForm } from '../../features/lemon/components/CareLogForm.tsx';
import { lemonStatusQueryOptions } from '../../features/lemon/queries.ts';
import { MemoForm } from '../../features/memos/components/MemoForm.tsx';
import { pinnedMemosQueryOptions } from '../../features/memos/queries.ts';
import { PinnedMemoList } from '../../features/timeline/components/PinnedMemoList.tsx';
import { TimelineEntrySheet } from '../../features/timeline/components/TimelineEntrySheet.tsx';
import { TimelineFilterForm } from '../../features/timeline/components/TimelineFilterForm.tsx';
import { TimelineList } from '../../features/timeline/components/TimelineList.tsx';
import { type TimelineEntry, timelineHistory } from '../../features/timeline/queries.ts';
import {
  TIMELINE_FILTER_CONDITIONS,
  timelineSearchSchema,
} from '../../features/timeline/search.ts';
import { weatherHistory } from '../../features/weather/queries.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import { useScreenHistory, useScreenQueries } from '../../lib/screen-data.ts';
import { useFilterSearch } from '../../lib/search.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterSearchField } from '../../lib/ui/FilterSearchField.tsx';
import { READING_MAX_WIDTH } from '../../lib/ui/layout.ts';
import { ScrollAwayHeader } from '../../lib/ui/ScrollAwayHeader.tsx';
import { useIsDesktop } from '../../lib/ui/use-breakpoint.ts';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';
import { settingsNavItem } from '../../navigation.ts';

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: timelineSearchSchema,
  staticData: { ownsScroll: true },
  component: HomePage,
});

/**
 * ホーム。上から、最新の状態（天気・葉水・水やりのタイル）と、ピン止めしたメモ、
 * 予定・タスク・立替・レモン・メモを 1 本に並べたタイムライン（上が新しい）。右下の追加ボタンはメモを書く。
 * タイルは下へスクロールすると隠れ、少し戻すと出てくる（`ScrollAwayHeader`）。
 * 行を押すとその記録の詳細がホームの上に開く（単押しは閲覧、長押しは編集）。
 * AppBar の検索窓はすべての記録の文字で、その右の絞り込みボタンは日付の範囲でタイムラインを絞り込む
 * （タイルは絞り込みに関わらず今の状態を示す）。スマホでは左端の歯車が設定への入口
 * （PC はサイドナビにあるので出さない）。
 */
function HomePage() {
  const search = Route.useSearch();
  const isDesktop = useIsDesktop();
  const filter = useFilterSearch(search, TIMELINE_FILTER_CONDITIONS);
  // この画面が読むもの: 絞り込んだタイムラインと、その上に固定するピン止めしたメモ、
  // タイルに出す天気（最新のページ）・レモンの状況
  const timeline = useScreenHistory(timelineHistory, filter.listFilter);
  useScreenHistory(weatherHistory, {});
  useScreenQueries([lemonStatusQueryOptions, pinnedMemosQueryOptions]);
  const selection = useRecordSelection<TimelineEntry>();
  // 追加ボタンから開くメモの入力と、タイルから開く世話の入力（タイルの項目にチェックを入れて開く）
  const addingMemo = useToggle();
  const addingCare = useOpenWith<CareType[]>();
  const navigate = useNavigate();

  useAddShortcut(search.add, addingMemo.on);

  return (
    <>
      <AppBarContent>
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
        <FilterSearchField label="記録を検索" search={filter} />
      </AppBarContent>

      <Box sx={{ maxWidth: READING_MAX_WIDTH, mx: 'auto' }}>
        <ScrollAwayHeader pinned={filter.panelOpen}>
          <TimelineFilterForm
            open={filter.panelOpen}
            filters={filter.filters}
            onChange={filter.setFilters}
          />
          <StatusCards
            onOpenWeather={(day) => void navigate({ to: '/weather', search: { day } })}
            onAddCare={addingCare.open}
          />
        </ScrollAwayHeader>
        <PinnedMemoList onSelect={selection.open} />
        <TimelineList
          timeline={timeline}
          emptyMessage={filter.emptyMessage('記録')}
          onSelect={selection.open}
        />
      </Box>

      <AddFab label="メモを追加" onClick={addingMemo.on} />
      {addingMemo.value && <MemoForm onClose={addingMemo.off} />}
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
