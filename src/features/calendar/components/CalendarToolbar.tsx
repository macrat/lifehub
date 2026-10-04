import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import TodayIcon from '@mui/icons-material/Today';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { FilterSearchField } from '../../../lib/ui/FilterSearchField.tsx';
import type { PeriodView } from '../use-calendar-page.ts';
import type { CalendarView } from '../view.ts';

/** 見出しのタップで何が選べるか。表示している単位と選ぶ単位は揃える（リスト表示に見出しは無い） */
const PICKER_LABELS: Record<PeriodView, string> = {
  month: '年月を選ぶ',
  week: '週を選ぶ',
  day: '日付を選ぶ',
};

const VIEW_LABELS: Record<CalendarView, string> = {
  month: '月',
  week: '週',
  day: '日',
  list: 'リスト',
};

type Props = {
  view: CalendarView;
  /** 月・週・日表示の見出し（タップで年月・週・日の選択） */
  title: string;
  onOpenPicker: () => void;
  onToday: () => void;
  onChangeView: (view: CalendarView) => void;
  /** リスト表示の検索と絞り込み（`useFilterSearch` の戻り値） */
  search: ComponentProps<typeof FilterSearchField>['search'];
};

/**
 * AppBar に収めるカレンダーの操作。前後への移動はスワイプ（スマホ）や表示切替に任せ、ボタンは置かない。
 * 左: 見出し（タップで選択ダイアログ）／リスト表示では検索。右: 今日、表示の切替。
 */
export function CalendarToolbar({
  view,
  title,
  onOpenPicker,
  onToday,
  onChangeView,
  search,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {view === 'list' ? (
        <FilterSearchField label="検索" search={search} />
      ) : (
        <>
          <Button
            color="inherit"
            onClick={onOpenPicker}
            endIcon={<ArrowDropDownIcon />}
            aria-label={`${title}（${PICKER_LABELS[view]}）`}
            sx={{
              minWidth: 0,
              px: 1,
              ml: -1,
              fontSize: '1rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              '& .MuiButton-endIcon': { ml: 0 },
            }}
          >
            {title}
          </Button>
          <IconButton aria-label="今日" onClick={onToday} size="small" sx={{ ml: 'auto' }}>
            <TodayIcon />
          </IconButton>
        </>
      )}
      <Button
        color="inherit"
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        endIcon={<ArrowDropDownIcon />}
        aria-label="表示の切替"
        aria-haspopup="menu"
        sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap', '& .MuiButton-endIcon': { ml: 0 } }}
      >
        {VIEW_LABELS[view]}
      </Button>
      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
          <MenuItem
            key={v}
            selected={v === view}
            onClick={() => {
              setMenuAnchor(null);
              onChangeView(v);
            }}
          >
            {VIEW_LABELS[v]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
