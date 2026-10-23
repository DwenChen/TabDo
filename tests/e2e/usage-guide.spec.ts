import {
  test,
  expect,
  _electron as electron,
  chromium,
  type Browser,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * 为测试中第二个源码实例选择空闲回环端口。
 * @returns 已释放的端口号。
 */
async function availablePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

test('全屏引导检测真实设置和桌面操作后自动推进，关于入口重进并清理所属文件', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(360000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-walkthrough-'))
  const data = path.join(temporary, 'data'),
    desktop = path.join(temporary, 'Desktop'),
    runs = path.join(data, 'usage-guide/runs')
  await fs.mkdir(desktop)
  await fs.writeFile(path.join(desktop, '真实桌面哨兵.txt'), 'keep')
  let app: ElectronApplication | undefined, guideBrowser: Browser | undefined
  let originalPointer: { x: number; y: number } | undefined
  const logs: string[] = [],
    port = await availablePort()
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_E2E_GUIDE_FIRST_RUN: '1',
      TABDO_E2E_GUIDE_DEBUG_PORT: String(port),
      TABDO_E2E_GUIDE_DESKTOP: desktop,
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '0',
      TABDO_DATA_ROOT: data,
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
    const application = app
    originalPointer = await app.evaluate(({ screen }) => screen.getCursorScreenPoint())
    app.process().stdout?.on('data', (value) => logs.push(String(value)))
    app.process().stderr?.on('data', (value) => logs.push(String(value)))
    // 父实例在启动体验前使用隔离桌面，测试不能向用户真实桌面写入样例。
    await app.evaluate(({ app, clipboard }, desktop) => {
      app.setPath('desktop', desktop)
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      db.dbPut('guide-formal-sentinel', { preserve: true })
      clipboard.writeText('TabDo 引导测试准备：等待手动复制练习正文')
    }, desktop)
    let settings: Page

    /**
     * 在体验退出后接回重新创建的正式关于页面。
     * @returns 正文已就绪的当前设置页。
     */
    async function parentSettings(): Promise<Page> {
      await expect
        .poll(() =>
          application
            .context()
            .pages()
            .some((page) => page.url().includes('15177'))
        )
        .toBe(true)
      const current = application
        .context()
        .pages()
        .find((page) => page.url().includes('15177'))!
      await expect(current.locator('.about-panel .usage-guide')).toBeVisible()
      return current
    }

    /**
     * 接入首次自动启动或从关于真实入口重开的全屏覆盖窗口。
     * @param fromAbout 是否点击关于页中的重进入口。
     * @returns 覆盖页和本次桌面目录。
     */
    async function start(
      fromAbout = true
    ): Promise<{ overlay: Page; workspace: string; directory: string }> {
      if (fromAbout) {
        settings = await parentSettings()
        await settings.getByRole('button', { name: '开始全屏引导', exact: true }).click()
      }
      await expect
        .poll(
          async () => {
            try {
              await fetch(`http://127.0.0.1:${port}/json/version`)
              return true
            } catch {
              return false
            }
          },
          { timeout: 30000 }
        )
        .toBe(true)
      guideBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
      await expect
        .poll(() =>
          guideBrowser!
            .contexts()
            .flatMap((context) => context.pages())
            .some((page) => page.url().endsWith('usage-guide.html'))
        )
        .toBe(true)
      const overlay = guideBrowser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().endsWith('usage-guide.html'))!
      await expect(overlay.getByRole('heading', { name: '在桌面上，亲手试一遍' })).toBeVisible()
      const entries = await fs.readdir(runs)
      expect(entries).toHaveLength(1)
      const directory = path.join(runs, entries[0]),
        owner = JSON.parse(await fs.readFile(path.join(directory, 'owner.json'), 'utf8'))
      expect(path.dirname(owner.workspace)).toBe(desktop)
      const display = await application.evaluate(
        ({ screen }) => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds
      )
      // DOM 可见早于原生 mounted 回执；等待窗口显示后的 setBounds 真正覆盖任务栏。
      await expect
        .poll(async () => {
          const current = await overlay.evaluate(() =>
            JSON.parse(document.body.dataset.windowBounds!)
          )
          return Math.abs(current.height - display.height)
        })
        .toBeLessThanOrEqual(2)
      const size = await overlay.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const actual = await overlay.evaluate(() => JSON.parse(document.body.dataset.windowBounds!))
      expect(Math.abs(actual.x - display.x)).toBeLessThanOrEqual(2)
      expect(Math.abs(actual.y - display.y)).toBeLessThanOrEqual(2)
      expect(Math.abs(actual.width - display.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(actual.height - display.height)).toBeLessThanOrEqual(2)
      // Windows 分数缩放时 Chromium 客户区与 screen.bounds 可有 1–2 DIP 舍入差。
      expect(Math.abs(size.width - display.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(size.height - display.height)).toBeLessThanOrEqual(2)
      await overlay.screenshot({ path: testInfo.outputPath('fullscreen-welcome.png') })
      await expect
        .poll(() =>
          application
            .context()
            .pages()
            .some((page) => page.url().includes('15177'))
        )
        .toBe(false)
      return { overlay, workspace: owner.workspace, directory }
    }

    /**
     * 等待某个真实工具正文被宿主装配。
     * @param selector 正文稳定特征。
     * @param latest 是否优先查找最新创建的独立窗口。
     * @returns 当前工具页。
     */
    async function tool(selector: string, latest = false): Promise<Page> {
      let result: Page | undefined
      await expect
        .poll(
          async () => {
            const pages = guideBrowser!.contexts().flatMap((context) => context.pages())
            for (const page of latest ? pages.reverse() : pages) {
              if (
                await page
                  .locator(selector)
                  .count()
                  .catch(() => 0)
              ) {
                if (
                  await page
                    .evaluate(() => (window as any).toolsLifecycle?.signal?.aborted === true)
                    .catch(() => true)
                )
                  continue
                result = page
                return true
              }
            }
            return false
          },
          { timeout: 20000 }
        )
        .toBe(true)
      return result!
    }

    /**
     * 明确跳过未在本测试操作的步骤，不能把跳过伪称为完成。
     * @param overlay 全屏引导页。
     * @param id 目标步骤标识。
     * @returns 目标步骤出现后的 Promise。
     */
    async function skipTo(overlay: Page, id: string): Promise<void> {
      for (let index = 0; index < 60; index++) {
        if ((await overlay.locator('body').getAttribute('data-step')) === id) {
          await step(id)
          return
        }
        const previous = await overlay.locator('body').getAttribute('data-step')
        await expect(overlay.locator('body')).toHaveAttribute('data-opening', 'false')
        if (previous) await nativeVisible(previous)
        await clickCoach(overlay.locator('#skip'))
        await expect(overlay.locator('body')).not.toHaveAttribute('data-step', previous || '')
      }
      throw new Error('未找到课程：' + id)
    }

    /**
     * 等待稳定的步骤身份，避免把相邻课程或成功动画误认为操作已完成。
     * @param id 课程定义中的步骤标识。
     * @returns 该步骤准备完毕后的 Promise。
     */
    async function step(id: string): Promise<void> {
      await expect(overlay.locator('body')).toHaveAttribute('data-step', id, { timeout: 20000 })
      await expect(overlay.locator('body')).toHaveAttribute('data-phase', 'active')
      await expect(overlay.locator('body')).toHaveAttribute('data-opening', 'false')
      await nativeVisible(id)
    }

    /**
     * 以真实原生窗口堆叠核对正文和当前选项可见，CDP 中存在的隐藏工具不能冒充前台。
     * @param id 当前课程标识，用于保存原生窗口与整屏证据。
     * @returns 两个目标点均由所属工具窗口承载后的 Promise。
     * @throws 窗口被设置页或其他窗口遮挡时保存诊断并抛出断言错误。
     */
    async function nativeVisible(id: string): Promise<void> {
      if (process.platform !== 'win32') return
      const geometry = await overlay.evaluate(() => ({
        content: JSON.parse(document.body.dataset.targetContentBounds || 'null'),
        spotlight: document.querySelector('#spotlight')?.getBoundingClientRect().toJSON(),
        display: JSON.parse(document.body.dataset.displayBounds!),
        target: document.body.dataset.targetWindowHandle,
        overlay: document.body.dataset.overlayWindowHandle,
        processId: document.body.dataset.targetProcessId,
        title: document.body.dataset.targetWindowTitle
      }))
      if (!geometry.content || !geometry.target) return
      const points = await application.evaluate(({ screen }, geometry) => {
        const content = geometry.content
        const points = [{ x: content.x + content.width / 2, y: content.y + content.height / 2 }]
        if (geometry.spotlight?.width && geometry.spotlight?.height)
          points.push({
            x: geometry.display.x + geometry.spotlight.x + geometry.spotlight.width / 2,
            y: geometry.display.y + geometry.spotlight.y + geometry.spotlight.height / 2
          })
        return points.map((point) => screen.dipToScreenPoint(point))
      }, geometry)
      let probes: any[] = []
      try {
        await expect
          .poll(
            async () => {
              const result = await execFileAsync(
                'powershell.exe',
                [
                  '-NoProfile',
                  '-NonInteractive',
                  '-ExecutionPolicy',
                  'Bypass',
                  '-File',
                  path.join(root, 'tests/fixtures/native-window-visibility.ps1'),
                  '-PointsJson',
                  JSON.stringify(points),
                  '-ExpectedHandle',
                  geometry.target!,
                  '-OverlayHandle',
                  geometry.overlay || '0'
                ],
                { windowsHide: true }
              )
              probes = JSON.parse(result.stdout)
              return probes.every(
                (probe) =>
                  probe.Expected.Visible &&
                  probe.Effective?.Handle === geometry.target &&
                  String(probe.Expected.ProcessId) === geometry.processId
              )
            },
            { timeout: 10000, intervals: [300, 700] }
          )
          .toBe(true)
      } catch (error) {
        await saveNativeScreen(id)
        throw error
      } finally {
        await fs.writeFile(
          testInfo.outputPath(`native-visible-${id}.json`),
          JSON.stringify({ geometry, points, probes }, null, 2)
        )
      }
      if (['annotate-config', 'resize-config', 'crop-config'].some((name) => id.endsWith(name)))
        await saveNativeScreen(id)
    }

    /**
     * 保存整块真实显示器的独立证据，用于排查原生遮挡；不拼接插件或宿主截图。
     * @param id 当前课程标识。
     * @returns 当前显示器 PNG 保存后的 Promise。
     */
    async function saveNativeScreen(id: string): Promise<void> {
      const png = await application.evaluate(async ({ desktopCapturer, screen }) => {
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.round(display.size.width * display.scaleFactor),
            height: Math.round(display.size.height * display.scaleFactor)
          }
        })
        const source = sources.find((item) => item.display_id === String(display.id)) || sources[0]
        return source.thumbnail.toPNG().toString('base64')
      })
      await fs.writeFile(testInfo.outputPath(`native-screen-${id}.png`), Buffer.from(png, 'base64'))
    }

    /**
     * 点击真实文件入口，验证 Windows 模态框期间覆盖层隐藏，并用真实按键完成或取消。
     * @param trigger 实际打开或保存控件。
     * @param id 诊断名称。
     * @param key 发给所属 Windows 对话框的取消或确认按键。
     * @param filePath 可选的真实素材路径，通过文件名输入框粘贴选择。
     * @returns 对话框关闭且覆盖层原生可见性恢复后的 Promise。
     */
    async function nativeDialog(
      trigger: Locator,
      id: string,
      key: '{ESC}' | '{ENTER}',
      filePath?: string
    ): Promise<void> {
      const owner = await overlay.evaluate(() => ({
        handle: document.body.dataset.overlayWindowHandle!,
        processId: Number(document.body.dataset.targetProcessId)
      }))
      const point = await application.evaluate(({ screen }) =>
        screen.dipToScreenPoint({ x: 100, y: 100 })
      )
      /**
       * 从 Windows 读取覆盖层 HWND 的真实可见性，不能用 DOM 的显示状态替代。
       * @returns 覆盖层与前台窗口的原生快照。
       */
      async function overlayState(): Promise<any[]> {
        const result = await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            path.join(root, 'tests/fixtures/native-window-visibility.ps1'),
            '-PointsJson',
            JSON.stringify([point]),
            '-ExpectedHandle',
            owner.handle,
            '-OverlayHandle',
            owner.handle
          ],
          { windowsHide: true }
        )
        return JSON.parse(result.stdout)
      }
      // 真实指针先离开提示卡并核对透传，避免 CDP 事件绕过用户实际能否点击的边界。
      let clickError: Error | undefined
      const clicked = clickThroughHighlight(trigger, id).catch((error: Error) => {
        clickError = error
        return error
      })
      let completed = false
      try {
        await expect
          .poll(() => {
            if (clickError) throw clickError
            return application.evaluate(({ app }) => {
              const active = process
                .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
                .WindowManager.getActiveWindow()
              return active?.className === '#32770' ? Number(active.pid ?? active.processId) : 0
            })
          })
          .toBe(owner.processId)
        let previousControls = ''
        await expect
          .poll(
            async () => {
              const state = (await overlayState())[0]
              const controls = state.ForegroundControls || []
              const ready =
                controls.some((control: any) => control.ClassName === 'Edit') &&
                controls.some((control: any) => control.ClassName === 'ComboBox') &&
                controls.some(
                  (control: any) =>
                    control.ClassName === 'Button' && /取消|Cancel/.test(control.Title)
                ) &&
                controls.some(
                  (control: any) =>
                    control.ClassName === 'Button' && /打开|保存|Open|Save/.test(control.Title)
                )
              const signature = controls
                .filter((control: any) => /^(Edit|ComboBox|Button)$/.test(control.ClassName))
                .map((control: any) => control.ClassName + control.Title + control.Bounds.join(','))
                .join('|')
              const stable = ready && signature === previousControls
              previousControls = signature
              return stable
            },
            { timeout: 15000, intervals: [200, 300] }
          )
          .toBe(true)
        const opened = await overlayState()
        expect(opened[0].Expected.Visible).toBe(false)
        await fs.writeFile(
          testInfo.outputPath(`native-dialog-${id}-open.json`),
          JSON.stringify(opened, null, 2)
        )
        await saveNativeScreen(`${id}-native-dialog`)
        // 前台所属关系确认后才发送真实按键；不会向其他应用的窗口发送取消或确认。
        if (filePath)
          await application.evaluate(
            ({ clipboard }, filePath) => clipboard.writeText(filePath),
            filePath
          )
        const keyboard = filePath
          ? "$guideDialogKeys=New-Object -ComObject WScript.Shell; $guideDialogKeys.SendKeys('%n'); Start-Sleep -Milliseconds 100; $guideDialogKeys.SendKeys('^a'); $guideDialogKeys.SendKeys('^v'); Start-Sleep -Milliseconds 100; $guideDialogKeys.SendKeys('{ENTER}')"
          : `(New-Object -ComObject WScript.Shell).SendKeys('${key}')`
        await execFileAsync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', keyboard],
          { windowsHide: true }
        )
        await expect.poll(async () => (await overlayState())[0].Expected.Visible).toBe(true)
        const clickResult = await clicked
        if (clickResult instanceof Error) throw clickResult
        await fs.writeFile(
          testInfo.outputPath(`native-dialog-${id}-restored.json`),
          JSON.stringify(await overlayState(), null, 2)
        )
        completed = true
      } catch (error) {
        await fs.writeFile(
          testInfo.outputPath(`native-dialog-${id}-failed.json`),
          JSON.stringify(await overlayState(), null, 2)
        )
        await saveNativeScreen(`${id}-native-dialog-failed`)
        throw error
      } finally {
        if (!completed) {
          // 断言失败时只取消已核验仍属本次实例的模态框，避免同步点击把测试清理阻塞。
          const ownModal = await application
            .evaluate(({ app }, processId) => {
              const active = process
                .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
                .WindowManager.getActiveWindow()
              return (
                active?.className === '#32770' &&
                Number(active.pid ?? active.processId) === processId
              )
            }, owner.processId)
            .catch(() => false)
          if (ownModal)
            await execFileAsync(
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                "(New-Object -ComObject WScript.Shell).SendKeys('{ESC}')"
              ],
              { windowsHide: true }
            ).catch(() => {})
        }
      }
    }

    /**
     * 核对聚焦框跟随具体控件的尺寸，而非始终镂空整个工具窗口。
     * @param target 实际课程控件。
     * @returns 控件被准确聚焦后的 Promise。
     * @throws 几何不匹配时保存真实子窗口证据并抛出断言错误。
     */
    async function preciseHighlight(target: Locator): Promise<void> {
      let lastGeometry: unknown = await overlay
        .locator('body')
        .evaluate((body) => ({ ...body.dataset }))
      try {
        await expect(target).toBeVisible()
        await expect(overlay.locator('body')).toHaveAttribute('data-anchor-found', 'true')
        await expect
          .poll(async () => {
            const actual = await overlay.locator('#spotlight').boundingBox()
            const box = await target.boundingBox()
            const geometry = await overlay.evaluate(() => ({
              content: JSON.parse(
                document.body.dataset.spotlightContentBounds ||
                  document.body.dataset.targetContentBounds ||
                  'null'
              ),
              display: JSON.parse(document.body.dataset.displayBounds!)
            }))
            if (!actual || !box || !geometry.content) return false
            const zoom = geometry.content.width / (await target.page().evaluate(() => innerWidth))
            const expected = {
              x: geometry.content.x - geometry.display.x + box.x * zoom,
              y: geometry.content.y - geometry.display.y + box.y * zoom,
              width: box.width * zoom,
              height: box.height * zoom
            }
            lastGeometry = { actual, expected, box, geometry, zoom }
            return (
              actual.x <= expected.x + 2 &&
              expected.x - actual.x <= 14 &&
              actual.y <= expected.y + 2 &&
              expected.y - actual.y <= 14 &&
              Math.abs(actual.width - expected.width) <= 24 &&
              Math.abs(actual.height - expected.height) <= 24
            )
          })
          .toBe(true)
        await nativeVisible('control-' + (await overlay.locator('body').getAttribute('data-step')))
      } catch (error) {
        const id = await overlay.locator('body').getAttribute('data-step')
        await fs.writeFile(
          testInfo.outputPath(`highlight-${id}.json`),
          JSON.stringify(lastGeometry, null, 2)
        )
        await overlay.screenshot({ path: testInfo.outputPath(`highlight-${id}-overlay.png`) })
        await target.page().screenshot({ path: testInfo.outputPath(`highlight-${id}-target.png`) })
        throw error
      }
    }

    /**
     * 从覆盖层的控件镂空坐标发出真实 Windows 左键，验证下层窗口可接收输入。
     * @param target 实际需要点击的子控件。
     * @param nativeProbeId 可选原生输入验收名称，点击前核对 WindowFromPoint 命中实际工具。
     * @returns 原生点击完成后的 Promise。
     */
    async function clickThroughHighlight(target: Locator, nativeProbeId?: string): Promise<void> {
      if (process.platform !== 'win32') return target.click()
      const box = (await target.boundingBox())!
      const content = await overlay.evaluate(() =>
        JSON.parse(
          document.body.dataset.spotlightContentBounds || document.body.dataset.targetContentBounds!
        )
      )
      const zoom = content.width / (await target.page().evaluate(() => innerWidth))
      const point = {
        x: content.x + (box.x + box.width / 2) * zoom,
        y: content.y + (box.y + box.height / 2) * zoom
      }
      await application.evaluate(({ app, screen }, point) => {
        const native = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/native/index.ts'
        ).WindowManager
        const physical = screen.dipToScreenPoint(point)
        native.simulateMouseMove(physical.x, physical.y)
      }, point)
      // 鼠标透传状态由原生指针更新；等待一次轮询后再点击目标。
      await overlay.waitForTimeout(180)
      if (nativeProbeId) {
        const geometry = await overlay.evaluate(() => ({
          target:
            document.body.dataset.spotlightWindowHandle ||
            document.body.dataset.targetWindowHandle!,
          overlay: document.body.dataset.overlayWindowHandle!
        }))
        const physical = await application.evaluate(
          ({ screen }, point) => screen.dipToScreenPoint(point),
          point
        )
        let probes: any[] = []
        try {
          await expect
            .poll(async () => {
              const result = await execFileAsync(
                'powershell.exe',
                [
                  '-NoProfile',
                  '-NonInteractive',
                  '-ExecutionPolicy',
                  'Bypass',
                  '-File',
                  path.join(root, 'tests/fixtures/native-window-visibility.ps1'),
                  '-PointsJson',
                  JSON.stringify([physical]),
                  '-ExpectedHandle',
                  geometry.target,
                  '-OverlayHandle',
                  geometry.overlay
                ],
                { windowsHide: true }
              )
              probes = JSON.parse(result.stdout)
              return probes[0]?.Hit?.Handle
            })
            .toBe(geometry.target)
        } finally {
          await fs.writeFile(
            testInfo.outputPath(`native-input-${nativeProbeId}.json`),
            JSON.stringify({ geometry, point, physical, probes }, null, 2)
          )
        }
      }
      await application.evaluate(({ app, screen }, point) => {
        const physical = screen.dipToScreenPoint(point)
        return process
          .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
          .WindowManager.simulateMouseClick(physical.x, physical.y)
      }, point)
    }

    /**
     * 通过真实系统指针点击提示卡，覆盖焦点切到引导层后工具不能被宿主 blur 隐藏的边界。
     * @param target 提示卡中的实际按钮。
     * @returns 原生点击发送完成后的 Promise。
     */
    async function clickCoach(target: Locator): Promise<void> {
      if (process.platform !== 'win32') return target.click()
      const box = (await target.boundingBox())!
      const bounds = await overlay.evaluate(() => JSON.parse(document.body.dataset.windowBounds!))
      const point = await application.evaluate(
        ({ screen }, { box, bounds }) =>
          screen.dipToScreenPoint({
            x: bounds.x + box.x + box.width / 2,
            y: bounds.y + box.y + box.height / 2
          }),
        { box, bounds }
      )
      await application.evaluate(
        ({ app }, point) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
            .WindowManager.simulateMouseMove(point.x, point.y),
        point
      )
      // 透传轮询先确认指针已进入卡片，再让本次点击真正激活覆盖窗口。
      await overlay.waitForTimeout(100)
      await application.evaluate(
        ({ app }, point) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
            .WindowManager.simulateMouseClick(point.x, point.y),
        point
      )
    }

    /**
     * 使用系统中键进入真正的全局输入链，不直接调用超级面板或工具启动 API。
     * @returns 中键释放且子实例面板出现后的 Promise。
     */
    async function openPanelWithMouse(): Promise<void> {
      if (process.platform === 'win32') {
        const bounds = await overlay.evaluate(() =>
          JSON.parse(document.body.dataset.displayBounds!)
        )
        const point = await application.evaluate(
          ({ screen }, bounds) =>
            screen.dipToScreenPoint({ x: bounds.x + 80, y: bounds.y + bounds.height / 2 }),
          bounds
        )
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class GuideMouse { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra); }\'; ' +
            `[GuideMouse]::SetCursorPos(${point.x}, ${point.y}) | Out-Null; ` +
            '[GuideMouse]::mouse_event(0x0020, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 450; [GuideMouse]::mouse_event(0x0040, 0, 0, 0, [UIntPtr]::Zero)'
        ])
      } else {
        await overlay.mouse.click(80, 300, { button: 'middle', delay: 450 })
      }
      await step('panel-pinned')
    }

    /**
     * 将第一张便签通过真实标题栏拖到屏幕边缘，并移开指针触发折叠。
     * @param note 当前教学便签页。
     * @returns 便签实际折成色签后的 Promise。
     */
    async function dockNote(note: Page): Promise<void> {
      await note.bringToFront()
      await note.evaluate(() => {
        ;(window as any).__guidePointerEvents = []
        for (const type of ['pointerdown', 'pointermove', 'pointerup'])
          document.addEventListener(type, (event) => {
            const pointer = event as PointerEvent
            ;(window as any).__guidePointerEvents.push({
              type,
              target: (event.target as HTMLElement)?.id,
              x: pointer.clientX,
              y: pointer.clientY,
              screenX: pointer.screenX,
              screenY: pointer.screenY,
              buttons: pointer.buttons
            })
          })
      })
      const header = (await note.locator('#note-header').boundingBox())!
      const origin = await note.evaluate(() => ({ x: screenX, y: screenY }))
      const display = await overlay.evaluate(() => JSON.parse(document.body.dataset.displayBounds!))
      const content = await overlay.evaluate(() =>
        JSON.parse(document.body.dataset.targetContentBounds!)
      )
      const zoom = content.width / (await note.evaluate(() => innerWidth))
      await fs.writeFile(
        testInfo.outputPath('dock-native-before.json'),
        JSON.stringify({ header, origin, content, zoom, display }, null, 2)
      )
      if (process.platform === 'win32') {
        const points = await application.evaluate(
          ({ screen }, { content, zoom, header, display }) => ({
            from: screen.dipToScreenPoint({
              x: content.x + (header.x + 35) * zoom,
              y: content.y + (header.y + header.height / 2) * zoom
            }),
            to: screen.dipToScreenPoint({
              x: display.x + 2,
              y: content.y + (header.y + header.height / 2) * zoom
            }),
            away: screen.dipToScreenPoint({
              x: display.x + display.width / 2,
              y: display.y + display.height - 80
            })
          }),
          { content, zoom, header, display }
        )
        // 复用已验证的 DPI-aware 原生拖动驱动，确保物理坐标不被 PowerShell 虚拟化。
        await execFileAsync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            path.join(root, 'tests/fixtures/native-window-drag.ps1'),
            '-StartX',
            String(points.from.x),
            '-StartY',
            String(points.from.y),
            '-EndX',
            String(points.to.x),
            '-EndY',
            String(points.to.y)
          ],
          { windowsHide: true }
        )
        await application.evaluate(({ app }, point) => {
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
            .WindowManager.simulateMouseMove(point.x, point.y)
        }, points.away)
      } else {
        await note.mouse.move(header.x + 35, header.y + header.height / 2)
        await note.mouse.down()
        await note.mouse.move(display.x - origin.x + 2, header.y + header.height / 2, { steps: 12 })
        await note.mouse.up()
        await overlay.mouse.move(display.width / 2, display.height - 80)
      }
      await fs.writeFile(
        testInfo.outputPath('dock-native-after.json'),
        JSON.stringify(
          await note.evaluate(() => ({
            x: screenX,
            y: screenY,
            dataset: { ...document.body.dataset },
            events: (window as any).__guidePointerEvents
          })),
          null,
          2
        )
      )
      await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed', {
        timeout: 15000
      })
    }

    let { overlay, workspace, directory } = await start(false)
    await overlay.getByRole('button', { name: '开始逐步体验 →' }).click()
    await step('panel')
    let page = await tool('[data-guide="panel-trigger"]')
    await expect(page.locator('[data-usage-guide-highlight]')).toBeVisible()
    await preciseHighlight(page.locator('[data-guide="panel-trigger"] .dropdown-trigger'))
    await clickThroughHighlight(page.locator('[data-guide="panel-trigger"] .dropdown-trigger'))
    const middleOption = page.locator('.dropdown-item').filter({ hasText: '长按鼠标中键' })
    await preciseHighlight(middleOption)
    await middleOption.click()
    await step('match')
    page = await tool('#clipboard-quick-match')
    await preciseHighlight(page.locator('#clipboard-quick-match'))
    await page.locator('#clipboard-quick-match').fill('10')
    await page.locator('#clipboard-quick-match').press('Tab')
    await step('copy')
    // 教学只提供可选择的正文；测试用标准复制按键走系统剪贴板和采集链。
    await expect(overlay.getByRole('button', { name: '复制练习文字', exact: true })).toHaveCount(0)
    const practice = overlay.locator('#practice-text')
    await expect(practice).toHaveValue('TabDo 练习：先复制，再找到我。')
    await practice.click()
    await practice.press('ControlOrMeta+A')
    await practice.press('ControlOrMeta+C')
    await expect
      .poll(() => application.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('TabDo 练习：先复制，再找到我。')
    await step('panel-open')
    await openPanelWithMouse()
    const panel = await tool('.super-panel .search-header')
    await preciseHighlight(panel.locator('[title="返回固定列表"]'))
    await panel.locator('[title="返回固定列表"]').click()
    await step('clipboard-open')
    await preciseHighlight(panel.locator('[data-guide-command="clipboard"]'))
    // 正式实例暂停鼠标入口，真实中键只能唤起练习实例的面板。
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some(
          (window) => window.webContents.getURL().includes('super-panel.html') && window.isVisible()
        )
      )
    ).toBe(false)
    await panel.locator('[data-guide-command="clipboard"]').click()
    await step('selection')
    page = await tool('.clipboard-list')
    const clipboardPage = page
    const clipboardUrl = page.url()
    const clipboardTarget = await overlay.locator('body').getAttribute('data-target-id')
    const record = page
      .locator('.clipboard-item')
      .filter({ hasText: 'TabDo 练习：先复制，再找到我。' })
    await expect(record).toHaveCount(1)
    // 连续重试恢复当前前台，不销毁已就绪的工具，也不把未操作的子步骤算作完成。
    for (let index = 0; index < 3; index++) {
      await clickCoach(overlay.locator('#retry'))
      await step('selection')
      expect(page.isClosed()).toBe(false)
      expect(page.url()).toBe(clipboardUrl)
      await expect(overlay.locator('body')).toHaveAttribute('data-target-id', clipboardTarget!)
      await expect(record).toBeVisible()
    }
    await record.click()
    await step('clipboard-search')
    const clipboardHost = await tool('.titlebar .search-input, .plugin-header input')
    const clipboardSearch = clipboardHost.locator('.titlebar .search-input, .plugin-header input')
    await preciseHighlight(clipboardSearch)
    await clipboardSearch.fill('先复制')
    await step('clipboard-menu')
    await expect(record).toBeVisible()
    await record.click({ button: 'right' })
    await step('clipboard-favorite')
    const favoriteAction = page.locator('[data-guide="clipboard-favorite-action"]')
    await preciseHighlight(favoriteAction)
    await overlay.screenshot({ path: testInfo.outputPath('clipboard-menu-option-spotlight.png') })
    await favoriteAction.click()
    // 打开收藏对话框只是准备动作，必须确认保存才可以进入下一课。
    await expect(page.locator('[data-guide="clipboard-favorite-dialog"]')).toBeVisible()
    await overlay.waitForTimeout(1000)
    await expect(overlay.locator('body')).toHaveAttribute('data-step', 'clipboard-favorite')
    await page.getByPlaceholder('请输入备注(可选)').fill('入门练习')
    await page.locator('[data-guide="clipboard-favorite-confirm"]').click()
    await step('clipboard-favorites')
    await page.locator('[data-guide="clipboard-tab-favorite"]').click()
    await step('clipboard-floating')
    await page.screenshot({ path: testInfo.outputPath('clipboard-favorite-result.png') })
    await record.getByRole('button', { name: /悬浮/ }).click()
    await step('note')
    page = await tool('#note')
    expect(clipboardPage.isClosed()).toBe(false)
    await expect(page.locator('#note')).toHaveValue('TabDo 练习：先复制，再找到我。')
    await page.locator('#note').fill('你好 TabDo')
    await step('note-options')
    await page.locator('#note-more').click()
    await step('note-color')
    await preciseHighlight(page.locator('[data-note-color="#bdd7f3"]'))
    await page.locator('[data-note-color="#bdd7f3"]').click()
    await step('note-opacity')
    await preciseHighlight(page.locator('#note-opacity'))
    await page.locator('#note-opacity').focus()
    await page.locator('#note-opacity').press('Home')
    await page.locator('#note-opacity').press('ArrowRight')
    await step('note-create')
    const editedNote = page
    await page.locator('#new-note').click()
    await step('note-collapse')
    // 新建便签不覆盖第一张的正文；聚焦与后续贴边操作跟随最新独立窗口。
    await expect(editedNote.locator('#note')).toHaveValue('你好 TabDo')
    page = await tool('#note', true)
    await page.locator('#note').fill('第二张练习便签')
    const extraNoteText = await page.locator('#note').inputValue()
    await preciseHighlight(page.locator('#note-header'))
    await dockNote(page)
    await step('note-expand')
    await page.screenshot({ path: testInfo.outputPath('note-collapsed-tab.png') })
    await preciseHighlight(page.locator('#note-dock-tab'))
    await clickThroughHighlight(page.locator('#note-dock-tab'))
    await expect(page.locator('#note')).toHaveValue(extraNoteText)
    await expect(editedNote.locator('#note')).toHaveValue('你好 TabDo')
    await editedNote.screenshot({ path: testInfo.outputPath('note-retained-appearance.png') })
    await step('screenshot')
    await skipTo(overlay, 'rename-config')
    page = await tool('.rename-preview')
    await expect(page.locator('.file-row')).toHaveCount(2)
    await page.getByLabel('编号前缀').fill('入门_')
    await step('rename')
    await expect(page.getByRole('button', { name: '执行重命名', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '执行重命名', exact: true }).click()
    await step('folder')
    expect(
      (await fs.readdir(workspace)).filter(
        (name) => name === '练习文件甲.txt' || name === '练习文件乙.txt'
      )
    ).toHaveLength(0)
    await skipTo(overlay, 'qr-result')
    page = await tool('.qr-page')
    if (process.platform === 'win32') {
      await nativeDialog(page.locator('.qr-pick'), 'qr-open', '{ESC}')
      await step('qr-result')
      await expect(
        overlay.getByRole('heading', { name: '选择图片并读取二维码', exact: true })
      ).toBeVisible()
      const sample = path.join(workspace, '图片/练习图片.png')
      // 扫码组件读取后会立即清空 input；在真实 change 捕获阶段记录传入的文件与路径。
      await page.evaluate(() => {
        document.querySelector('input[type=file]')!.addEventListener(
          'change',
          (event) => {
            const file = (event.target as HTMLInputElement).files?.[0]
            ;(window as any).__guideSelectedFile = file
            ;(window as any).__guideSelectedPath = file
              ? (window as any).toolsProvider.filePath(file)
              : ''
          },
          { capture: true, once: true }
        )
      })
      await nativeDialog(page.locator('.qr-pick'), 'qr-open-success', '{ENTER}', sample)
      await expect
        .poll(() => page.evaluate(() => (window as any).__guideSelectedPath || ''))
        .toBe(sample)
      await fs.writeFile(
        testInfo.outputPath('native-selected-file-path.json'),
        JSON.stringify(
          await page.evaluate(() => ({
            name: (window as any).__guideSelectedFile?.name,
            size: (window as any).__guideSelectedFile?.size,
            path: (window as any).__guideSelectedPath
          })),
          null,
          2
        )
      )
    } else {
      await page
        .locator('input[type=file]')
        .setInputFiles(path.join(workspace, '图片/练习图片.png'))
    }
    await expect(page.getByLabel('二维码内容')).toHaveValue('https://example.com/tabdo-qr-test')
    await step('qr')
    await page.getByRole('button', { name: '复制内容', exact: true }).click()
    await step('annotate-config')
    page = await tool('#image-tools:not([hidden])')
    await page.getByRole('button', { name: '箭头', exact: true }).click()
    const canvas = (await page.locator('#canvas').boundingBox())!
    await page.mouse.move(canvas.x + canvas.width / 4, canvas.y + canvas.height / 3)
    await page.mouse.down()
    await page.mouse.move(canvas.x + (canvas.width * 3) / 4, canvas.y + (canvas.height * 2) / 3, {
      steps: 10
    })
    await page.mouse.up()
    await step('annotate')
    await nativeDialog(page.locator('#save-image'), 'annotation-save', '{ENTER}')
    await expect
      .poll(
        async () =>
          (await fs.stat(path.join(workspace, '练习输出/标记图片.png')).catch(() => null))?.size ||
          0
      )
      .toBeGreaterThan(0)
    await step('resize-config')
    page = await tool('.media-row')
    await page.getByRole('button', { name: '修改尺寸', exact: true }).click()
    await page.getByLabel('宽度', { exact: true }).fill('66%')
    const mediaTarget = await overlay.locator('body').getAttribute('data-target-id')
    await clickCoach(overlay.locator('#retry'))
    await step('resize-config')
    await expect(overlay.locator('body')).toHaveAttribute('data-target-id', mediaTarget!)
    await expect(page.getByLabel('宽度', { exact: true })).toHaveValue('66%')
    await page.getByLabel('宽度', { exact: true }).fill('50%')
    await step('resize')
    await page.getByRole('button', { name: /^开始处理/ }).click()
    await step('crop-config')
    page = await tool('.media-row')
    const squareRatio = page
      .getByLabel('裁剪比例', { exact: true })
      .getByRole('button', { name: '1:1', exact: true })
    await preciseHighlight(squareRatio)
    await overlay.screenshot({ path: testInfo.outputPath('fullscreen-tools-spotlight.png') })
    if (process.env.TABDO_E2E_GUIDE_VISIBILITY_ONLY === '1') {
      // 可见性专项在三个图片工具取得原生证据后结束，不冒充整套课程验收。
      await overlay.getByRole('button', { name: '退出引导并清理', exact: true }).click()
      await expect.poll(async () => fs.readdir(runs)).toEqual([])
      return
    }
    await squareRatio.click()
    await step('crop')
    await skipTo(overlay, 'merge-config')
    page = await tool('.media-row')
    await page.getByLabel('合并方向', { exact: true }).selectOption('horizontal')
    await step('merge')
    await skipTo(overlay, 'video-config')
    page = await tool('.media-batch[data-media="video"]')
    await page.locator('[data-media-action="cut"]').click()
    await page.getByLabel('开始位置（秒）', { exact: true }).fill('0')
    await page.getByLabel('片段时长（秒）', { exact: true }).fill('1')
    await step('video')
    await skipTo(overlay, 'recorder-config')
    page = await tool('.recorder-page')
    await page
      .getByLabel('录屏倒计时', { exact: true })
      .getByRole('button', { name: '5 秒', exact: true })
      .click()
    await step('recorder')
    await skipTo(overlay, 'provider')
    page = await tool('.providers-tabs')
    await page.getByRole('button', { name: 'OCR', exact: true }).click()
    await step('provider-enable')
    page = await tool('[data-provider="builtin-wechat-ocr"]')
    await expect(page.locator('.demo-notice')).toContainText('教学演示')
    await page.locator('[data-provider="builtin-wechat-ocr"] label.toggle').click()
    await step('provider-formula')
    await page.locator('[data-provider="builtin-latex"] label.toggle').click()
    await step('ocr-result')
    page = await tool('.provider-tools')
    await expect(page.locator('.demo-notice')).toContainText('未进行真实识别')
    await page.locator('#recognition-file').setInputFiles(path.join(workspace, '图片/练习图片.png'))
    await expect(page.getByLabel('处理结果', { exact: true })).toHaveValue(/教学演示/)
    await step('ocr')
    await page.getByRole('button', { name: '复制结果', exact: true }).click()
    await step('formula-result')
    page = await tool('#recognition-file', true)
    await page.locator('#recognition-file').setInputFiles(path.join(workspace, '图片/练习图片.png'))
    await expect(page.locator('.formula-preview')).toBeVisible()
    await expect(page.getByLabel('处理结果', { exact: true })).toHaveValue(/\\frac/)
    await step('formula')
    await page.getByRole('button', { name: '复制结果', exact: true }).click()
    await step('translation')
    page = await tool('#builtin-google-to')
    await expect(page.locator('.providers-tabs .tab-btn.active')).toHaveText('翻译')
    await page.locator('#builtin-google-to').selectOption('en')
    await page
      .locator('.configuration')
      .filter({ has: page.locator('#builtin-google-to') })
      .getByRole('button', { name: '保存配置', exact: true })
      .click()
    await step('web')
    await skipTo(overlay, 'finder')
    page = await tool('.finder-sidebar')
    await expect(page.locator('.demo-notice')).toContainText('Everything 接口模拟')
    await page.getByRole('button', { name: '图片', exact: true }).click()
    await expect(page.locator('.search-result').first()).toBeVisible()
    const found = await page.locator('.search-result .file-path').allTextContents()
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((file) => file.startsWith(workspace))).toBe(true)
    await step('finder-preview')
    await page.getByLabel('文件预览开关').check()
    await page.locator('.search-result').first().click()
    await expect(page.locator('.finder-preview-zoom .preview-content img')).toBeVisible()
    await step('shortcut')
    page = await tool('[data-guide="shortcut-esc"]')
    await page.locator('[data-guide="shortcut-esc"] label').click()
    await expect(overlay.getByRole('heading', { name: '已经亲手走过这些步骤' })).toBeVisible({
      timeout: 15000
    })
    await overlay.getByRole('button', { name: '结束体验并清理' }).click()
    await expect
      .poll(
        async () => {
          try {
            await fs.access(directory)
            return false
          } catch {
            return true
          }
        },
        { timeout: 30000 }
      )
      .toBe(true)
    await expect
      .poll(async () => {
        try {
          await fs.access(workspace)
          return false
        } catch {
          return true
        }
      })
      .toBe(true)
    expect(await fs.readFile(path.join(desktop, '真实桌面哨兵.txt'), 'utf8')).toBe('keep')
    settings = await parentSettings()
    await settings.screenshot({ path: testInfo.outputPath('about-guide-entry.png') })
    await expect(
      settings.locator('.settings-sidebar').getByRole('button', { name: '使用引导', exact: true })
    ).toHaveCount(0)
    await expect(
      settings.getByText('本次体验已退出，过程文件已清理', { exact: true })
    ).toBeVisible()
    const state = await settings.evaluate(() => window.tabdo.internal.usageGuide('status'))
    await fs.writeFile(
      testInfo.outputPath('usage-guide-report.json'),
      JSON.stringify(state.report, null, 2)
    )
    expect(
      await application.evaluate(
        ({ app }) =>
          process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
            .default.guideInputSuspended
      )
    ).toBe(false)
    expect(state.report!.completed).toEqual(
      expect.arrayContaining([
        'panel',
        'match',
        'copy',
        'panel-open',
        'panel-pinned',
        'clipboard-open',
        'selection',
        'clipboard-search',
        'clipboard-menu',
        'clipboard-favorite',
        'clipboard-favorites',
        'clipboard-floating',
        'note',
        'note-options',
        'note-color',
        'note-opacity',
        'note-create',
        'note-collapse',
        'note-expand',
        'rename-config',
        'rename',
        'qr-result',
        'qr',
        'annotate-config',
        'annotate',
        'resize-config',
        'resize',
        'crop-config',
        'merge-config',
        'video-config',
        'recorder-config',
        'provider',
        'provider-enable',
        'provider-formula',
        'ocr-result',
        'ocr',
        'formula-result',
        'formula',
        'translation',
        'finder',
        'finder-preview',
        'shortcut'
      ])
    )
    expect(state.report!.skipped).toContain('screenshot')
    expect(
      await application.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
          .default.dbGet('guide-formal-sentinel')
      )
    ).toEqual({ preserve: true })
    await guideBrowser?.close().catch(() => {})
    guideBrowser = undefined
    await settings.getByRole('button', { name: '保留引导环境', exact: true }).click()
    ;({ overlay, workspace, directory } = await start())
    await overlay.getByRole('button', { name: '暂不学习，退出引导' }).click()
    await expect
      .poll(async () => {
        try {
          await fs.access(workspace)
          return false
        } catch {
          return true
        }
      })
      .toBe(true)
    // 设置页退出前台后可以按会话生命周期重建，重进完成时接回新的真实页面。
    await expect
      .poll(() =>
        application
          .context()
          .pages()
          .some((page) => page.url().includes('15177'))
      )
      .toBe(true)
    settings = application
      .context()
      .pages()
      .find((page) => page.url().includes('15177'))!
    await expect(settings.getByRole('button', { name: '删除引导环境', exact: true })).toBeVisible()
    await settings.getByRole('button', { name: '删除引导环境', exact: true }).click()
    await expect
      .poll(async () => {
        try {
          await fs.access(path.join(data, 'usage-guide/environment'))
          return false
        } catch {
          return true
        }
      })
      .toBe(true)
  } catch (error) {
    // CDP 子实例不属于 Playwright 父实例自动截图范围，失败时单独保存真实正文与覆盖层。
    const pages = guideBrowser?.contexts().flatMap((context) => context.pages()) || []
    for (let index = 0; index < pages.length; index++) {
      const child = pages[index]
      if (
        !child.isClosed() &&
        (await child
          .locator('.clipboard-app, .provider-tools, .media-batch, .rename-page, #note, #welcome')
          .count()
          .catch(() => 0))
      )
        await child
          .screenshot({
            path: testInfo.outputPath(`guide-failed-child-${index}.png`),
            timeout: 3000
          })
          .catch(() => {})
    }
    throw error
  } finally {
    for (const entry of await fs.readdir(runs).catch(() => []))
      await fs
        .copyFile(
          path.join(runs, entry, 'data/logs/main.log'),
          testInfo.outputPath(`guide-child-${entry}.log`)
        )
        .catch(() => {})
    if (app && originalPointer)
      await app
        .evaluate(({ app, screen }, pointer) => {
          const point = screen.dipToScreenPoint(pointer)
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
            .WindowManager.simulateMouseMove(point.x, point.y)
        }, originalPointer)
        .catch(() => {})
    await guideBrowser?.close().catch(() => {})
    await app?.close().catch(() => {})
    await fs.writeFile(testInfo.outputPath('usage-guide.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
