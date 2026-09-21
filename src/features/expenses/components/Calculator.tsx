import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { ReactNode } from 'react';
import { CALCULATOR_KEYS, type CalculatorKey } from '../calculator.ts';

type Props = {
  onPress: (key: CalculatorKey) => void;
};

/** 式の中では打ちやすい文字のままにして、見た目だけ整える。アイコンには読み上げ用の名前を付ける */
const LABELS: Partial<Record<CalculatorKey, ReactNode>> = {
  '-': '−',
  '⌫': <BackspaceOutlinedIcon />,
};
const ARIA_LABELS: Partial<Record<CalculatorKey, string>> = { '⌫': '1 文字消す' };

const isDigit = (key: CalculatorKey) => /^\d+$/.test(key);

/**
 * 金額欄に入力する電卓のキーパッド。表示に専念し、式は呼び出し側が持つ。
 * 余った高さをすべて使うグリッドで、キーは行数・列数に合わせて伸びる（= は縦 2 つ、0 は横 2 つ分）。
 * 数字は地の色、演算子はアクセント色、= は塗りつぶしで、押し間違えないように見分けをつける。
 */
export function Calculator({ onPress }: Props) {
  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: `repeat(${CALCULATOR_KEYS.length}, 1fr)`,
        gap: 1,
        minHeight: 260,
      }}
    >
      {CALCULATOR_KEYS.flat().map((key) => (
        <Button
          key={key}
          onClick={() => onPress(key)}
          aria-label={ARIA_LABELS[key]}
          variant={key === '=' ? 'contained' : 'outlined'}
          color={isDigit(key) ? 'inherit' : 'primary'}
          sx={{
            minWidth: 0,
            fontSize: '1.375rem',
            borderColor: isDigit(key) ? 'divider' : undefined,
            gridRow: key === '=' ? 'span 2' : undefined,
            gridColumn: key === '0' ? 'span 2' : undefined,
          }}
        >
          {LABELS[key] ?? key}
        </Button>
      ))}
    </Box>
  );
}
