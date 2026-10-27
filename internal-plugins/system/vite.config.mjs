import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/postcss'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue(), react()],
  css: { postcss: { plugins: [tailwind()] } },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        tools: fileURLToPath(new URL('./index.html', import.meta.url)),
        presentation: fileURLToPath(new URL('./presentation.html', import.meta.url))
      }
    }
  },
  base: './',
  // 工具与宿主没有独立 package.json，必须隔离预构建缓存，避免并行开发服务器互相覆盖。
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-tools', import.meta.url)),
  resolve: {
    alias: {
      '@presentation': fileURLToPath(new URL('./presentation/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../../src/shared', import.meta.url))
    }
  },
  server: { host: '127.0.0.1', port: 15178, strictPort: true }
})
