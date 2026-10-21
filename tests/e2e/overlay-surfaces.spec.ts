import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type TestInfo
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(__dirname, '../..')
let app: ElectronApplication
let main: Page
let temporary: string
const logs: string[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-overlay-surfaces-'))
  const env = {
    ...process.env,
    TABDO_E2E: '1',
    TABDO_SOURCE_PREVIEW: '1',
    TABDO_PREVIEW_OPEN_SETTINGS: '1',
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
  main = await app.firstWindow()
  await expect(main.locator('.plugin-host')).toBeAttached()
  // 界面专项抑制无关桌面失焦，避免把工具会话隐藏销毁；不改真实用户配置。
  await app.evaluate(({ app }) => {
    const manager = process.mainModule!.require(
      app.getAppPath() + '/src/main/managers/windowManager.ts'
    ).default
    void manager.withBlurHideSuppressed(
      () => new Promise((resolve) => ((globalThis as any).__surfaceFocus = resolve))
    )
    process
      .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
      .default.dbPut('auto-detach-plugin', [])
  })
})

test.afterAll(async () => {
  if (!app) return
  const child = app.process()
  await app.evaluate(() => (globalThis as any).__surfaceFocus?.()).catch(() => {})
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
  if (child.exitCode === null) child.kill()
})

test.afterEach(async ({ browserName: _browserName }, info) => {
  await fs.writeFile(info.outputPath('application.log'), logs.join(''))
})

/**
 * 等待目标插件正文页面，不返回已退出的工具会话。
 * @param prefix 插件开发服务器或独立页面 URL 特征。
 * @returns 活跃页面的 Promise。
 */
async function findPage(prefix: string): Promise<Page> {
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((p) => !p.isClosed() && p.url().includes(prefix))
    )
    .toBe(true)
  return app
    .context()
    .pages()
    .find((p) => !p.isClosed() && p.url().includes(prefix))!
}

/**
 * 只停用待测页面的动画和光标闪烁，避免像素比较被瞬态状态干扰。
 * @param page 实际插件页面。
 * @param theme 明暗配色。
 * @param material Windows 窗口材质。
 * @returns 页面稳定后的 Promise。
 */
async function prepare(page: Page, theme: 'light' | 'dark', material = 'none'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.evaluate((material) => {
    document.documentElement.classList.add('os-windows')
    document.documentElement.setAttribute('data-material', material)
    if (!document.getElementById('surface-test-motion')) {
      const style = document.createElement('style')
      style.id = 'surface-test-motion'
      style.textContent =
        '* { animation: none !important; transition: none !important; caret-color: transparent !important; }'
      document.head.append(style)
    }
  }, material)
}

/**
 * 直接捕获插件 WebContents 当前可见区域，不与宿主窗口拼接。
 * @param page 实际插件或独立窗口页面。
 * @returns PNG 字节的 Promise。
 */
async function capture(page: Page): Promise<Buffer> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  const encoded = await app.evaluate(async ({ webContents }, url) => {
    const owner = webContents.getAllWebContents().find((item) => item.getURL() === url)!
    return (await owner.capturePage()).toPNG().toString('base64')
  }, page.url())
  return Buffer.from(encoded, 'base64')
}

/**
 * 在真实表面后切换两种底图，比较内部像素以检测底层内容是否透出。
 * @param page 页面。
 * @param selector 已显示且正文稳定的表面选择器。
 * @param name 本次证据名称。
 * @param info 测试产物上下文。
 * @param clippedContent 可选的独立滚动区；探针在其中尝试越界，验证页签与正文分区。
 * @returns 受底图影响的像素比例；不在这里断言，以便验证透明反例。
 */
