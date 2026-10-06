import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Skeleton from '@mui/material/Skeleton';
import type { Breakpoint, SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { mergeSx } from './merge-sx.ts';
import { TILE_MASK } from './squircle.ts';

/** タイルの内側の余白（タイルと骨組みで同じ高さにする） */
const TILE_PADDING = 1;

type Props = {
  /**
   * 名前の左のアイコン（MUI の SvgIcon）。大きさはタイルが名前の字に合わせる。
   * 読み上げではアイコンに名乗らせない（名前がすぐ右にある）
   */
  icon?: ReactNode;
  label: string;
  /** 大きく出す今の値（「1日前」「24° / 18°」「¥1,200」） */
  value: string;
  /**
   * 値の下の補足。空でも 1 行分の高さを取り、並んだタイルの高さを揃える。
   * 省くと補足の行を置かない（どのタイルも補足を持たない並び。立替の精算）
   */
  sub?: string;
  /**
   * 別の画面の同じタイルとその場で動く名前（View Transition。タイルごと動く）。相手の画面に同じタイルが無ければ付けない
   */
  transitionName?: string;
  /** 押したとき。省くと押せない（見せるだけの値。お金の画面の口座） */
  onClick?: () => void;
};

/**
 * 最新の状態のタイル（天気、レモンの項目ごとの状況、立替の精算）。名前・値・補足の 3 段で、どのタイルも同じ大きさに並ぶ。
 * 形は角だけなめらかな角丸（`TILE_MASK`。押したときの波紋も同じ形に収まる）。押すとその記録の入力を開く（押す先の無い値は押せない）。
 */
export function StatusTile({ icon, label, value, sub, transitionName, onClick }: Props) {
  return (
    <Card
      sx={{
        bgcolor: 'action.hover',
        borderRadius: 0,
        mask: TILE_MASK,
        viewTransitionName: transitionName,
      }}
    >
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ p: TILE_PADDING, height: '100%' }}>
          <TileLines icon={icon} label={label} value={value} sub={sub} />
        </CardActionArea>
      ) : (
        <Box sx={{ p: TILE_PADDING }}>
          <TileLines icon={icon} label={label} value={value} sub={sub} />
        </Box>
      )}
    </Card>
  );
}

/**
 * 読み込み中に出すタイル 1 つ分の骨組み。中にタイルと同じ 3 段（見えない）を置いて高さを決めるので、
 * タイルの文字の大きさや余白を変えても骨組みの高さがずれず、読み込めたときに形も高さも変わらない。
 * WHY NOT 高さを数で書く: タイルは高さを持たず中身で決まるので、数を書くとタイルを直したときに黙ってずれる。
 */
export function StatusTileSkeleton({ withSub = true }: { withSub?: boolean }) {
  return (
    <Skeleton variant="rectangular" sx={{ p: TILE_PADDING, mask: TILE_MASK, maxWidth: 'none' }}>
      <TileLines label={'\u00a0'} value={'\u00a0'} sub={withSub ? '' : undefined} />
    </Skeleton>
  );
}

/** タイルの中身の 3 段。補足が空でも 1 行分の高さを取り、並んだタイルの高さを揃える（省けば 2 段） */
function TileLines({
  icon,
  label,
  value,
  sub,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <>
      <Typography
        variant="caption"
        color="textSecondary"
        component="p"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          // アイコンは名前の字と同じくらいに揃える（渡す側に大きさを持たせない）
          '& .MuiSvgIcon-root': { fontSize: '1rem' },
        }}
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
        }}
      >
        {value}
      </Typography>
      {sub !== undefined && (
        <Typography variant="caption" color="textSecondary" component="p" noWrap>
          {sub || ' '}
        </Typography>
      )}
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
  return <Box sx={mergeSx({ display: 'grid', gridTemplateColumns, gap: 1 }, sx)}>{children}</Box>;
}
