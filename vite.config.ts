import fs from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const PRODUCTION_URL = 'https://beesmart.id/app/';
const STAGING_URL = 'https://beesmart.protechid.cloud/app/';

function renderSitemap(appUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${appUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

function renderRobots(appUrl: string, isStaging: boolean): string {
  if (isStaging) {
    return `User-agent: *\nDisallow: /\n\n# Environment tester - jangan diindeks mesin pencari.\n`;
  }
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${appUrl}sitemap.xml\n`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isStaging = mode === 'staging';
  // Mode menentukan URL publik. VITE_APP_URL bisa meng-override bila perlu.
  // `npm run dev` memakai mode staging (tester online via tunnel);
  // `npm run build` memakai mode production (hosting beesmart.id).
  const appUrl = ((env.VITE_APP_URL || (isStaging ? STAGING_URL : PRODUCTION_URL)).replace(/\/+$/, '')) + '/';
  const robotsDirective = isStaging ? 'noindex, nofollow' : 'index, follow';

  return {
    base: '/app/',
    server: {
      port: 3006,
      host: '0.0.0.0',
      allowedHosts: ['beesmart.protechid.cloud', 'localhost', '127.0.0.1'],
      proxy: {
        '/app/api': {
          target: 'http://localhost:8088',
          rewrite: (path) => path.replace(/^\/app/, '')
        },
        // Upload dibuat oleh PHP server, bukan oleh Vite.
        '/app/uploads': {
          target: 'http://localhost:8088',
          rewrite: (path) => path.replace(/^\/app/, '')
        },
        '/api': 'http://localhost:8088'
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'app-environment-assets',
        // `order: 'pre'` penting: Vite mode dev menganggap placeholder pada
        // atribut href <link> sebagai URL relatif lalu menambah base /app/.
        // Dengan pre-hook, placeholder sudah jadi URL absolut sebelum rewrite itu.
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            return html
              .replace(/__APP_URL__/g, appUrl)
              .replace(/__APP_ROBOTS__/g, robotsDirective);
          },
        },
        configureServer(server) {
          // Sajikan sitemap/robots sesuai mode juga saat `npm run dev`.
          server.middlewares.use((req, res, next) => {
            const pathname = (req.url || '').split('?')[0];
            if (pathname === '/sitemap.xml' || pathname === '/app/sitemap.xml') {
              res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
              res.end(renderSitemap(appUrl));
              return;
            }
            if (pathname === '/robots.txt' || pathname === '/app/robots.txt') {
              res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
              res.end(renderRobots(appUrl, isStaging));
              return;
            }
            next();
          });
        },
        closeBundle() {
          const outDir = path.resolve(__dirname, 'dist');
          fs.writeFileSync(path.join(outDir, 'sitemap.xml'), renderSitemap(appUrl));
          fs.writeFileSync(path.join(outDir, 'robots.txt'), renderRobots(appUrl, isStaging));
        },
      },
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('html2canvas') || id.includes('jspdf')) return 'vendor-export';
            if (id.includes('qrcode') || id.includes('jsbarcode') || id.includes('html5-qrcode')) return 'vendor-scanner';
            if (id.includes('@google/genai')) return 'vendor-ai';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
            return 'vendor';
          },
        },
      },
    },
    define: {
      __APP_URL__: JSON.stringify(appUrl),
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
