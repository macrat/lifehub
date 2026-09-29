import AddIcon from '@mui/icons-material/Add';
import Backdrop from '@mui/material/Backdrop';
import SpeedDial, { speedDialClasses } from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import type { SxProps, Theme } from '@mui/material/styles';
import type { AddKind } from '../../../lib/add-pages.ts';
import { FAB_SX } from '../../../lib/ui/layout.ts';
import { CIRCLE_CLIP_PATH } from '../../../lib/ui/squircle.ts';
import { useToggle } from '../../../lib/ui/use-toggle.ts';
import { ADD_KINDS } from '../kinds.ts';

/** スクリムと追加ボタンは AppBar・下部ナビ（drawer + 1）より上に出す。展開中は画面全体が暗くなる */
const SCRIM_Z = (t: Theme) => t.zIndex.drawer + 2;

/** 背景はほぼ見えなくなるまで落とす（MUI 既定の 0.5 では暗い配色のときに展開が伝わらない） */
const SCRIM_SX: SxProps<Theme> = { zIndex: SCRIM_Z, bgcolor: 'rgba(0, 0, 0, 0.8)' };

const MENU_SX: SxProps<Theme> = {
  ...FAB_SX,
  zIndex: (t) => SCRIM_Z(t) + 1,
  // 影は FAB_SX が根元に掛けるので、開いた中の pill にも同じ影が付く（pill 自身の影は消す。PILL_SX）
  // ラベルの長さが違っても右端は FAB に揃える（既定の中央揃え・幅揃えにしない）
  alignItems: 'flex-end',
  [`& .${speedDialClasses.actions}`]: {
    alignItems: 'flex-end',
    // 項目どうしは 4px、FAB との間は 8px（既定は 8px / 16px）。
    // 既定の負のマージン（dialRadius = 32px）が下に食い込むぶんを padding に足す
    gap: '4px',
    pb: '40px',
  },
  // 展開するとスクワークルから円へ変わり、アイコンも + から × になる
  // （点の数が同じ polygon どうしなので、形がなめらかに補間される）
  [`& .${speedDialClasses.fab}`]: {
    transition: 'clip-path .2s',
    '&[aria-expanded="true"]': { clipPath: CIRCLE_CLIP_PATH },
  },
};

/**
 * ラベル付きの pill。高さ 56px・完全な角丸・左右 24px の余白で、FAB と同じ右端に揃える
 * （extended Fab の既定は高さ 48px・左右 16px）。間隔は MENU_SX 側で決めるのでマージンは持たない。
 * SpeedDialAction 既定の背景（paper）はスクリムに沈むので、浮くグレーにする。
 */
const PILL_SX: SxProps<Theme> = {
  height: 56,
  borderRadius: '28px',
  px: 3,
  gap: 1,
  m: 0,
  boxShadow: 'none',
  bgcolor: 'grey.300',
  color: 'grey.900',
  '&:hover': { bgcolor: 'grey.A100' },
};

type Props<K extends AddKind> = {
  /** ボタンの名前（読み上げとテスト用） */
  label: string;
  /** 出す種類と順（SpeedDial は下から上に開くので、先頭が一番下） */
  kinds: readonly K[];
  /** 種類が選ばれた。入力を出すのは画面の側（開いている入力は画面の状態） */
  onSelect: (kind: K) => void;
};

/**
 * 右下の追加ボタンのうち、種類を選んでから入力を開くもの（カレンダーの予定・タスク）。
 * 選ばれた種類を画面へ渡すだけで、入力を出すのは画面の側。種類を選ばない画面は `AddFab`。
 *
 * 展開したときの見た目は Google カレンダーに揃える: 背景をスクリムで暗くし、アイコンとラベルを収めた
 * pill を右揃えで縦に並べる。ラベルはツールチップではなくボタンの中に出すので、タッチでも読める。
 */
export function AddMenu<K extends AddKind>({ label, kinds, onSelect }: Props<K>) {
  const { value: expanded, on: expand, off: collapse } = useToggle();
  const open = (kind: K) => {
    collapse();
    onSelect(kind);
  };

  return (
    <>
      <Backdrop open={expanded} onClick={collapse} sx={SCRIM_SX} />
      {/* transition.appear を切って、マウント時のズームを止める。タブを移動するたびに
          FAB が出現し直して見えるため。hidden を切り替えたときだけアニメーションする */}
      <SpeedDial
        ariaLabel={label}
        icon={<SpeedDialIcon icon={<AddIcon />} />}
        open={expanded}
        onOpen={(_, reason) => reason !== 'focus' && expand()}
        onClose={collapse}
        slotProps={{ transition: { appear: false } }}
        sx={MENU_SX}
      >
        {kinds.map((kind) => {
          const { label: kindLabel, icon: Icon } = ADD_KINDS[kind];
          return (
            <SpeedDialAction
              key={kind}
              icon={
                <>
                  <Icon />
                  {kindLabel}
                </>
              }
              slotProps={{ fab: { variant: 'extended', sx: PILL_SX } }}
              onClick={() => open(kind)}
            />
          );
        })}
      </SpeedDial>
    </>
  );
}
