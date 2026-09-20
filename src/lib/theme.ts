import { alpha, createTheme } from '@mui/material/styles';

/**
 * Material Design 3 の見た目に寄せた設定。
 * - アクセントは赤紫 1 色。secondary は使わず、強調はすべて primary で統一する。
 * - Top App Bar と Navigation Bar はサーフェス色（M3 の仕様。M2 のようなプライマリ色の帯にしない）。
 * - CSS 変数テーマ + prefers-color-scheme 追従で、ダークモード切替時のちらつきを避ける。
 */
const PRIMARY_LIGHT = '#A0148C';
const PRIMARY_DARK = '#D06AC0';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'media' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: PRIMARY_LIGHT },
        background: { default: '#ffffff', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: PRIMARY_DARK },
        background: { default: '#121212', paper: '#121212' },
      },
    },
  },
  typography: {
    fontFamily: 'system-ui, sans-serif',
  },
  shape: { borderRadius: 12 },
  components: {
    MuiAppBar: {
      defaultProps: { color: 'default', elevation: 0, enableColorOnDark: false },
      styleOverrides: {
        root: ({ theme: t }) => ({
          backgroundColor: t.vars.palette.background.paper,
          color: t.vars.palette.text.primary,
          borderBottom: `1px solid ${t.vars.palette.divider}`,
        }),
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
    },
    MuiFab: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: 16,
          boxShadow: t.shadows[3],
        }),
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          backgroundColor: t.vars.palette.background.paper,
          borderTop: `1px solid ${t.vars.palette.divider}`,
        }),
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          minWidth: 0,
          padding: '6px 4px 8px',
          color: t.vars.palette.text.secondary,
          '& .MuiSvgIcon-root': {
            padding: '2px 16px',
            borderRadius: 16,
            boxSizing: 'content-box',
            transition: 'background-color .15s',
          },
          '&.Mui-selected': {
            color: t.vars.palette.text.primary,
            '& .MuiSvgIcon-root': { backgroundColor: alpha(PRIMARY_LIGHT, 0.16) },
          },
          '& .MuiBottomNavigationAction-label': { whiteSpace: 'nowrap', fontSize: '0.7rem' },
          '&.Mui-selected .MuiBottomNavigationAction-label': { fontSize: '0.7rem' },
        }),
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 28 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 20, textTransform: 'none' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});
