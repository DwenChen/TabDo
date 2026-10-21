import { defineConfig } from '@playwright/test'

// 在 Electron 系 IDE 的终端里启动测试时，宿主会注入 ELECTRON_FORCE_IS_PACKAGED，
// 强制被测进程把源码预览当成打包应用（app.isPackaged 为真），从而按打包路径解析
// 内置插件与原生资源而全部失效；这里清掉这两个宿主残留变量，保证 E2E 与终端无关。
delete process.env.ELECTRON_FORCE_IS_PACKAGED
delete process.env.ELECTRON_RUN_AS_NODE

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'node scripts/preview-local.cjs --servers-only',
    url: 'http://127.0.0.1:15177',
    reuseExistingServer: true,
    timeout: 120_000
  },
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
})