async function probe(
  page: Page,
  selector: string,
  name: string,
  info: TestInfo,
  clippedContent?: string
): Promise<number> {
  await expect(page.locator(selector).first()).toBeVisible()
  // Vue 进入类会短暂改变位移；先等首帧提交及不透明状态再测几何。
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect
    .poll(() =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).opacity)
    )
    .toBe('1')
  const bounds = await page
    .locator(selector)
    .first()
    .evaluate((node, clippedContent) => {
      const surface = node as HTMLElement
      const rect = surface.getBoundingClientRect()
      const style = getComputedStyle(surface)
      const saved = { position: surface.style.position, zIndex: surface.style.zIndex }
      // 静态 flex 子项仅建立局部叠放顺序，不改变尺寸或背景。
      if (!clippedContent) {
        if (style.position === 'static') surface.style.position = 'relative'
        surface.style.zIndex = style.zIndex === 'auto' ? '1' : style.zIndex
      }
      const sentinel = document.createElement('div')
      sentinel.id = 'surface-test-backdrop'
      Object.assign(sentinel.style, {
        position: 'fixed',
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        zIndex: surface.style.zIndex,
        pointerEvents: 'none',
        background: '#ff00ff'
      })
      // tr 不能插入 div，否则表格匿名盒会改变列宽，导致探针测到旧位置。
      if (clippedContent) {
        const content = document.querySelector<HTMLElement>(clippedContent)!
        const clip = content.getBoundingClientRect()
        Object.assign(sentinel.style, {
          position: 'absolute',
          left: rect.left - clip.left + content.scrollLeft + 'px',
          top: rect.top - clip.top + content.scrollTop + 'px',
          zIndex: '100'
        })
        content.append(sentinel)
      } else if (surface.matches('th, td')) surface.closest('table')!.before(sentinel)
      else surface.before(sentinel)
      ;(window as any).__surfaceRestore = () => {
        sentinel.remove()
        Object.assign(surface.style, saved)
      }
      const inset = Math.min(8, Math.floor(Math.min(rect.width, rect.height) / 5))
      return {
        x: Math.max(0, rect.left + inset),
        y: Math.max(0, rect.top + inset),
        right: Math.min(innerWidth, rect.right - inset),
        bottom: Math.min(innerHeight, rect.bottom - inset),
        viewportWidth: innerWidth
      }
    }, clippedContent)
  try {
    const first = await capture(page)
    await page.evaluate(() => {
      document.getElementById('surface-test-backdrop')!.style.background = '#00ffff'
    })
    const second = await capture(page)
    const metadata = await sharp(first).metadata()
    const scale = metadata.width! / bounds.viewportWidth
    const region = {
      left: Math.ceil(bounds.x * scale),
      top: Math.ceil(bounds.y * scale),
      width: Math.floor((bounds.right - bounds.x) * scale),
      height: Math.floor((bounds.bottom - bounds.y) * scale)
    }
    expect(region.width).toBeGreaterThan(0)
    expect(region.height).toBeGreaterThan(0)
    const a = await sharp(first).extract(region).removeAlpha().raw().toBuffer()
    const b = await sharp(second).extract(region).removeAlpha().raw().toBuffer()
    let changed = 0
    for (let i = 0; i < a.length; i += 3) {
      if (
        Math.max(
          Math.abs(a[i] - b[i]),
          Math.abs(a[i + 1] - b[i + 1]),
          Math.abs(a[i + 2] - b[i + 2])
        ) > 2
      )
        changed++
    }
    const ratio = changed / (a.length / 3)
    await fs.writeFile(
      info.outputPath(name + '.json'),
      JSON.stringify({ selector, region, ratio }, null, 2)
    )
    return ratio
  } finally {
    await page.evaluate(() => (window as any).__surfaceRestore?.())
    await fs.writeFile(info.outputPath(name + '.png'), await capture(page))
  }
}

/**
 * 走实际宿主入口切换到工具子组件，再恢复可见性与正文焦点。
 * @param featureCode 工具功能码。
 * @param param 可选输入载荷。
 * @returns 新会话页面的 Promise。
 */
async function launchTools(featureCode: string, param?: any): Promise<Page> {
  const previous = new Set(app.context().pages())
  await main.evaluate(
    async ({ featureCode, param }) => {
      const plugin = (await window.tabdo.getAllPlugins()).find((p) => p.name === 'system')!
      await window.tabdo.launch({
        path: plugin.path,
        type: 'plugin',
        featureCode,
        name: featureCode,
        param
      })
    },
    { featureCode, param }
  )
  await app.evaluate(({ app }) => {
    const manager = process.mainModule!.require(
      app.getAppPath() + '/src/main/managers/windowManager.ts'
    ).default
    manager.getMainWindow().show()
    manager.getMainWindow().focus()
    process
      .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
      .default.focusPluginView()
  })
  // 旧会话可能仍在收束，必须等待本次新建的正文而非按相同 URL 复用旧 Page。
  let current: Page | undefined
  await expect
    .poll(() => {
      current = app
        .context()
        .pages()
        .find(
          (page) =>
            !previous.has(page) && !page.isClosed() && page.url().includes('127.0.0.1:15178')
        )
      return !!current
    })
    .toBe(true)
  return current!
}

