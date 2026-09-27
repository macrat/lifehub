import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { SxProps, Theme } from '@mui/material/styles';
import { type ReactNode, useId } from 'react';
import { mergeSx } from './merge-sx.ts';
import { useRecordPress } from './use-record-press.ts';

const ROOT_SX = { position: 'relative' } as const;

/** 行の下の区切り線 */
const DIVIDER_SX = { position: 'relative', borderBottom: 1, borderColor: 'divider' } as const;

/**
 * 押せる範囲。行全体に広げて中身の下に敷く。
 * 行は枠線も背景も持たず見た目の上で形が無いので、押したときの色（波紋）も角を丸めず端から端まで出す
 */
const BUTTON_SX = { position: 'absolute', inset: 0 } as const;

/**
 * 中身。押せる範囲の上に重ね（position を持たせて下の押せる範囲より手前に描く）、中身そのものは押せないようにして、
 * 押すと下の押せる範囲を押したことになるようにする。中のリンクだけは押せるようにし、押すとリンクが開く
 */
const CONTENT_SX = {
  position: 'relative',
  display: 'flex',
  pointerEvents: 'none',
  '& a[href]': { pointerEvents: 'auto' },
} as const;

/**
 * ボタンの名前にする中身の文字を囲む枠。枠そのものは箱を作らず、中身は枠が無いときと同じく
 * 行の並べ方（layoutSx）にそのまま並ぶ
 */
const LABEL_SX = { display: 'contents' } as const;

/** 操作できる印の枠。枠そのものは押せず、印だけを押せるようにする（印の外は下の行を押したことになる） */
const CONTROL_SX = { '& > *': { pointerEvents: 'auto' } } as const;

/**
 * 記録 1 件を出す一覧の行の骨組み。印（あれば）を含む行全体を押せる範囲にし、どこを押しても行全体に波紋が広がる。
 * 単押しは閲覧、長押しは編集（`useRecordPress`）。
 * ホームのタイムライン（`TimelineRow`）・リスト表示の行（`MarkedRow`）・レモンの記録の一覧（`CareLogList`）が
 * 同じ押し方になるよう、ここ 1 か所に置く。
 *
 * ボタンの中にはボタンもリンクも入れられないので、押せる範囲（中身の無いボタン）を行全体に敷き、
 * その上に押せない中身を重ねる。ボタンの名前は中身の文字（aria-labelledby）にする。
 * 中身の中のリンク（予定の場所から地図を開く）と操作できる印だけは押せるようにしてあり、
 * そこを押せばそれが開き・切り替わり、それ以外を押せば行が開いて、波紋は中身の下に広がる。
 *
 * 左に印を置く行は markSx で印の枠を決め、見せるだけの印は mark に、操作できる印（タスクの完了のチェックボックス）は
 * control に渡す（どちらか一方）。
 */
/**
 * 印の渡し方。印（mark・control）を渡すなら、その枠（markSx）も要る。
 * 枠が無いと印を置く場所が無く、黙って消えたり位置がずれたりするので、型で組み合わせを強いる
 */
type MarkProps =
  | {
      /** 印の枠。行をまたいで中身の左端が揃うよう、幅を決め打ちにする */
      markSx: SxProps<Theme>;
      /** 印（見せるだけのもの）。押すと行を押したことになる */
      mark?: ReactNode;
      /** 操作できる印。印だけは行と別に押せて、押すとその操作になる */
      control?: ReactNode;
    }
  | { markSx?: undefined; mark?: undefined; control?: undefined };

export function PressableRow({
  onSelect,
  mark,
  control,
  markSx,
  layoutSx,
  divider = false,
  sx,
  children,
}: MarkProps & {
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 中身の並べ方（余白・揃え・間隔） */
  layoutSx: SxProps<Theme>;
  /** 行の下に区切り線を引く */
  divider?: boolean;
  /** 行全体の体裁（完了した行を薄くする、View Transition の名前） */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  const contentId = useId();
  return (
    <Box sx={mergeSx(divider ? DIVIDER_SX : ROOT_SX, sx)}>
      <ButtonBase {...press} aria-labelledby={contentId} sx={BUTTON_SX} />
      <Box sx={mergeSx(CONTENT_SX, layoutSx)}>
        {markSx && (
          <Box sx={mergeSx(markSx, control ? CONTROL_SX : undefined)}>{control ?? mark}</Box>
        )}
        <Box id={contentId} sx={LABEL_SX}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
