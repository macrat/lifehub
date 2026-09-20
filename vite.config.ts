import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    // 永続化キャッシュの buster。デプロイごとに変わる値にする（CI はコミット SHA、ローカルはビルド時刻）。
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA ?? String(Date.now())),
  },
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
        theme_color: '#A0148C',
        background_color: '#ffffff',
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
    },
  },
});
