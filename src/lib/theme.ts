import { createTheme } from '@mui/material/styles';

/**
 * アクセントは赤紫 1 色。secondary は使わず、強調はすべて primary で統一する。
 * CSS 変数テーマ + prefers-color-scheme 追従で、ダークモード切替時のちらつきを避ける。
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: { palette: { primary: { main: '#A0148C' } } },
    dark: { palette: { primary: { main: '#D06AC0' } } },
  },
  typography: {
    fontFamily: 'system-ui, sans-serif',
  },
  shape: { borderRadius: 10 },
});
