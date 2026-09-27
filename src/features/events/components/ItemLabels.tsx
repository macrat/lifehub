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
    <IconText icon={LocationOnIcon} variant="body2" color="textSecondary" noWrap={noWrap}>
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
    <IconText icon={NotesIcon} variant={variant}>
      {note}
    </IconText>
  );
}

/**
 * 左にアイコン、右に文字。アイコンは文字の 1 行目の高さ（1lh）の中で上下中央に置くので、
 * 文字が折り返しても 1 行目に揃い、文字の大きさが変わっても揃ったままになる
 */
function IconText({
  icon: Icon,
  variant,
  color,
  noWrap = false,
  children,
}: {
  icon: ComponentType<SvgIconProps>;
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
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
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
        <Icon fontSize="small" />
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
