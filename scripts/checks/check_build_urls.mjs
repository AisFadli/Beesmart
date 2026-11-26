/**
 * Pastikan URL publik di artefak build sesuai profile/target deploy.
 * Dipakai oleh `npm run verify` (production) dan `npm run verify:staging`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const profile = process.argv[2] === 'staging' ? 'staging' : 'production';
const dist = resolve(import.meta.dirname, '../..', 'dist');

const expected = profile === 'staging'
  ? 'https://beesmart.protechid.cloud/app/'
  : 'https://beesmart.id/app/';
const forbidden = profile === 'staging'
  ? 'https://beesmart.id/app/'
  : 'https://beesmart.protechid.cloud/app/';

const problems = [];
for (const name of ['index.html', 'sitemap.xml', 'robots.txt']) {
  const file = resolve(dist, name);
  if (!existsSync(file)) {
    problems.push(`${name}: tidak ada di dist/`);
    continue;
  }
  const content = readFileSync(file, 'utf8');
  if (content.includes(forbidden)) {
    problems.push(`${name}: masih mengandung URL profile lain (${forbidden})`);
  }
  if (name !== 'robots.txt' && !content.includes(expected)) {
    problems.push(`${name}: tidak mengandung ${expected}`);
  }
}

const indexHtml = existsSync(resolve(dist, 'index.html'))
  ? readFileSync(resolve(dist, 'index.html'), 'utf8')
  : '';
if (profile === 'staging' && !indexHtml.includes('noindex, nofollow')) {
  problems.push('index.html: staging belum memakai noindex, nofollow');
}
if (profile === 'production' && !indexHtml.includes('index, follow')) {
  problems.push('index.html: produksi belum memakai index, follow');
}

if (problems.length) {
  console.error(`Cek URL build (${profile}) GAGAL:`);
  problems.forEach(p => console.error(' - ' + p));
  process.exit(1);
}

console.log(`Cek URL build (${profile}) OK — ${expected}`);
