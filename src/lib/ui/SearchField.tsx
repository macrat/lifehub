import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import type { ReactNode } from 'react';

/**
 * 検索窓と、その右に並べる操作をまとめた塊の最大幅。
 * PC で帯いっぱいに伸ばすと、サイドナビの上まで窓が伸びる割に読める文字数は増えず、
 * 目とポインタの移動だけが長くなる。
 */
const MAX_WIDTH = 560;

type Props = {
  /** 何を検索するのかを示す文言（プレースホルダと読み上げのラベル） */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 検索窓の右に並べる操作（絞り込みボタンなど）。窓と 1 つの塊として扱う */
  children?: ReactNode;
};

/**
 * AppBar に置く検索窓。type="search" にしてブラウザ標準のクリアボタン・履歴に任せる。
 * 窓と右の操作は 1 つの塊として帯の中央に置き、最大幅で頭打ちにする（狭い画面では帯の残り幅をすべて使う）。
 * 窓自身は塊の残り幅を使い、右の操作を押し出さないよう縮む。
 */
export function SearchField({ label, value, onChange, children }: Props) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        flexGrow: 1,
        minWidth: 0,
        maxWidth: MAX_WIDTH,
        mx: 'auto',
      }}
    >
      <InputBase
        type="search"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputProps={{ 'aria-label': label }}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          bgcolor: 'action.hover',
          borderRadius: 5,
          px: 1.5,
          py: 0.25,
        }}
      />
      {children}
    </Box>
  );
}
