import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * 读取隔离实例中真实的剪贴板历史前若干条。
 * @param app 当前 Electron 应用实例。
 * @param size 读取条数。
 * @returns 历史条目的类型与文本内容列表。
 */
async function readHistory(
  app: ElectronApplication,
  size = 5
): Promise<Array<{ type: string; content: string }>> {
  return app.evaluate(async ({ app }, limit) => {
    const manager = process.mainModule!.require(
      app.getAppPath() + '/src/main/managers/clipboardManager.ts'
    ).default
    const history = await manager.getHistory(1, limit)
    return history.items.map((item: any) => ({ type: item.type, content: item.content }))
  }, size)
}

test('复制路径与复制名称写入路径文本且不唤出宿主窗口', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-copy-commands-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
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
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((plugin) => plugin.name === 'system')
        )
      )
      .toBe(true)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((entry) => entry.name === 'system')
    )

    const sampleFile = path.join(temporary, '样本 文件.txt')
    const sampleFolder = path.join(temporary, '样本文件夹')
    await fs.writeFile(sampleFile, 'copy fixture')
    await fs.mkdir(sampleFolder, { recursive: true })
    const expectedName = '样本 文件.txt'
    const expectedFolderName = '样本文件夹'

    // 真实复制文件：让剪贴板与历史先停留在"文件条目"状态，复现用户报告的起点。
    await app.evaluate(({ app }, file) => {
      const addon = process.mainModule!.require(
        app.getAppPath() + '/resources/lib/win/tabdo_native.node'
      )
      addon.setClipboardFiles([file])
    }, sampleFile)
    await expect
      .poll(async () => (await readHistory(app!, 5))[0]?.type === 'file', { timeout: 15000 })
      .toBe(true)

    // 记录宿主窗口的显示次数，用于断言指令执行期间不会闪出窗口。
    await app.evaluate(({ app }) => {
      const windowManager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const win = windowManager.getMainWindow()
      win.hide()
      const originalShow = win.show.bind(win)
      ;(globalThis as any).__hostShowCalls = 0
      win.show = (...args: any[]) => {
        ;(globalThis as any).__hostShowCalls += 1
        return originalShow(...args)
      }
    })

    /**
     * 以超级面板来源启动内置工具指令并等待结果。
     * @param featureCode 指令标识。
     * @param payload 匹配载荷。
     * @returns 宿主返回的指令结果。
     */
    async function launchCommand(featureCode: string, payload: any[]): Promise<any> {
      return main.evaluate(
        async ({ pluginPath, code, files }) =>
          window.tabdo.launch({
            path: pluginPath,
            type: 'plugin',
            featureCode: code,
            name: code,
            cmdType: 'files',
            launchSource: 'super-panel',
            param: { type: 'files', payload: files }
          }),
        { pluginPath: plugin!.path, code: featureCode, files: payload }
      )
    }

    // 复制路径：剪贴板与历史都必须呈现路径文本，而不是残留的文件条目。
    const pathResult = await launchCommand('copy-path', [
      { path: sampleFile, name: expectedName, isDirectory: false }
    ])
    expect(pathResult).toMatchObject({ success: true, path: sampleFile })
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(sampleFile)
    await expect
      .poll(async () => (await readHistory(app!, 1))[0])
      .toEqual({
        type: 'text',
        content: sampleFile
      })

    // 复制名称：同样以文本登记，并且支持文件夹匹配。
    const nameResult = await launchCommand('copy-name', [
      { path: sampleFolder, name: expectedFolderName, isDirectory: true }
    ])
    expect(nameResult).toMatchObject({ success: true, path: expectedFolderName })
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(expectedFolderName)
    await expect
      .poll(async () => (await readHistory(app!, 1))[0])
      .toEqual({
        type: 'text',
        content: expectedFolderName
      })

    const history = await readHistory(app, 5)
    expect(history[0]).toEqual({ type: 'text', content: expectedFolderName })
    expect(history[1]).toEqual({ type: 'text', content: sampleFile })
    // 最初的文件复制条目仍在，但两条指令都没有产生新的文件条目或空文本条目。
    expect(history.slice(2).map((item) => item.type)).toEqual(['file'])

    const host = await app.evaluate(({ app }, pluginPath) => {
      const pluginManager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      return {
        showCalls: (globalThis as any).__hostShowCalls,
        visible: process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
          .default.getMainWindow()
          .isVisible(),
        copyPathHidden: pluginManager.shouldKeepMainWindowHidden(pluginPath, 'copy-path'),
        copyNameHidden: pluginManager.shouldKeepMainWindowHidden(pluginPath, 'copy-name')
      }
    }, plugin!.path)
    // 两条指令都不需要宿主界面：超级面板来源下保持窗口隐藏，也不得调用 show()。
    expect(host).toMatchObject({
      showCalls: 0,
      visible: false,
      copyPathHidden: true,
      copyNameHidden: true
    })

    const copyName = plugin!.features.find((entry) => entry.code === 'copy-name')
    expect(copyName?.explain).toBe('复制名称')
    expect(copyName?.cmds.some((cmd: any) => cmd.type === 'files')).toBe(true)
    expect(copyName?.cmds.some((cmd: any) => cmd.type === 'window')).toBe(true)
  } finally {
    await application?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
