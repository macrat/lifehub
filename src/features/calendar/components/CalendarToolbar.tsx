import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import FilterListIcon from '@mui/icons-material/FilterList';
import TodayIcon from '@mui/icons-material/Today';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';

export type CalendarView = 'month' | 'week' | 'day' | 'list';

const VIEW_LABELS: Record<CalendarView, string> = {
  month: '月',
  week: '週',
  day: '日',
  list: 'リスト',
};

type Props = {
  view: CalendarView;
  /** 月・週・日表示の見出し（タップで年月の選択） */
  title: string;
  onOpenPicker: () => void;
  onToday: () => void;
  onChangeView: (view: CalendarView) => void;
  /** リスト表示の検索と絞り込み */
  list: {
    query: string;
    onChangeQuery: (q: string) => void;
    filtersOpen: boolean;
    onToggleFilters: () => void;
    activeFilters: number;
  };
};

/**
 * AppBar に収めるカレンダーの操作。前後への移動はスワイプ（スマホ）や表示切替に任せ、ボタンは置かない。
 * 左: 年月（タップで選択ダイアログ）／リスト表示では検索。右: 今日、表示の切替。
 */
export function CalendarToolbar({ view, title, onOpenPicker, onToday, onChangeView, list }: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {view === 'list' ? (
        <>
          <InputBase
            type="search"
            placeholder="検索"
            value={list.query}
            onChange={(e) => list.onChangeQuery(e.target.value)}
            inputProps={{ 'aria-label': '検索' }}
            sx={{
              flexGrow: 1,
              minWidth: 0,
              bgcolor: 'action.hover',
              borderRadius: 5,
              px: 1.5,
              py: 0.25,
            }}
          />
          <IconButton
            aria-label="絞り込み"
            aria-expanded={list.filtersOpen}
            onClick={list.onToggleFilters}
            size="small"
          >
            <Badge badgeContent={list.activeFilters} color="primary">
              <FilterListIcon />
            </Badge>
          </IconButton>
        </>
      ) : (
        <>
          <Button
            color="inherit"
            onClick={onOpenPicker}
            endIcon={<ArrowDropDownIcon />}
            aria-label={`${title}（年月を選ぶ）`}
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
