// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // A <username>.github.io repository is served from the domain root, so no `base` is needed.
  site: 'https://cojobro.github.io',
  integrations: [sitemap()],
  vite: {
    build: {
      // three.js is one ~750 kB module. It is split into its own chunk and downloaded only when a
      // 3D scene nears the viewport (src/scenes/core/mount.ts), so its size is expected.
      chunkSizeWarningLimit: 800,
    },
  },
});
