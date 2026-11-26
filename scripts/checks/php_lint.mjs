/**
 * Jalankan `php -l` untuk seluruh source PHP aplikasi dan script operasional.
 * Dipakai oleh `npm run verify`. Tidak memeriksa scripts/_incomplete/ karena
 * memang arsip script yang terpotong.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const targets = ['api', 'scripts/reports', 'scripts/operations', 'scripts/checks'];

function collectPhp(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectPhp(full));
    else if (entry.isFile() && entry.name.endsWith('.php')) out.push(full);
  }
  return out;
}

const files = targets.flatMap(t => collectPhp(join(root, t)));
if (files.length === 0) {
  console.error('Tidak ada file PHP yang ditemukan untuk dilint.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const result = spawnSync('php', ['-l', file], { encoding: 'utf8' });
  if (result.error) {
    failures.push(`${file}: ${result.error.message}`);
    continue;
  }
  const output = (result.stdout || '') + (result.stderr || '');
  if (result.status !== 0 || /Parse error|Errors parsing/i.test(output)) {
    failures.push(output.trim() || `${file}: php -l gagal (exit ${result.status})`);
  }
}

if (failures.length) {
  console.error(`PHP lint gagal untuk ${failures.length} file:\n`);
  failures.forEach(f => console.error(f));
  process.exit(1);
}

console.log(`PHP lint OK (${files.length} file).`);
