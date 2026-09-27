import LocationOnIcon from '@mui/icons-material/LocationOnOutlined';
import NotesIcon from '@mui/icons-material/Notes';
import Link from '@mui/material/Link';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import type { ComponentType } from 'react';
import { isIOS } from '../../../lib/platform.ts';
import { mapSearchUrl } from '../map-search-url.ts';

/**
 * 予定・タスクの場所とメモ。詳細とホームのタイムラインで同じアイコンを添え、何の情報かを見分けられるようにする。
 * 場所だけにアイコンがあると左に隙間ができて段がずれて見えるので、メモにも付けて左端を揃える
 */

/**
 * アイコンの絵の幅（px）。どのアイコンも絵そのものをこの幅に収めるので、絵の左右の端と右の文字の左端が
 * 行をまたいで揃い、絵の左端は上の段（タイトルなど）の文字の左端とも揃う。
 * 場所のピン（縦長）が 1 行の高さ（body2 で 20px）に収まる幅にする
 */
const ICON_WIDTH = 12;

/**
 * アイコンと、その絵が実際に描かれている範囲（24×24 の中の viewBox）。
 * Material Icons は絵ごとに 24×24 の中の余白が違う（ピンは幅 14、横線は幅 18）ので、
 * 枠のまま並べると絵の左右の端がずれる。viewBox を絵の範囲に切り詰めて余白を無くし、幅を揃える
 */
type LabelIcon = { Icon: ComponentType<SvgIconProps>; viewBox: string };
const LOCATION_ICON: LabelIcon = { Icon: LocationOnIcon, viewBox: '5 2 14 20' };
const NOTE_ICON: LabelIcon = { Icon: NotesIcon, viewBox: '3 6 18 12' };

/**
 * 押せる範囲をアイコンと文字だけにする（行いっぱいに広げない）。
 * 押せる行（`PressableRow`）の中に置くと、行の残りを押せば予定が開き、狙って押したときだけ地図が開く
 */
const LOCATION_LINK_SX = { display: 'block', width: 'fit-content', maxWidth: '100%' } as const;

/** 場所。押すと地図でその場所を検索する（iPhone / iPad では Apple のマップ、それ以外では Google マップ） */
export function LocationLink({
  location,
  noWrap,
}: {
  location: string;
  /** 1 行に収めて末尾を省略する（行の高さを揃えたい一覧で使う） */
  noWrap?: boolean;
}) {
  return (
    <Link
      href={mapSearchUrl(location, isIOS)}
      target="_blank"
      rel="noreferrer"
      color="textSecondary"
      underline="hover"
      sx={LOCATION_LINK_SX}
    >
      <IconText icon={LOCATION_ICON} variant="body2" noWrap={noWrap}>
        {location}
      </IconText>
    </Link>
  );
}

/** メモ。改行はそのまま出す。文字の大きさは周りの本文に合わせて使う側が決める */
export function NoteLabel({
  note,
  variant = 'body2',
}: {
  note: string;
  variant?: TypographyProps['variant'];
}) {
  return (
    <IconText icon={NOTE_ICON} variant={variant}>
      {note}
    </IconText>
  );
}

/** IconText の体裁。一覧の行ごとに作り直さないよう、動かない sx はここに置く */
const ROOT_SX = { display: 'flex', alignItems: 'flex-start', gap: 1 } as const;
/**
 * アイコン。font-size を文字から受け継ぐので、1lh が文字の 1 行の高さになる。
 * 絵は既定の preserveAspectRatio（xMidYMid meet）で枠の上下中央に置かれる
 */
const ICON_SX = {
  width: ICON_WIDTH,
  height: '1lh',
  flexShrink: 0,
  color: 'text.secondary',
} as const;
const TEXT_SX = { minWidth: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;
const NOWRAP_TEXT_SX = { minWidth: 0 } as const;

/**
 * 左にアイコン、右に文字。アイコンは文字の 1 行目の高さ（1lh）の中で上下中央に置くので、
 * 文字が折り返しても 1 行目に揃い、文字の大きさが変わっても揃ったままになる。
 * 絵は幅 ICON_WIDTH・高さ 1lh の枠に縦横比を保って収める（どのアイコンも幅で決まる）ので、
 * 文字の大きさが違うホームと詳細でも同じ大きさになる
 */
function IconText({
  icon: { Icon, viewBox },
  variant,
  color,
  noWrap = false,
  children,
}: {
  icon: LabelIcon;
  variant: TypographyProps['variant'];
  color?: TypographyProps['color'];
  noWrap?: boolean;
  children: string;
}) {
  return (
    <Typography variant={variant} color={color} component="span" sx={ROOT_SX}>
      <Icon viewBox={viewBox} fontSize="inherit" sx={ICON_SX} />
      <Typography
        variant="inherit"
        color="inherit"
        component="span"
        noWrap={noWrap}
        sx={noWrap ? NOWRAP_TEXT_SX : TEXT_SX}
      >
        {children}
      </Typography>
    </Typography>
  );
}
