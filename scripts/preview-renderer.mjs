import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [vue(), svgLoader()],
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('../src/renderer/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../src/shared', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] }
  }
})
