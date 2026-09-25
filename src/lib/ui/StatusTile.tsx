import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Skeleton from '@mui/material/Skeleton';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Breakpoint, SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ComponentType, ReactNode } from 'react';
import { TILE_MASK } from './squircle.ts';
import { textTransitionSx } from './text-transition.ts';

/** タイルの内側の余白（タイルと骨組みで同じ高さにする） */
const TILE_PADDING = 1;

type Props = {
  /** 名前の左のアイコン。読み上げではアイコンに名乗らせない（名前がすぐ右にある） */
  icon: ComponentType<SvgIconProps>;
  label: string;
  /** 大きく出す今の値（「1日前」「￥3,140」） */
  value: string;
  /** 値の下の補足。空でも 1 行分の高さを取り、並んだタイルの高さを揃える */
  sub: string;
  /**
   * 別の画面の同じものとその場で動く名前（View Transition）。`tile` はタイルごと、`value` は値だけが動く。
   * 相手の画面に同じタイルが在るならタイルごと、値だけが在るなら値だけに付ける
   */
  transitionName: { tile: string } | { value: string };
  onClick: () => void;
};

/**
 * 最新の状態のタイル（立替残高、レモンの項目ごとの状況）。名前・値・補足の 3 段で、どのタイルも同じ大きさに並ぶ。
 * 形は角だけなめらかな角丸（`TILE_MASK`。押したときの波紋も同じ形に収まる）。押すとその記録の入力を開く。
 */
export function StatusTile({ icon: Icon, label, value, sub, transitionName, onClick }: Props) {
  return (
    <Card
      sx={{
        bgcolor: 'action.hover',
        borderRadius: 0,
        mask: TILE_MASK,
        viewTransitionName: 'tile' in transitionName ? transitionName.tile : undefined,
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: TILE_PADDING, height: '100%' }}>
        <TileLines
          icon={<Icon sx={{ fontSize: '1rem' }} />}
          label={label}
          value={value}
          sub={sub}
          valueTransitionName={'value' in transitionName ? transitionName.value : undefined}
        />
      </CardActionArea>
    </Card>
  );
}

/**
 * 読み込み中に出すタイル 1 つ分の骨組み。中にタイルと同じ 3 段（見えない）を置いて高さを決めるので、
 * タイルの文字の大きさや余白を変えても骨組みの高さがずれず、読み込めたときに形も高さも変わらない。
 * WHY NOT 高さを数で書く: タイルは高さを持たず中身で決まるので、数を書くとタイルを直したときに黙ってずれる。
 */
export function StatusTileSkeleton() {
  return (
    <Skeleton variant="rectangular" sx={{ p: TILE_PADDING, mask: TILE_MASK, maxWidth: 'none' }}>
      <TileLines label={'\u00a0'} value={'\u00a0'} sub="" />
    </Skeleton>
  );
}

/** タイルの中身の 3 段。補足が空でも 1 行分の高さを取り、並んだタイルの高さを揃える */
function TileLines({
  icon,
  label,
  value,
  sub,
  valueTransitionName,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  sub: string;
  valueTransitionName?: string;
}) {
  return (
    <>
      <Typography
        variant="caption"
        color="textSecondary"
        component="p"
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        {icon}
        {label}
      </Typography>
      <Typography
        variant="h6"
        component="p"
        noWrap
        sx={{
          lineHeight: 1.3,
          fontVariantNumeric: 'tabular-nums',
          ...textTransitionSx(valueTransitionName),
        }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="textSecondary" component="p" noWrap>
        {sub || ' '}
      </Typography>
    </>
  );
}

/**
 * タイルを同じ幅で並べる格子（ホーム・レモン画面）。columns は列の数で、画面の幅ごとにも指定できる。
 * タイルとその骨組みを同じ格子に置き、読み込めたときに並びが変わらないようにする。
 */
export function TileGrid({
  columns,
  sx,
  children,
}: {
  columns: number | Partial<Record<Breakpoint, number>>;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const repeat = (n: number) => `repeat(${n}, minmax(0, 1fr))`;
  const gridTemplateColumns =
    typeof columns === 'number'
      ? repeat(columns)
      : Object.fromEntries(Object.entries(columns).map(([bp, n]) => [bp, repeat(n)]));
  return <Box sx={{ display: 'grid', gridTemplateColumns, gap: 1, ...sx }}>{children}</Box>;
}
