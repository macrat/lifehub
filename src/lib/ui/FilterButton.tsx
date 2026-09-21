import FilterListIcon from '@mui/icons-material/FilterList';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';

type Props = {
  /** 絞り込みのフォームが開いているか */
  open: boolean;
  /** 効いている絞り込みの数（0 ならバッジは出ない） */
  count: number;
  onToggle: () => void;
};

/**
 * AppBar の検索窓の右に置く絞り込みボタン。押すと詳細な絞り込みのフォーム（FilterPanel）を開閉する。
 * フォームを閉じていても絞り込みは効いたままなので、効いている数をバッジで示す。
 */
export function FilterButton({ open, count, onToggle }: Props) {
  return (
    <IconButton aria-label="絞り込み" aria-expanded={open} onClick={onToggle} size="small">
      <Badge badgeContent={count} color="primary">
        <FilterListIcon />
      </Badge>
    </IconButton>
  );
}
