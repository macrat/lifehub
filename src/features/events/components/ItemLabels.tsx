import LocationOnIcon from '@mui/icons-material/LocationOnOutlined';
import NotesIcon from '@mui/icons-material/Notes';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import type { ComponentType } from 'react';

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

/** 場所。リンクにするかは使う側が決める（押せる行の中にはリンクを入れられないため） */
export function LocationLabel({
  location,
  noWrap = false,
}: {
  location: string;
  /** 1 行に収めて末尾を省略する（行の高さを揃えたい一覧で使う） */
  noWrap?: boolean;
}) {
  return (
    <IconText icon={LOCATION_ICON} variant="body2" color="textSecondary" noWrap={noWrap}>
      {location}
    </IconText>
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
    <Typography
      variant={variant}
      color={color}
      component="span"
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}
    >
      <Box
        component="span"
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: '1lh',
          flexShrink: 0,
          color: 'text.secondary',
        }}
      >
        <Icon viewBox={viewBox} sx={{ width: ICON_WIDTH, height: '100%' }} />
      </Box>
      <Box
        component="span"
        sx={[
          { minWidth: 0 },
          noWrap
            ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            : { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
        ]}
      >
        {children}
      </Box>
    </Typography>
  );
}
