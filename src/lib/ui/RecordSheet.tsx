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
import { type FormEvent, type ReactNode, type Ref, useState } from 'react';
import { BottomSheet } from './BottomSheet.tsx';
import { Dialog } from './Dialog.tsx';
import { useDialogHistory } from './dialog-history.ts';
import { SubmitButton } from './SubmitButton.tsx';
import { useIsMobile } from './use-breakpoint.ts';

/**
 * 中身の左右の余白。Material 3 のダイアログは四辺 24dp（`material-web` の dialog も同じ）なので
 * PC ではそれに合わせ、画面の端まで使うスマホのシートは 16dp にする。
 */
const GUTTER = { xs: 2, sm: 3 };

/** 三点リーダーのメニューに並べる操作。削除のような、表に出しておきたくない操作を集める */
export type RecordAction = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** 取り返しのつかない操作。赤で出す */
  danger?: boolean;
};

/**
 * 読むだけの状態を持つシート（既にある記録の詳細）。鉛筆を押すと入力欄に変わる。
 * onEdit が無ければ直せない記録で、鉛筆を出さない。
 */
type Viewable = {
  editing: boolean;
  onEdit?: () => void;
};

/** ずっと入力欄のシート（記録の追加） */
type AlwaysEditing = {
  editing?: never;
  onEdit?: never;
};

type Props = {
  /**
   * この入れ物の名前。読み上げにはいつも使い、見出しとして出すのは閲覧のときだけ。
   * 閲覧では記録そのものの名前（予定のタイトル、立替の内容、世話の種別）になる。
   * 入力しているときは、何を書いているかは入力欄そのものが示すので見出しは出さない。
   */
  title: string;
  /** 見出しに取り消し線を引く（完了したタスク） */
  struck?: boolean;
  /** 出しているか。送信中は閉じた見た目にする（入力は残したまま） */
  open?: boolean;
  onClose: () => void;
  /**
   * 項目が多いフォーム（予定・タスク・ユーザー）。中身の高さでは結局画面を覆うので、
   * スマホでは最初から画面いっぱいで出し、PC では少し広いダイアログにする。
   */
  full?: boolean;
  /** 三点リーダーのメニュー。何も無ければ出さない */
  actions?: RecordAction[];
  /**
   * 入力しているときだけ上端の帯の真ん中に出すもの（予定・タスクの種類の切り替え）。
   * 入力中の帯は見出しを出さず空いているので、シートの高さを増やさずに置ける
   */
  switcher?: ReactNode;
  /** 入力欄の form。入力の途中の値を送信の外で読むとき（種類を切り替えるとき）に使う */
  formRef?: Ref<HTMLFormElement>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 保存の失敗など、項目に紐づかないエラー */
  error?: string | null;
  /** 入力欄、または読むだけの中身 */
  children: ReactNode;
} & (Viewable | AlwaysEditing);

/**
 * 記録 1 件を出すシート。追加のフォームも、既にある記録の詳細と編集も、同じ入れ物で扱う。
 * スマホでは画面の下から出るシート（`BottomSheet`。予定のクイック入力と同じもの）、
 * PC では中央のダイアログ。中身の高さのぶんだけ出るので、項目が少ないほど小さく収まり、
 * 読むだけの詳細から鉛筆で入力欄に変われば、その高さまで広がる（`full` なら最初から画面いっぱい）。
 *
 * 操作は上端の帯に集める: 左に閉じる（バツ）、右に鉛筆（編集中・追加中は保存）と三点リーダー。
 * 帯に名前が出るのは閲覧のときだけで、入力しているときは入力欄に場所を譲る。
 * スマホでは上へのスワイプが鉛筆と同じで、下へ下げきると閉じる。
 * 予定・タスク・立替・レモン・ユーザーで同じ入れ物を使い、違うのは中身と三点リーダーの操作だけ。
 */
export function RecordSheet(props: Props) {
  const isMobile = useIsMobile();
  // 履歴の項目はそれぞれが自分で持つ（`useDialogHistory`）ので、常にどちらか一方だけをマウントする
  return isMobile ? <Sheet {...props} /> : <Centered {...props} />;
}

/** スマホ: 画面の下から出るシート。下へスワイプすると閉じる */
function Sheet(props: Props) {
  // 戻る操作では前の画面へ行かずシートだけを閉じる
  useDialogHistory(props.onClose);
  return (
    <BottomSheet
      open={props.open}
      onClose={props.onClose}
      label={props.title}
      full={props.full}
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
    <Dialog
      open={props.open ?? true}
      keepMounted
      onClose={props.onClose}
      label={props.title}
      fullWidth
      maxWidth={props.full ? 'sm' : 'xs'}
    >
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
  switcher,
  formRef,
  onSubmit,
  error,
  children,
}: Props) {
  return (
    <Stack component="form" ref={formRef} onSubmit={onSubmit} noValidate sx={{ minHeight: 0 }}>
      <Stack spacing={1} sx={{ pb: 1 }}>
        <SheetHeader
          title={editing ? undefined : title}
          struck={struck}
          onClose={onClose}
          middle={editing ? switcher : undefined}
        >
          {editing ? (
            <SubmitButton />
          ) : (
            onEdit && (
              <IconButton aria-label="編集" onClick={onEdit}>
                <EditIcon />
              </IconButton>
            )
          )}
          {actions.length > 0 && <ActionsMenu actions={actions} />}
        </SheetHeader>
        {error && (
          <Alert severity="error" sx={{ mx: GUTTER }}>
            {error}
          </Alert>
        )}
      </Stack>
      <Stack
        spacing={2}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: GUTTER,
          // 縮んだラベルは入力欄の上端にはみ出すので、その分の余白を空ける
          pt: 1,
          // シートは指の届く端まで使う（下端は画面の端）。ダイアログは四辺とも同じ余白にする
          pb: { xs: 'calc(16px + env(safe-area-inset-bottom))', sm: 3 },
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
 * 見出しの無い帯は真ん中が空くので、そこに `middle`（予定・タスクの切り替え）を置ける。
 */
export function SheetHeader({
  title,
  struck = false,
  middle,
  onClose,
  children,
}: {
  title?: string;
  struck?: boolean;
  /** 見出しの代わりに真ん中に置くもの。見出しがあれば出さない */
  middle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    // アイコンは 40px のボタンの中で 8px 内側にあるので、その分だけ左右を詰めて字面を中身に揃える
    <Stack
      direction="row"
      sx={{
        px: { xs: 1, sm: 2 },
        pt: { xs: 0, sm: 2 },
        alignItems: 'center',
      }}
    >
      <IconButton aria-label="閉じる" onClick={onClose}>
        <CloseIcon />
      </IconButton>
      {title === undefined && middle ? (
        <Stack direction="row" sx={{ flexGrow: 1, minWidth: 0, px: 1, justifyContent: 'center' }}>
          {middle}
        </Stack>
      ) : (
        <Typography
          variant="h6"
          component={title ? 'h2' : 'span'}
          sx={{ flexGrow: 1, minWidth: 0, px: 1, textDecoration: struck ? 'line-through' : 'none' }}
        >
          {title}
        </Typography>
      )}
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
