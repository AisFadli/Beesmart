/**
 * URL publik aplikasi. Nilainya disuntikkan Vite melalui `define` dari
 * environment variable VITE_APP_URL saat build (lihat vite.config.ts).
 *
 * Dipakai untuk canonical/OG (lewat index.html) dan tautan yang dibagikan
 * ke pengguna agar tidak menggantung pada domain tunnel.
 */

/** Kembalikan base URL aplikasi, dengan atau tanpa path tambahan. */
export function getAppUrl(path = ''): string {
  const base = typeof __APP_URL__ !== 'undefined'
    ? __APP_URL__
    : 'https://beesmart.id/app/';
  if (!path) return base;
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export default getAppUrl;
