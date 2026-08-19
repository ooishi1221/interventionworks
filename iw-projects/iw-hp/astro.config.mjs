// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://intervention.jp',
  integrations: [
    sitemap({
      // index させる公開ページだけ。demo/ = クライアントデモ、thanks/ = noindex 済みフォーム完了ページ
      filter: (page) => !page.includes('/demo/') && !page.includes('/thanks/'),
    }),
  ],
  server: {
    host: true,
    port: 4321,
  },
});
