import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { cssTools } from '../../dist/index.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    cssTools(),
  ],
})
