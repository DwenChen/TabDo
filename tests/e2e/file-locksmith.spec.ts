import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('文件占用从真实文件匹配列出锁进程并在二次确认后结束', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', '文件占用使用 Windows Restart Manager')
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-locksmith-'))
  const folder = path.join(temporary, 'locked-folder')
  const nested = path.join(folder, 'a', 'b')
  await fs.mkdir(nested, { recursive: true })
  const target = path.join(nested, 'locked-report.txt')
  await fs.writeFile(target, 'TabDo file locksmith integration test')
  await fs.writeFile(path.join(folder, 'plain-report.txt'), 'unlocked sibling')
  const escapedTarget = target.replaceAll("'", "''")
  let holder: ChildProcess | undefined
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
    holder = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$stream=[IO.File]::Open('${escapedTarget}','Open','ReadWrite','Read'); Start-Sleep 40; $stream.Dispose()`
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '0',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const app = application
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    // 外部桌面焦点变化不关闭测试窗口，显式关闭仍按正常生命周期执行。
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      void manager.withBlurHideSuppressed(
        () =>
          new Promise((resolve) => {
            ;(globalThis as any).__releaseLocksmithFocus = resolve
          })
      )
    })
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))

    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((plugin) => plugin.name === 'system')
        )
      )
      .toBe(true)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')
    )

    // 同时传入直接文件和包含该文件的多层文件夹，覆盖逐文件查询与递归批量查询。
    const param = {
      type: 'files',
      payload: [
        { path: target, name: path.basename(target), isDirectory: false },
        { path: folder, name: path.basename(folder), isDirectory: true }
      ]
    }
    await main.evaluate(
      async ({ plugin, param }) => {
        await window.tabdo.launch({
          path: plugin!.path,
          type: 'plugin',
          featureCode: 'file-locksmith',
          name: '文件占用',
          cmdType: 'files',
          param
        })
      },
      { plugin, param }
    )

    // 宿主会为工具创建新的 WebContentsView，等待其正文出现而非只看窗口标题。
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .some((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178')),
        { timeout: 30000 }
      )
      .toBe(true)
    const page: Page = app
      .context()
      .pages()
      .find((candidate) => !candidate.isClosed() && candidate.url().startsWith('http://127.0.0.1:15178'))!

    await expect(page.locator('.lock-page')).toBeAttached()
    await expect(page.locator('.lock-process').first()).toContainText('powershell', {
      timeout: 30000
    })
    await expect(page.locator('.file-chip')).toContainText(['locked-report.txt', 'locked-folder'])
    // 文件夹必须递归展开且不能出现 RmGetList 拒绝访问错误。
    await expect(page.locator('.lock-errors')).toHaveCount(0)
    // 等待宿主按正文收紧高度后再截图，避免把首帧大窗口当成最终布局。
    await page.waitForTimeout(500)
    await page.screenshot({ path: testInfo.outputPath('file-locksmith-result.png') })

    const killButton = page.locator('.kill-button').first()
    await killButton.click()
    await expect(killButton).toHaveText('确认结束')
    await killButton.click()

    await expect.poll(() => holder!.exitCode !== null, { timeout: 30000 }).toBe(true)
    await expect(page.locator('.lock-empty')).toContainText('没有进程占用', { timeout: 30000 })
    await page.screenshot({ path: testInfo.outputPath('file-locksmith-empty.png') })
  } finally {
    await fs.writeFile(testInfo.outputPath('file-locksmith.log'), logs.join(''))
    holder?.kill()
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
