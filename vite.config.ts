import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// COOP/COEP để trang được "cross-origin isolated" → SharedArrayBuffer → Stockfish đa luồng.
// Vercel dùng cùng header trong vercel.json.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
