import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  /** 絞り込みの入力欄（TextField など） */
  children: ReactNode;
};

/**
 * AppBar の下に開く詳細な絞り込みのフォーム（開閉は FilterButton）。
 * 入力欄は狭い画面では 2 列、広い画面では入る数だけ横に並べる（auto-fit なので欄が増えても指定は変わらない）。
 * 閉じたら入力欄そのものを取り除く（unmountOnExit）。絞り込みの値は URL にあるので開き直せば戻り、
 * 閉じている間の画面には同じラベルの欄が二重に存在しない。
 */
export function FilterPanel({ open, children }: Props) {
  return (
    <Collapse in={open} unmountOnExit>
      {/* 読み上げで「絞り込み」のひとまとまりとして扱えるように名前を付ける */}
      <Box
        role="group"
        aria-label="絞り込み"
        sx={{
          display: 'grid',
          gap: 1,
          px: { xs: 2, md: 0 },
          pt: 1,
          mb: 2,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(auto-fit, minmax(160px, 1fr))',
          },
        }}
      >
        {children}
      </Box>
    </Collapse>
  );
}