test('快捷键分区与设置弹层在明暗主题和三种材质下避免文字叠透', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(180000)
  const settings = await findPage('127.0.0.1:15177')
  await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    for (const material of ['none', 'mica', 'acrylic']) {
      await prepare(settings, theme, material)
      await settings.getByText('快捷键', { exact: true }).click()
      await expect(settings.getByText('全屏时暂停快捷键', { exact: true })).toBeVisible()
      await settings.locator('.scrollable-content').evaluate((el) => {
        el.scrollTop = 120
      })
      await expect
        .poll(() => settings.locator('.scrollable-content').evaluate((el) => el.scrollTop))
        .toBe(120)
      const layout = await settings.evaluate(() => {
        const tabs = document.querySelector('.tabs-container')!,
          content = document.querySelector('.scrollable-content')!
        return {
          contains: content.contains(tabs),
          gap: content.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom
        }
      })
      expect(layout.contains).toBe(false)
      expect(Math.abs(layout.gap)).toBeLessThan(1)
      const label = `${theme}-${material}`
      expect(
        await probe(
          settings,
          '.tabs-container',
          label + '-separated-tabs',
          info,
          '.scrollable-content'
        )
      ).toBe(0)
      await settings.getByText('通用设置', { exact: true }).click()
      await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
      await settings.locator('.dropdown-trigger').first().click()
      await expect(settings.locator('.dropdown-menu').first()).toContainText('鼠标')
      if (theme === 'light' && material === 'none') {
        // 真正覆盖正文的菜单继续保留透明反例，验证像素探针有效。
        await settings
          .locator('.dropdown-menu')
          .first()
          .evaluate((el) => {
            el.style.background = 'transparent'
          })
        expect(
          await probe(settings, '.dropdown-menu', 'transparent-control', info)
        ).toBeGreaterThan(0.1)
        await settings
          .locator('.dropdown-menu')
          .first()
          .evaluate((el) => {
            el.style.removeProperty('background')
          })
      }
      expect(await probe(settings, '.dropdown-menu', label + '-dropdown', info)).toBe(0)
      await settings.locator('.dropdown-trigger').first().click()
      for (const type of ['info', 'success', 'warning', 'error']) {
        // 调用应用现有消息入口，使用当前应用中已挂载的真实 Toast。
        await settings.evaluate(async (type) => {
          const entry = '/src/components/common/Toast/Toast.ts'
          const { useToast } = await import(entry)
          useToast().show({ message: '覆盖层文字可读性验证', type, duration: 60000 })
        }, type)
        await expect(settings.locator('.toast-' + type)).toContainText('覆盖层文字可读性验证')
        expect(await probe(settings, '.toast-' + type, label + '-toast-' + type, info)).toBe(0)
      }
      await settings.evaluate(async () => {
        const entry = '/src/components/common/Toast/Toast.ts'
        const { useToast } = await import(entry)
        useToast().hide()
      })
    }
  }
})

/**
 * 验证整页或固定分区的留白保留材质透明通道，避免固定实色色带。
 * @param page 实际设置页。
 * @param selector 当前页面表面。
 * @param transparent 是否应透出原生材质。
 * @param name 证据名称。
 * @param info 测试产物上下文。
 * @returns 完成检查后的 Promise。
 */
async function checkMaterialGutter(
  page: Page,
  selector: string,
  transparent: boolean,
  name: string,
  info: TestInfo
): Promise<void> {
  const png = await capture(page)
  const bounds = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect()
      return {
        x: r.left + 3,
        y: r.top + 3,
        viewport: innerWidth,
        background: getComputedStyle(el).backgroundColor
      }
    })
  const metadata = await sharp(png).metadata(),
    scale = metadata.width! / bounds.viewport
  const rgba = await sharp(png)
    .ensureAlpha()
    .extract({
      left: Math.round(bounds.x * scale),
      top: Math.round(bounds.y * scale),
      width: 1,
      height: 1
    })
    .raw()
    .toBuffer()
  expect(rgba[3], name).toBe(transparent ? 0 : 255)
  await fs.writeFile(info.outputPath(name + '.png'), png)
  await fs.writeFile(
    info.outputPath(name + '.json'),
    JSON.stringify({ ...bounds, rgba: [...rgba] }, null, 2)
  )
}

