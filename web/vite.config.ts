import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// @shared はリポジトリルートの shared/ を指す（Mac/Win版と型を共有・コピーしない）。
// Vercel は git 全体をチェックアウトするため、Root Directory=web/ でもビルド時に ../shared は実在する。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '..', 'shared'),
    },
  },
});
