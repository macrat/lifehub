import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type FormEvent, type ReactNode, useState } from 'react';
import { BottomSheet } from './BottomSheet.tsx';
import { Dialog } from './Dialog.tsx';
import { useDialogHistory } from './dialog-history.ts';
import { SubmitButton } from './SubmitButton.tsx';
import { useIsMobile } from './use-breakpoint.ts';

/** 三点リーダーのメニューに並べる操作。削除のような、表に出しておきたくない操作を集める */
export type RecordAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** 取り返しのつかない操作。赤で出す */
  danger?: boolean;
};

/** 読むだけの状態を持つシート（既にある記録の詳細）。鉛筆を押すと入力欄に変わる */
type Viewable = {
  editing: boolean;
  onEdit: () => void;
};

/** ずっと入力欄のシート（記録の追加） */
type AlwaysEditing = {
  editing?: never;
  onEdit?: never;
};

type Props = {
  /** 見出し。記録そのものの名前（予定のタイトル、立替の内容、世話の種別） */
  title: string;
  /** 見出しに取り消し線を引く（完了したタスク） */
  struck?: boolean;
  /** 出しているか。送信中は閉じた見た目にする（入力は残したまま） */
  open?: boolean;
  onClose: () => void;
  /** 三点リーダーのメニュー。何も無ければ出さない */
  actions?: RecordAction[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 保存の失敗など、項目に紐づかないエラー */
  error?: string | null;
  /** 入力欄、または読むだけの中身 */
  children: ReactNode;
} & (Viewable | AlwaysEditing);

/**
 * 記録 1 件を出すシート。追加のフォームも、既にある記録の詳細と編集も、同じ入れ物で扱う。
 * スマホでは画面の下から出るシート（`BottomSheet`。予定のクイック入力と同じもの）、
 * PC では中央のダイアログ。どちらも中身の高さのぶんだけ出るので、項目が少ないほど小さく収まり、
 * 読むだけの詳細から鉛筆で入力欄に変われば、その高さまで広がる。
 *
 * 操作は見出しの帯に集める: 左に閉じる（バツ）、右に鉛筆（編集中・追加中は保存）と三点リーダー。
 * スマホでは上へのスワイプが鉛筆と同じで、下へ下げきると閉じる。
 * 予定・立替・レモンで同じ入れ物を使い、違うのは中身と三点リーダーに並ぶ操作だけ。
 *
 * 全画面にするほど項目が多いフォーム（予定・タスク・ユーザー）は `FormDialog` を使う。
 */
export function RecordSheet(props: Props) {
  const isMobile = useIsMobile();
  // 履歴の項目はそれぞれが自分で持つ（`useDialogHistory`）ので、常にどちらか一方だけをマウントする
  return isMobile ? <Sheet {...props} /> : <Centered {...props} />;
}

/** スマホ: 画面の下から出るシート。下へスワイプすると閉じる */
function Sheet(props: Props) {
  // 全画面のフォームと同じく、戻る操作では前の画面へ行かずシートだけを閉じる
  useDialogHistory(props.onClose);
  return (
    <BottomSheet
      open={props.open}
      onClose={props.onClose}
      label={props.title}
      // 上へのスワイプは鉛筆と同じ（読むだけで開いたシートを、指だけで編集まで広げられる）
      onExpand={props.editing === false ? props.onEdit : undefined}
    >
      <Body {...props} />
    </BottomSheet>
  );
}

/** PC: 中央のダイアログ。中身と操作の並びはシートと同じ */
function Centered(props: Props) {
  return (
    <Dialog open={props.open ?? true} keepMounted onClose={props.onClose} fullWidth maxWidth="xs">
      <Body {...props} />
    </Dialog>
  );
}

function Body({
  title,
  struck,
  onClose,
  editing = true,
  onEdit,
  actions = [],
  onSubmit,
  error,
  children,
}: Props) {
  return (
    <Stack component="form" onSubmit={onSubmit} noValidate sx={{ minHeight: 0 }}>
      <Stack spacing={1} sx={{ pb: 1 }}>
        <SheetHeader title={title} struck={struck} onClose={onClose}>
          {editing ? (
            <SubmitButton />
          ) : (
            <IconButton aria-label="編集" onClick={onEdit}>
              <EditIcon />
            </IconButton>
          )}
          {actions.length > 0 && <ActionsMenu actions={actions} />}
        </SheetHeader>
        {error && (
          <Alert severity="error" sx={{ mx: 2 }}>
            {error}
          </Alert>
        )}
      </Stack>
      <Stack
        data-sheet-scroll
        spacing={2}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'auto',
          touchAction: 'pan-y',
          px: 2,
          // 縮んだラベルは入力欄の上端にはみ出すので、その分の余白を空ける
          pt: 1,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </Stack>
    </Stack>
  );
}

/**
 * シートの上端の帯。左に閉じる（バツ）、右に呼び出し側の操作を置く。
 * シートがどこまで下がっていても上端だけは必ず見えているので、主な操作はここに集める。
 * 見出しを持たないシート（予定のクイック入力）も、閉じると保存の位置を揃えるためにこれを使う。
 */
export function SheetHeader({
  title,
  struck = false,
  onClose,
  children,
}: {
  title?: string;
  struck?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Stack direction="row" sx={{ px: 1, alignItems: 'center' }}>
      <IconButton aria-label="閉じる" onClick={onClose}>
        <CloseIcon />
      </IconButton>
      <Typography
        variant="h6"
        component={title ? 'h2' : 'span'}
        sx={{ flexGrow: 1, minWidth: 0, px: 1, textDecoration: struck ? 'line-through' : 'none' }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function ActionsMenu({ actions }: { actions: RecordAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton aria-label="その他の操作" onClick={(event) => setAnchor(event.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            onClick={() => {
              setAnchor(null);
              action.onClick();
            }}
            sx={action.danger ? { color: 'error.main' } : undefined}
          >
            <ListItemIcon sx={action.danger ? { color: 'error.main' } : undefined}>
              {action.icon}
            </ListItemIcon>
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
