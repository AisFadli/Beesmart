/// <reference types="vite/client" />
declare module '@tailwindcss/vite';

/** Disuntikkan Vite dari env VITE_APP_URL (default: domain produksi). */
declare const __APP_URL__: string;