test('聚焦与失焦时页签和整页详情保留材质，正文滚动不进入页签区域', async ({
  browserName: _browserName
}, info) => {
  test.skip(process.platform !== 'win32', '验证 Windows 原生材质与窗口焦点')
  test.setTimeout(120000)
  const settings = await findPage('127.0.0.1:15177')
  await settings.getByText('快捷键', { exact: true }).click()
  await expect(settings.getByText('全屏时暂停快捷键', { exact: true })).toBeVisible()
  const fixture = await app.evaluate(async ({ BrowserWindow, screen, nativeTheme }) => {
    const area = screen.getPrimaryDisplay().workArea
    const other = new BrowserWindow({
      x: area.x + area.width - 100,
      y: area.y + area.height - 80,
      width: 80,
      height: 60,
      frame: false,
      show: false
    })
    await other.loadURL('data:text/html,<body>Focus fixture</body>')
    return {
      id: other.id,
      theme: nativeTheme.themeSource,
      displays: screen
        .getAllDisplays()
        .map((d) => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor }))
    }
  })
  await fs.writeFile(
    info.outputPath('native-focus-environment.json'),
    JSON.stringify(fixture, null, 2)
  )
  try {
    for (const theme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, theme) => {
        nativeTheme.themeSource = theme
      }, theme)
      for (const material of ['none', 'mica', 'acrylic']) {
        await settings.evaluate(async (material) => {
          await window.tabdo.internal.setWindowMaterial(material)
        }, material)
        await prepare(settings, theme, material)
        for (const focused of [true, false]) {
          await app.evaluate(
            ({ app, BrowserWindow }, { focused, fixtureId }) => {
              const host = process
                .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
                .default.getMainWindow()
              if (focused) {
                host.show()
                host.focus()
              } else {
                const other = BrowserWindow.fromId(fixtureId)!
                other.show()
                other.focus()
              }
            },
            { focused, fixtureId: fixture.id }
          )
          await expect
            .poll(() =>
              app.evaluate(({ app }) =>
                process
                  .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
                  .default.getMainWindow()
                  .isFocused()
              )
            )
            .toBe(focused)
          const positions = []
          for (const scroll of [0, 120, 360]) {
            await settings.locator('.scrollable-content').evaluate((el, scroll) => {
              el.scrollTop = scroll
            }, scroll)
            const geometry = await settings.evaluate(() => {
              const tabs = document.querySelector('.tabs-container')!.getBoundingClientRect(),
                content = document.querySelector('.scrollable-content')!.getBoundingClientRect()
              return { top: tabs.top, bottom: tabs.bottom, contentTop: content.top }
            })
            expect(geometry.contentTop).toBeGreaterThanOrEqual(geometry.bottom)
            positions.push(geometry)
          }
          expect(
            positions.every((p) => p.top === positions[0].top && p.bottom === positions[0].bottom)
          ).toBe(true)
          await checkMaterialGutter(
            settings,
            '.tabs-container',
            material !== 'none',
            `${theme}-${material}-${focused ? 'focused' : 'blurred'}`,
            info
          )
        }
      }
    }
    // 相邻整页详情也不能用实色覆盖材质；背后的旧页面应退出可见树。
    await settings.evaluate(async () => {
      await window.tabdo.internal.setWindowMaterial('mica')
    })
    await prepare(settings, 'light', 'mica')
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
        .focus()
    )
    await settings.getByRole('button', { name: '全局快捷键', exact: true }).click()
    await settings.getByRole('button', { name: '添加快捷键', exact: true }).click()
    await expect(settings.locator('.detail-panel')).toBeVisible()
    await expect(settings.locator('.shortcuts-list-panel')).not.toBeVisible()
    await checkMaterialGutter(settings, '.detail-panel', true, 'shortcut-detail-material', info)
    await settings.getByRole('button', { name: '返回', exact: true }).click()
    await settings.getByText('已安装插件', { exact: true }).click()
    // 初始资料没有第三方插件，内置工具也不列入此页；用真实安装子页覆盖共享详情层。
    await settings.getByRole('button', { name: '更多', exact: true }).click()
    await settings.getByRole('button', { name: '从 npm 安装', exact: true }).click()
    await expect(settings.locator('.detail-panel')).toContainText('从 npm 安装插件')
    await expect(settings.locator('.scrollable-content')).not.toBeVisible()
    await checkMaterialGutter(settings, '.detail-panel', true, 'plugin-install-material', info)
    await settings.getByText('我的数据', { exact: true }).click()
    await settings.locator('.tabdo-card').click()
    await expect(settings.locator('.doc-card').first()).toBeVisible()
    await expect(settings.getByRole('tablist', { name: '我的数据' })).not.toBeVisible()
    await checkMaterialGutter(settings, '.detail-panel:visible', true, 'data-list-material', info)
    await settings.locator('.doc-card').first().click()
    await expect(settings.locator('.doc-detail-content')).toBeVisible()
    await checkMaterialGutter(settings, '.detail-panel:visible', true, 'data-detail-material', info)
    await fs.writeFile(
      info.outputPath('native-focus-environment.json'),
      JSON.stringify(fixture, null, 2)
    )
  } finally {
    await app.evaluate(({ BrowserWindow, nativeTheme }, fixture) => {
      BrowserWindow.fromId(fixture.id)?.destroy()
      nativeTheme.themeSource = fixture.theme
    }, fixture)
  }
})

