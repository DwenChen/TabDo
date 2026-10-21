import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  base: './',
  // 工具与宿主没有独立 package.json，必须隔离预构建缓存，避免并行开发服务器互相覆盖。
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-tools', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../../src/shared', import.meta.url))
    }
  },
  server: { host: '127.0.0.1', port: 15178, strictPort: true }
})
