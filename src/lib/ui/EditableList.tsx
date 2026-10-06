import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem, { type ListItemProps } from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import type { ComponentProps, ReactNode } from 'react';

/**
 * 設定から開く管理の画面（ユーザー管理・取り込みルール・立替スケジュール）の一覧。どの画面も同じ形にする:
 * 行は上下を罫線で区切り、左にアイコン、その右に名前と説明、右端に鉛筆（押すと編集のシートを開く）。
 * 追加は右下の追加ボタン（`AddFab`）
 */
export function EditableList({ children }: { children: ReactNode }) {
  return <List disablePadding>{children}</List>;
}

type ItemProps = Omit<ListItemProps, 'children' | 'secondaryAction' | 'divider'> & {
  /** 並べ替えの取っ手のボタンに渡すもの（並べ替えのライブラリの ref と操作）。あればアイコンのさらに左に取っ手を置く */
  handle?: ComponentProps<typeof IconButton>;
  /** 左のアイコン（ユーザーのアバター、立替や取り込みルールの印）。枠の中央に置く */
  icon: ReactNode;
  primary: string;
  secondary?: string;
  /** 鉛筆の名前（読み上げとテスト用） */
  editLabel: string;
  onEdit: () => void;
};

/** `EditableList` の行 1 つ。並べ替えられる一覧（取り込みルール）は、取っ手（handle）の操作を渡し、行に並べ替えの ref を渡す */
export function EditableListItem({
  handle,
  icon,
  primary,
  secondary,
  editLabel,
  onEdit,
  ...item
}: ItemProps) {
  // 取っ手と並べる行は、アイコンの枠を印の大きさに詰めて名前と説明の幅を広く取る（印はアバターより小さい）
  const iconWidth = handle ? 20 : 40;
  return (
    <ListItem
      divider
      secondaryAction={
        <IconButton edge="end" aria-label={editLabel} onClick={onEdit}>
          <EditIcon />
        </IconButton>
      }
      {...item}
    >
      {handle && (
        <IconButton
          size="small"
          aria-label="並べ替え"
          // 指で引くときに画面がスクロールしないよう、取っ手の上ではブラウザのタッチ操作を止める
          sx={{ cursor: 'grab', touchAction: 'none' }}
          {...handle}
        >
          <DragIndicatorIcon />
        </IconButton>
      )}
      <ListItemAvatar sx={{ minWidth: iconWidth + 16 }}>
        <Box sx={{ width: iconWidth, height: 40, display: 'grid', placeItems: 'center' }}>
          {icon}
        </Box>
      </ListItemAvatar>
      <ListItemText
        primary={primary}
        secondary={secondary}
        slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } } }}
      />
    </ListItem>
  );
}
