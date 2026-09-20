import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

/** スマホ幅（sm 未満）かどうか。フォームのダイアログを全画面にし、グリッドの文字を詰める判断に使う。 */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

/** PC 幅（md 以上）かどうか。サイドナビと下部ナビの切替と同じ境界。 */
export function useIsDesktop(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.up('md'));
}
