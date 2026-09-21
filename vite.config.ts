import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildInfoDefine } from './build-info.ts';

export default defineConfig({
  define: buildInfoDefine,
  plugins: [
    // TanStack Router のプラグインは React プラグインより前に置く（公式の要件）
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
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
        // 打ち消して、どちらも manifest に出力しない。色を宣言しなければブラウザが
        // OS の配色に合わせた既定色を使い、ライト／ダークの切り替えに自動で追従する。
        theme_color: undefined,
        background_color: undefined,
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
      '/.well-known': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/\.well-known\//, '/api/well-known/'),
      },
    },
  },
});
