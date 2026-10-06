import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import IconButton from '@mui/material/IconButton';
import { useGoBack } from './use-go-back.ts';

/**
 * AppBar の左端の戻るボタン。下部ナビに置かず、ほかの画面から開く画面（天気・口座の推移）に置く。
 * アプリの中から来たのでなければ fallback へ移る（`useGoBack`）
 */
export function BackButton({ fallback }: { fallback?: string }) {
  const goBack = useGoBack(fallback);
  return (
    <IconButton aria-label="戻る" onClick={goBack} size="small">
      <ArrowBackIosNewIcon fontSize="small" />
    </IconButton>
  );
}
