import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('重命名独立标签、多行输入、紧凑控件与刷新滚动稳定', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-rename-'))
  let app: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const entries = await Promise.all(
      Array.from({ length: 80 }, async (_, index) => {
        const name = `Before${String(index + 1).padStart(2, '0')}.txt`
        const file = path.join(temporary, name)
        await fs.writeFile(file, `rename fixture ${index}`)
        return { path: file, name, isDirectory: false }
      })
    )
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '0',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const application = app
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    // 桌面焦点变化不应中断本次正文验证；显式关闭仍走真实会话退役。
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      void manager.withBlurHideSuppressed(
        () =>
          new Promise((resolve) => {
            ;(globalThis as any).__releaseRenameFocus = resolve
          })
      )
    })
    const plugin = await main.evaluate(
      async () => (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')!
    )
    await main.evaluate(
      async ({ plugin, entries }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'file-renamer',
          param: { type: 'files', payload: entries }
        }),
      { plugin, entries }
    )
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const tools = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    tools.on('pageerror', (error) => logs.push('PAGE ERROR: ' + error.message))
    await expect(tools.locator('.target-name').first()).toHaveText('001.txt')
    await expect(tools.getByLabel('启用自动编号')).toHaveCount(0)
    await tools.getByRole('button', { name: '增加开始序号', exact: true }).click()
    await expect(tools.getByLabel('开始序号', { exact: true })).toHaveValue('2')
    await expect(tools.locator('.target-name').first()).toHaveText('002.txt')
    await tools.getByLabel('编号前缀').fill('N_')

    /**
     * 保存稳定正文的原生WebContentsView可见区域，不拼接宿主画面。
     * @param name 截图文件名。
     * @returns {Promise<void>} 截图保存完成。
     */
    async function capture(name: string): Promise<void> {
      await expect(tools.locator('.updating')).toHaveCount(0)
      await expect(tools.locator('.preview-validation')).not.toContainText('正在校验')
      await tools.evaluate(() => {
        document.documentElement.setAttribute('data-material', 'none')
        document.body.style.background = matchMedia('(prefers-color-scheme: dark)').matches
          ? '#202020'
          : '#ffffff'
      })
      // 原生capturePage等待实际绘制，不能只凭DOM已经写入判断正文稳定。
      await tools.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      const encoded = await application.evaluate(
        async ({ webContents }, url) =>
          (
            await webContents
              .getAllWebContents()
              .find((entry) => entry.getURL() === url)!
              .capturePage()
          )
            .toPNG()
            .toString('base64'),
        tools.url()
      )
      await fs.writeFile(info.outputPath(name), Buffer.from(encoded, 'base64'))
    }
    await expect(tools.locator('.target-name').first()).toHaveText('N_002.txt')
    await capture('rename-numbering.png')
    await tools.getByLabel('序号类型', { exact: true }).selectOption('chinese-upper')
    await expect(tools.locator('.target-name').first()).toHaveText('N_贰.txt')
    const sequenceAlignment = await tools
      .locator('.number-panel .sequence-fields')
      .evaluate((element) => {
        const input = element.querySelector('input')!
        const select = element.querySelector('select')!
        const stepper = element.querySelector('.number-stepper')!.getBoundingClientRect()
        const arrow = element.querySelector('.sequence-select svg')!.getBoundingClientRect()
        return {
          difference: Math.abs(stepper.x + stepper.width / 2 - arrow.x - arrow.width / 2),
          inputFont: [
            getComputedStyle(input).fontFamily,
            getComputedStyle(input).fontSize,
            getComputedStyle(input).fontWeight
          ],
          selectFont: [
            getComputedStyle(select).fontFamily,
            getComputedStyle(select).fontSize,
            getComputedStyle(select).fontWeight
          ]
        }
      })
    expect(sequenceAlignment.difference).toBeLessThan(1)
    expect(sequenceAlignment.inputFont).toEqual(sequenceAlignment.selectFont)
    await capture('rename-numbering-chinese.png')
    await tools.getByLabel('序号类型', { exact: true }).selectOption('arabic')
    await tools.getByRole('button', { name: '查找替换', exact: true }).click()
    await tools.getByPlaceholder('输入要查找的字符...').fill('Before')
    await tools.getByPlaceholder('输入替换目标内容...').fill('After')
    await expect(tools.locator('.target-name').first()).toHaveText('After01.txt')
    const mode = tools.getByLabel('规则 1 的查找方式')
    await mode.selectOption('after-n')
    expect(await mode.evaluate((element) => element.clientWidth)).toBeGreaterThan(135)
    await capture('rename-replace.png')
    const iconAlignment = await tools
      .locator('.file-row')
      .first()
      .evaluate((row) => {
        return ['.status-icon', '.remove-row'].map((selector) => {
          const container = row.querySelector(selector)!
          const icon = container.querySelector('svg')!
          const outer = container.getBoundingClientRect()
          const inner = icon.getBoundingClientRect()
          return Math.hypot(
            outer.x + outer.width / 2 - inner.x - inner.width / 2,
            outer.y + outer.height / 2 - inner.y - inner.height / 2
          )
        })
      })
    expect(iconAlignment.every((offset) => offset < 0.5)).toBe(true)
    await mode.selectOption('text')

    await tools.getByRole('button', { name: '规则清理', exact: true }).click()
    await expect(tools.locator('.clean-tabs button')).toHaveText([
      '大小写转换',
      '文件名清洗',
      '扩展名处理'
    ])
    await tools.getByLabel('启用大小写转换').check()
    await tools.getByLabel('大小写模式').selectOption('upper')
    await expect(tools.locator('.target-name').first()).toHaveText('BEFORE01.txt')
    await tools.getByRole('button', { name: '扩展名处理', exact: true }).click()
    await tools.getByLabel('启用扩展名处理').check()
    await tools.getByLabel('新扩展名').fill('md')
    await expect(tools.locator('.target-name').first()).toHaveText('BEFORE01.md')
    await capture('rename-clean.png')
    await tools.getByRole('button', { name: '文件名清洗', exact: true }).click()
    await tools.getByLabel('启用文件名清洗').check()
    await capture('rename-sanitize.png')

    await tools.getByRole('button', { name: '插入内容', exact: true }).click()
    await tools.getByLabel('插入文本').fill('I_')
    await expect(tools.locator('.target-name').first()).toHaveText('I_Before01.txt')
    await tools.getByRole('button', { name: '指定位置', exact: true }).click()
    await tools.getByRole('button', { name: '序号', exact: true }).click()
    await expect(tools.getByLabel('插入固定位数', { exact: true })).toBeVisible()
    expect(
      await tools
        .locator('.rule-panel')
        .evaluate((element) => element.scrollHeight - element.clientHeight)
    ).toBeLessThanOrEqual(1)
    await capture('rename-insert-number.png')
    // 实际缩窄宿主后复查插入序号区域，不用CSS缩放模拟窗口布局。
    const originalSize = await app.evaluate(({ app }) => {
      const window = process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
      const size = window.getContentSize()
      window.setContentSize(640, size[1])
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
        .default.updatePluginViewBounds(640, size[1])
      return size
    })
    await expect.poll(() => tools.evaluate(() => innerWidth)).toBeLessThanOrEqual(640)
    const compactLayout = await tools.locator('.insert-panel').evaluate((element) => {
      const fields = [...element.querySelectorAll('.sequence-field')]
      return {
        overflow: element.scrollWidth - element.clientWidth,
        gaps: fields
          .slice(1)
          .map(
            (field, index) =>
              field.getBoundingClientRect().top - fields[index].getBoundingClientRect().bottom
          ),
        panelScroll: element.parentElement!.scrollHeight - element.parentElement!.clientHeight
      }
    })
    expect(compactLayout.overflow).toBeLessThanOrEqual(1)
    expect(compactLayout.panelScroll).toBeLessThanOrEqual(1)
    expect(compactLayout.gaps.every((gap) => gap >= 9)).toBe(true)
    await capture('rename-insert-compact.png')
    await app.evaluate(({ app }, size) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
        .setContentSize(...size)
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
        .default.updatePluginViewBounds(size[0], size[1])
    }, originalSize)
    await tools.getByRole('button', { name: '文件信息', exact: true }).click()
    await tools.getByLabel('文件信息类型').selectOption('dimensions')
    await expect(tools.locator('.error-tag').first()).toBeVisible()
    await capture('rename-insert-info.png')

    await tools.getByRole('button', { name: '手动编辑', exact: true }).click()
    const editor = tools.getByLabel('批量编辑文件名')
    await editor.fill('typed-one.txt')
    await editor.press('End')
    await editor.press('Enter')
    await editor.pressSequentially('typed-two.txt')
    await expect(editor).toHaveValue('typed-one.txt\ntyped-two.txt')
    await tools.getByRole('button', { name: '应用到预览', exact: true }).click()
    await expect(tools.locator('.rename-message')).toContainText('条数不匹配')
    await expect(tools.locator('.rename-name-input').first()).toHaveValue('Before01.txt')
    const names = entries.map((_, index) => `Manual${String(index + 1).padStart(2, '0')}.txt`)
    // 真实系统剪贴板粘贴Excel风格CRLF和末尾换行，验证原生粘贴与行数处理。
    await app.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      names.join('\r\n') + '\r\n'
    )
    await editor.fill('')
    await editor.press('Control+v')
    await expect.poll(() => editor.inputValue()).toContain('Manual02.txt')
    await tools.getByRole('button', { name: '应用到预览', exact: true }).click()
    await expect(tools.locator('.rename-name-input').first()).toHaveValue('Manual01.txt')
    await expect(tools.getByRole('button', { name: '执行重命名', exact: true })).toBeEnabled()
    await capture('rename-manual.png')
    await tools.getByRole('button', { name: '查找替换', exact: true }).click()
    await expect(tools.locator('.target-name').first()).toHaveText('After01.txt')
    await tools.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(tools.locator('.rename-name-input').first()).toHaveValue('Manual01.txt')
    await tools.getByRole('button', { name: '智能重命名', exact: true }).click()
    await expect(tools.locator('.target-name').first()).toHaveText('Before01.txt')

    await tools.getByRole('button', { name: '自动编号', exact: true }).click()
    await expect(tools.locator('.target-name').first()).toHaveText('N_002.txt')
    // 外部目标冲突必须阻止执行，解除后一次点击完成事务并可完整撤销。
    const occupied = path.join(temporary, 'N_002.txt')
    await fs.writeFile(occupied, 'existing target')
    await tools.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(tools.locator('.error-tag').first()).toHaveText('目标已存在')
    await expect(tools.getByRole('button', { name: '执行重命名', exact: true })).toBeDisabled()
    expect(await fs.readFile(occupied, 'utf8')).toBe('existing target')
    await fs.unlink(occupied)
    await tools.getByRole('button', { name: '刷新预览', exact: true }).click()
    await tools.getByRole('button', { name: '执行重命名', exact: true }).click()
    await expect(tools.locator('.rename-message')).toContainText('已重命名 80 项')
    expect(await fs.readFile(occupied, 'utf8')).toBe('rename fixture 0')
    await tools.getByRole('button', { name: '撤销重命名', exact: true }).click()
    await expect(tools.locator('.rename-message')).toContainText('已撤销上次改名')
    await expect(tools.getByRole('button', { name: '执行重命名', exact: true })).toBeEnabled()
    await tools.locator('.file-rows').evaluate((element) => {
      element.scrollTop = 1100
      ;(window as any).__renameScrollBaseline = element.scrollTop
      ;(window as any).__renameScrollElement = element
      ;(window as any).__renameRefreshSamples = []
      ;(window as any).__renameObserver = new MutationObserver(() => {
        const current = document.querySelector('.file-rows')
        ;(window as any).__renameRefreshSamples.push({
          same: current === element,
          scroll: current?.scrollTop
        })
      })
      ;(window as any).__renameObserver.observe(document.querySelector('.rename-preview')!, {
        childList: true,
        subtree: true
      })
    })
    await tools.getByLabel('编号前缀').fill('Stable_')
    await expect(tools.locator('.target-name').first()).toContainText('Stable_')
    await tools.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(tools.getByRole('button', { name: '执行重命名', exact: true })).toBeEnabled()
    const stable = await tools.evaluate(() => {
      ;(window as any).__renameObserver.disconnect()
      return {
        samples: (window as any).__renameRefreshSamples as { same: boolean; scroll: number }[],
        baseline: (window as any).__renameScrollBaseline as number,
        scroll: document.querySelector('.file-rows')!.scrollTop
      }
    })
    expect(stable.samples.length).toBeGreaterThan(0)
    expect(stable.baseline).toBeGreaterThan(1000)
    expect(stable.samples).toEqual(
      stable.samples.map(() => ({ same: true, scroll: stable.baseline }))
    )
    expect(stable.scroll).toBe(stable.baseline)
    await tools.emulateMedia({ colorScheme: 'dark' })
    await capture('rename-dark.png')
    await tools.getByRole('button', { name: '清空列表', exact: true }).click()
    await expect(tools.locator('.file-row')).toHaveCount(0)
    expect(await fs.readFile(entries[0].path, 'utf8')).toBe('rename fixture 0')
  } finally {
    await fs.writeFile(info.outputPath('electron.log'), logs.join(''))
    await app?.evaluate(() => (globalThis as any).__releaseRenameFocus?.()).catch(() => {})
    await app?.close().catch(() => {})
    // 隔离夹具只在Electron退出后清理，范围由mkdtemp固定且不触碰用户目录。
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
