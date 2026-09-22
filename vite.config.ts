import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildInfoDefine } from './build-info.ts';
import { SURFACE } from './shared/color.ts';
import { SHORTCUTS, shortcutIconSrc } from './src/lib/shortcuts.ts';

/**
 * ステータスバー（スマホ）やタイトルバー（PC）に使う色を index.html に注入する。
 * 値はアプリの面の色そのもの（`shared/color.ts` の `SURFACE`）なので、帯が途切れずに繋がって見える。
 *
 * manifest の `theme_color` は 1 色しか持てずライト／ダークを切り替えられないので使わず、
 * メディアクエリを付けられる meta の方に置く。index.html に直書きするとテーマと二重管理になる。
 */
function themeColorMeta(): Plugin {
  return {
    name: 'lifehub:theme-color-meta',
    transformIndexHtml: () =>
      Object.entries(SURFACE).map(([scheme, content]) => ({
        tag: 'meta',
        attrs: { name: 'theme-color', media: `(prefers-color-scheme: ${scheme})`, content },
        injectTo: 'head',
      })),
  };
}

export default defineConfig({
  define: buildInfoDefine,
  plugins: [
    // TanStack Router のプラグインは React プラグインより前に置く（公式の要件）
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    themeColorMeta(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*'],
      manifest: {
        name: 'LifeHub',
        short_name: 'LifeHub',
        description: '家庭にまつわるあらゆる機能を集めた仕組み',
        lang: 'ja',
        display: 'standalone',
        start_url: '/',
        // vite-plugin-pwa の既定値（theme_color: #42b883, background_color: #ffffff）を
        // 打ち消して、どちらも manifest に出力しない。manifest の色は 1 色しか持てず
        // ライト／ダークを切り替えられないため。theme-color はメディアクエリ付きの
        // meta（themeColorMeta）で配色ごとに渡す。
        theme_color: undefined,
        background_color: undefined,
        shortcuts: SHORTCUTS.map(({ kind, name, shortName, url }) => ({
          name,
          short_name: shortName,
          url,
          icons: [{ src: shortcutIconSrc(kind), sizes: '192x192', type: 'image/png' }],
        })),
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      // OAuth の探索メタデータ（本番は vercel.json の rewrite が同じ役目を果たす）
      '/.well-known': 'http://localhost:3000',
    },
  },
});