test('剪贴板右键、收藏与清空确认在明暗主题下遮住列表', async ({
  browserName: _browserName
}, info) => {
  await app.evaluate(async ({ app }) => {
    const db = process.mainModule!.require(
      app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
    ).default
    await db.promises.put({
      _id: 'CLIPBOARD/opacity-fixture',
      type: 'text',
      timestamp: Date.now(),
      content: '底层长文字：不应穿过菜单或对话框。'.repeat(12),
      hash: 'opacity-fixture'
    })
  })
  const tools = await launchTools('clipboard')
  await expect(tools.locator('.content-text').first()).toContainText('底层长文字')
  for (const theme of ['light', 'dark'] as const) {
    await prepare(tools, theme, 'mica')
    await tools
      .locator('.clipboard-item')
      .first()
      .click({ button: 'right', position: { x: 100, y: 20 } })
    await expect(tools.locator('.context-menu')).toContainText('收藏')
    expect(await probe(tools, '.context-menu', theme + '-context', info)).toBe(0)
    await tools.locator('.context-menu').getByText('收藏', { exact: true }).click()
    await expect(tools.locator('.dialog-content')).toContainText('收藏')
    expect(await probe(tools, '.dialog-content', theme + '-favorite', info)).toBe(0)
    await tools.locator('.dialog-content').getByText('取消', { exact: true }).click()
    await tools.locator('.clear-btn').click()
    await expect(tools.locator('.dialog-content')).toContainText('清空剪贴板')
    expect(await probe(tools, '.dialog-content', theme + '-confirm', info)).toBe(0)
    await tools.locator('.dialog-content').getByText('取消', { exact: true }).click()
    await expect(tools.locator('.content-text').first()).toContainText('底层长文字')
  }
})

test('文件预览吸顶表头与固定确认条遮住下方内容且取消保留文件', async ({
  browserName: _browserName
}, info) => {
  const folder = path.join(temporary, '待确认文件夹')
  await fs.mkdir(folder)
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      fs.writeFile(path.join(folder, `文件-${i}.txt`), 'preserve')
    )
  )
  const tools = await launchTools('folder-break', {
    type: 'files',
    payload: [{ path: folder, name: '待确认文件夹', isDirectory: true }]
  })
  await expect(tools.getByRole('status')).toHaveText('已就绪，可执行解散')
  await expect(tools.getByLabel('解散预览')).toContainText('文件-0.txt')
  for (const theme of ['light', 'dark'] as const) {
    await prepare(tools, theme, 'acrylic')
    await tools.locator('.table-scroll').evaluate((el) => {
      el.scrollTop = 90
    })
    expect(await probe(tools, 'th', theme + '-table-header', info)).toBe(0)
    await tools.getByRole('button', { name: '执行解散', exact: true }).click()
    await expect(tools.getByRole('dialog')).toContainText('确认解散')
    expect(await probe(tools, '.confirmation', theme + '-confirmation', info)).toBe(0)
    await tools.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  }
  expect(await fs.readdir(folder)).toHaveLength(25)
})

test('独立便签选项遮住正文，关闭菜单后正文保留', async ({ browserName: _browserName }, info) => {
  await main.evaluate(async () => {
    const plugin = (await window.tabdo.getAllPlugins()).find((p) => p.name === 'system')!
    await window.tabdo.launch({
      path: plugin.path,
      type: 'plugin',
      featureCode: 'sticky-note',
      name: '便签'
    })
  })
  const note = await findPage('tools-floating.html')
  await expect(note.getByLabel('便签内容')).toBeVisible()
  await note.getByLabel('便签内容').fill('便签正文不应穿过选项菜单。'.repeat(80))
  for (const theme of ['light', 'dark'] as const) {
    await prepare(note, theme)
    await note.getByRole('button', { name: '便签选项', exact: true }).click()
    await expect(note.getByLabel('便签字号')).toBeVisible()
    await note.getByLabel('便签透明度').fill('35')
    await note.getByLabel('便签透明度').dispatchEvent('input')
    await expect(note.locator('.frame')).toHaveCSS('opacity', '0.35')
    expect(await probe(note, '.note-options', theme + '-note-options', info)).toBe(0)
    await note.getByRole('button', { name: '便签选项', exact: true }).click()
    await expect(note.getByLabel('便签内容')).toHaveValue('便签正文不应穿过选项菜单。'.repeat(80))
  }
  await note.getByRole('button', { name: '关闭', exact: true }).click()
  await expect.poll(() => note.isClosed()).toBe(true)
})
