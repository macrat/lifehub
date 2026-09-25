import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import type { ComponentType } from 'react';
import { TILE_MASK } from './squircle.ts';

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
      <CardActionArea onClick={onClick} sx={{ p: 1, height: '100%' }}>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <Icon sx={{ fontSize: '1rem' }} />
          {label}
        </Typography>
        <Typography
          variant="h6"
          component="p"
          noWrap
          sx={{
            lineHeight: 1.3,
            fontVariantNumeric: 'tabular-nums',
            // 動く絵は要素の幅で撮られるので、文字の幅に縮めておく（行の幅のままだと、行の幅の違う
            // 相手との間で文字ごと横に引き伸ばされる）
            width: 'fit-content',
            viewTransitionName: 'value' in transitionName ? transitionName.value : undefined,
          }}
        >
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" noWrap>
          {sub || ' '}
        </Typography>
      </CardActionArea>
    </Card>
  );
}
