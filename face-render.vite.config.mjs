import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The face renderer the server photographs to make Box-3 face packs (src/faceRender, faceDeviceService.js).
// Build: npx vite build --config face-render.vite.config.mjs
export default defineConfig({
  root: 'src/faceRender',
  base: './',
  plugins: [react()],
  build: { outDir: '../../pdf-knowledge-base/server/face_render', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
