import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('native dragging docks notes and OS pointer entry exposes a clickable image close button', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Physical native drag fixture uses Windows SendInput')
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-floating-pointer-'))
  if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep))
    throw new Error('Unexpected isolated test data path')
  let application: ElectronApplication | undefined
  let originalPointer: { x: number; y: number } | undefined
  const logs: string[] = []
  try {
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
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    const app = application
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    originalPointer = await app.evaluate(({ screen }) => screen.getCursorScreenPoint())

    /**
     * 移动真实系统鼠标到目标窗口内外，覆盖 Chromium 原生拖动区而不伪造 DOM 悬停。
     * @param id 独立窗口标识。
     * @param inside 是否移动到窗口内部。
     * @returns 系统输入操作完成后的 Promise。
     */
    async function movePointer(id: number, inside: boolean): Promise<void> {
      expect(
        await app.evaluate(
          ({ app, BrowserWindow, screen }, { id, inside }) => {
            const win = BrowserWindow.fromId(id)!
            const b = win.getBounds(),
              area = screen.getDisplayMatching(b).workArea
            const point = screen.dipToScreenPoint(
              inside
                ? { x: b.x + b.width / 2, y: b.y + b.height / 2 }
                : { x: area.x + area.width - 100, y: area.y + area.height - 100 }
            )
            return process
              .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
              .WindowManager.simulateMouseMove(point.x, point.y)
          },
          { id, inside }
        )
      ).toBe(true)
    }

    /**
     * 获取新建独立窗口的真实页面。
     * @param id 独立窗口标识。
     * @returns 已显示正文的页面。
     */
    async function floatingPage(id: number): Promise<Page> {
      await expect
        .poll(
          () =>
            app
              .context()
              .pages()
              .filter((page) => page.url().includes('tools-floating.html')).length
        )
        .toBe(1)
      const page = app
        .context()
        .pages()
        .find((page) => page.url().includes('tools-floating.html'))!
      await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.focus(), id)
      return page
    }

    /**
     * 用系统鼠标按住收起色签，沿所属边缘拖动指定距离。
     * @param id 独立窗口标识。
     * @param distance 沿边缘移动的像素距离（正数向下或向右）。
     * @returns 拖动完成后的 Promise。
     */
    async function dragTabAlong(id: number, distance: number): Promise<void> {
      await app.evaluate(
        async ({ app, BrowserWindow, screen }, { id, distance }) => {
          const win = BrowserWindow.fromId(id)!
          // 等收起动画结束再按住色签，避免按在过渡中的位置。
          let previous = win.getBounds()
          for (let attempt = 0; attempt < 20; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 30))
            const current = win.getBounds()
            if (
              current.x === previous.x &&
              current.y === previous.y &&
              current.width === previous.width &&
              current.height === previous.height
            )
              break
            previous = current
          }
          const b = win.getBounds()
          const vertical = b.height > b.width
          const startDip = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
          const endDip = vertical
            ? { x: startDip.x, y: startDip.y + distance }
            : { x: startDip.x + distance, y: startDip.y }
          const start = screen.dipToScreenPoint(startDip)
          const end = screen.dipToScreenPoint(endDip)
          await new Promise<void>((resolve, reject) =>
            process
              .mainModule!.require('node:child_process')
              .execFile(
                'powershell.exe',
                [
                  '-NoProfile',
                  '-NonInteractive',
                  '-ExecutionPolicy',
                  'Bypass',
                  '-File',
                  app.getAppPath() + '/tests/fixtures/native-window-drag.ps1',
                  '-StartX',
                  String(start.x),
                  '-StartY',
                  String(start.y),
                  '-EndX',
                  String(end.x),
                  '-EndY',
                  String(end.y)
                ],
                { windowsHide: true },
                (error) => (error ? reject(error) : resolve())
              )
          )
        },
        { id, distance }
      )
    }

    const noteId = await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/toolsFloating.ts')
        .openFloating({ type: 'text', text: '真实拖动与贴靠验收', newWindow: true })
    )
    const note = await floatingPage(noteId)
    await expect(note.getByLabel('便签内容')).toHaveValue('真实拖动与贴靠验收')
    const originalPaper = await note.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    await app.evaluate(({ BrowserWindow, screen }, id) => {
      const win = BrowserWindow.fromId(id)!,
        area = screen.getPrimaryDisplay().workArea
      win.setPosition(area.x + 220, area.y + 180)
      win.focus()
    }, noteId)
    await note.evaluate(() => {
      ;(window as any).__dragEvents = []
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'blur'])
        window.addEventListener(
          type,
          (event: any) => {
            ;(window as any).__dragEvents.push({
              type,
              x: event.screenX,
              y: event.screenY,
              target: event.target?.id,
              left: window.screenX,
              top: window.screenY
            })
          },
          true
        )
    })
    // 使用系统鼠标按下、移动、抬起实际拖动标题栏，不调用 emit('moved') 或贴靠 IPC。
    await app.evaluate(async ({ app, BrowserWindow, screen }, id) => {
      const win = BrowserWindow.fromId(id)!,
        b = win.getBounds(),
        area = screen.getDisplayMatching(b).workArea
      const start = screen.dipToScreenPoint({ x: b.x + 55, y: b.y + 12 })
      const end = screen.dipToScreenPoint({ x: area.x + 2, y: b.y + 12 })
      await new Promise<void>((resolve, reject) =>
        process
          .mainModule!.require('node:child_process')
          .execFile(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              app.getAppPath() + '/tests/fixtures/native-window-drag.ps1',
              '-StartX',
              String(start.x),
              '-StartY',
              String(start.y),
              '-EndX',
              String(end.x),
              '-EndY',
              String(end.y)
            ],
            { windowsHide: true },
            (error) => (error ? reject(error) : resolve())
          )
      )
    }, noteId)
    await fs.writeFile(
      testInfo.outputPath('drag-diagnostics.json'),
      JSON.stringify(
        {
          host: await app.evaluate(
            ({ BrowserWindow, screen }, id) => ({
              bounds: BrowserWindow.fromId(id)!.getBounds(),
              pointer: screen.getCursorScreenPoint()
            }),
            noteId
          ),
          page: await note.evaluate(() => ({
            events: (window as any).__dragEvents,
            region: getComputedStyle(document.getElementById('note-header')!).getPropertyValue(
              '-webkit-app-region'
            )
          }))
        },
        null,
        2
      )
    )
    await movePointer(noteId, false)
    await expect(note.locator('body')).toHaveAttribute('data-pointer', 'outside')
    await expect(note.locator('body')).toHaveAttribute('data-edge', 'left')
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
    // 贴靠是分帧过渡，先等窗口真正收成色签，再移动指针。
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getBounds().width, noteId)
      )
      .toBeLessThanOrEqual(22)
    // 新交互：指针停在色签上不再自动展开，必须点击或拖出才解除贴靠。
    await movePointer(noteId, true)
    await expect(note.locator('body')).toHaveAttribute('data-pointer', 'inside')
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
    await expect(note.getByLabel('便签内容')).toBeHidden()
    // 收起后的色签可以沿边缘自由拖动，位置不再固定。
    const tabBefore = await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getBounds(),
      noteId
    )
    await dragTabAlong(noteId, 140)
    const tabAfter = await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getBounds(),
      noteId
    )
    expect(tabAfter.y - tabBefore.y).toBeGreaterThan(100)
    expect(Math.abs(tabAfter.x - tabBefore.x)).toBeLessThanOrEqual(2)
    expect(tabAfter.width).toBeLessThanOrEqual(22)
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
    // 点击色签解除贴靠并恢复完整纸张。
    await note.locator('#note-dock-tab').click()
    await expect(note.locator('body')).toHaveAttribute('data-edge', '')
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'expanded')
    await expect(note.getByLabel('便签内容')).toBeVisible()
    await fs.writeFile(
      testInfo.outputPath('note-geometry.json'),
      JSON.stringify(
        {
          originalPaper,
          restored: await note.evaluate(() => ({ width: innerWidth, height: innerHeight })),
          host: await app.evaluate(({ BrowserWindow }, id) => {
            const win = BrowserWindow.fromId(id)!
            return { outer: win.getBounds(), content: win.getContentBounds() }
          }, noteId)
        },
        null,
        2
      )
    )
    await expect
      .poll(async () => Math.abs((await note.evaluate(() => innerWidth)) - originalPaper.width))
      .toBeLessThanOrEqual(2)
    await expect(note.getByLabel('便签内容')).toHaveValue('真实拖动与贴靠验收')
    // 其他三个边缘：移到对应边缘后由页面上报释放动作。边缘识别本身由 floatingPointer 单测逐边覆盖，
    // 这里验证真实窗口上的交互链路：释放收起、悬停不展开、点击解除贴靠。
    for (const edge of ['right', 'top', 'bottom'] as const) {
      await app.evaluate(
        ({ BrowserWindow, screen }, { id, edge }) => {
          const win = BrowserWindow.fromId(id)!,
            b = win.getBounds(),
            area = screen.getDisplayMatching(b).workArea
          win.setPosition(
            // 只越过目标边缘少量像素，避免窗口大部分落到相邻显示器，贴靠判定跟随当前显示器。
            edge === 'right' ? area.x + area.width - b.width + 12 : area.x + 220,
            edge === 'top'
              ? area.y - 12
              : edge === 'bottom'
                ? area.y + area.height - b.height + 12
                : area.y + 180
          )
        },
        { id: noteId, edge }
      )
      // 等待系统提交新的屏幕位置，再上报释放动作；收起不等待鼠标离开。
      await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 260)))
      await note.evaluate(() => (window as any).floating.invoke('drag-end'))
      await expect(note.locator('body')).not.toHaveAttribute('data-edge', '', { timeout: 5000 })
      await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
      // 等贴靠过渡结束再判断悬停，避免在动画中途取样。
      await expect
        .poll(() =>
          app.evaluate(
            ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getBounds().width,
            noteId
          )
        )
        .toBeLessThanOrEqual(90)
      await movePointer(noteId, true)
      // 指针停在色签上保持收起，点击后才解除贴靠。
      await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
      await note.locator('#note-dock-tab').click()
      await expect(note.locator('body')).toHaveAttribute('data-edge', '')
      await expect(note.getByLabel('便签内容')).toBeVisible()
      // 等解除贴靠的过渡结束，纸张尺寸完整恢复。
      await expect.poll(() => note.evaluate(() => innerWidth)).toBe(originalPaper.width)
    }
    await app.evaluate(({ BrowserWindow, screen }, id) => {
      const win = BrowserWindow.fromId(id)!,
        area = screen.getPrimaryDisplay().workArea
      win.setPosition(area.x + 250, area.y + 200)
    }, noteId)
    await expect(note.locator('body')).toHaveAttribute('data-edge', '')
    await movePointer(noteId, false)
    await expect(note.getByLabel('便签内容')).toBeVisible()
    // 创建相邻色签，再用真实系统鼠标把第三张拖入组，验证自动排序与文字可见区。
    const notePages = [note]
    const noteIds = [noteId]
    for (let index = 0; index < 2; index++) {
      const existing = app.context().pages()
      const id = await app.evaluate(
        ({ app }, index) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/toolsFloating.ts')
            .openFloating({ type: 'text', text: `堆叠正文 ${index + 2}`, newWindow: true }),
        index
      )
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some((page) => !existing.includes(page) && page.url().includes('tools-floating.html'))
        )
        .toBe(true)
      const page = app
        .context()
        .pages()
        .find((page) => !existing.includes(page) && page.url().includes('tools-floating.html'))!
      await expect(page.getByLabel('便签内容')).toHaveValue(`堆叠正文 ${index + 2}`)
      noteIds.push(id)
      notePages.push(page)
    }
    for (let index = 0; index < notePages.length; index++) {
      await app.evaluate(
        ({ BrowserWindow, screen }, { id, index }) => {
          const win = BrowserWindow.fromId(id)!,
            area = screen.getDisplayMatching(win.getBounds()).workArea
          win.setPosition(area.x, area.y + (index === 2 ? 430 : 130 + index * 10))
        },
        { id: noteIds[index], index }
      )
      await app.evaluate(() => new Promise((resolve) => setTimeout(resolve, 260)))
      await notePages[index].evaluate(() => (window as any).floating.invoke('drag-end'))
      await expect(notePages[index].locator('body')).toHaveAttribute('data-dock', 'collapsed')
    }
    await dragTabAlong(noteIds[2], -190)
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }, ids) => {
          const xs = ids.map((id) => BrowserWindow.fromId(id)!.getBounds().x)
          return xs.map((x) => x - xs[0])
        }, noteIds)
      )
      .toEqual([0, 3, 6])
    const stack = await app.evaluate(
      ({ BrowserWindow }, ids) => ids.map((id) => BrowserWindow.fromId(id)!.getBounds()),
      noteIds
    )
    expect(stack[0].y).toBeLessThan(stack[1].y)
    expect(stack[1].y).toBeLessThan(stack[2].y)
    for (let index = 0; index < notePages.length; index++) {
      const label = await notePages[index].locator('#note-dock-tab').textContent()
      expect(label).toContain(String(index + 1))
      const text = await notePages[index].locator('#note-dock-tab').evaluate((tab) => {
        const range = document.createRange()
        range.selectNodeContents(tab)
        const rect = range.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      })
      for (let other = 0; other < stack.length; other++) {
        if (other === index) continue
        const overlap =
          stack[index].x + text.x < stack[other].x + stack[other].width &&
          stack[index].x + text.x + text.width > stack[other].x &&
          stack[index].y + text.y < stack[other].y + stack[other].height &&
          stack[index].y + text.y + text.height > stack[other].y
        expect(overlap, `便签 ${index + 1} 的文字不能被便签 ${other + 1} 遮挡`).toBe(false)
      }
      const data = await app.evaluate(
        async ({ BrowserWindow }, id) =>
          (await BrowserWindow.fromId(id)!.webContents.capturePage()).toPNG().toString('base64'),
        noteIds[index]
      )
      await fs.writeFile(
        testInfo.outputPath(`note-stack-${index + 1}.png`),
        Buffer.from(data, 'base64')
      )
    }
    await notePages[1].locator('#note-dock-tab').click()
    await expect(notePages[1].getByLabel('便签内容')).toHaveValue('堆叠正文 2')
    for (const page of notePages.slice(1)) {
      if (await page.locator('#note-dock-tab').isVisible())
        await page.locator('#note-dock-tab').click()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await expect.poll(() => page.isClosed()).toBe(true)
    }
    await note.locator('#note-dock-tab').click()
    await expect(note.getByLabel('便签内容')).toHaveValue('真实拖动与贴靠验收')
    await note.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => note.isClosed()).toBe(true)

    const image = await main.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 320
      canvas.getContext('2d')!.fillRect(0, 0, 640, 320)
      return canvas.toDataURL()
    })
    const imageId = await app.evaluate(
      ({ app }, image) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/toolsFloating.ts')
          .openFloating({ type: 'image', image }),
      image
    )
    const photo = await floatingPage(imageId)
    await expect(photo.locator('#canvas')).toBeVisible()
    await expect(photo.locator('#image-tools')).toBeHidden()
    await movePointer(imageId, false)
    await expect(photo.locator('body')).toHaveAttribute('data-pointer', 'outside')
    // 当前浮图操作始终可见，原生指针状态仍控制窗口命中和交互。
    await expect(photo.locator('#float-controls')).toHaveCSS('opacity', '1')
    // 停在图片原生拖动区中央即可显示按钮，不需要先猜中右上角命中区。
    await movePointer(imageId, true)
    await expect(photo.locator('body')).toHaveAttribute('data-pointer', 'inside')
    await expect(photo.locator('#float-controls')).toHaveCSS('opacity', '1')
    // 使用页面缩放手柄连续缩小，窗口和画布须始终贴合；移动后仍保留缩小尺寸。
    const originalSize = await photo.evaluate(() => [innerWidth, innerHeight])
    const east = (await photo.locator('[data-resize="e"]').boundingBox())!
    await photo.mouse.move(east.x + east.width / 2, east.y + east.height / 2)
    await photo.mouse.down()
    await photo.mouse.move(east.x - 160, east.y + east.height / 2, { steps: 12 })
    await photo.mouse.up()
    await expect.poll(() => photo.evaluate(() => innerWidth)).toBeLessThan(originalSize[0] - 100)
    const reducedSize = await photo.evaluate(() => [innerWidth, innerHeight])
    expect(Math.abs(reducedSize[0] / reducedSize[1] - 2)).toBeLessThan(0.02)
    const canvasSize = await photo.locator('#canvas').evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [box.width, box.height]
    })
    expect(Math.abs(canvasSize[0] - reducedSize[0])).toBeLessThanOrEqual(1)
    expect(Math.abs(canvasSize[1] - reducedSize[1])).toBeLessThanOrEqual(1)
    await photo.mouse.move(40, 60)
    await photo.mouse.down()
    await photo.mouse.move(85, 85)
    await photo.mouse.up()
    expect(await photo.evaluate(() => [innerWidth, innerHeight])).toEqual(reducedSize)
    await photo.screenshot({ path: testInfo.outputPath('image-reduced-and-moved.png') })
    const closeBox = (await photo.locator('#float-close').boundingBox())!
    await app.evaluate(
      ({ app, BrowserWindow, screen }, { id, box }) => {
        const b = BrowserWindow.fromId(id)!.getBounds()
        const point = screen.dipToScreenPoint({
          x: b.x + box.x + box.width / 2,
          y: b.y + box.y + box.height / 2
        })
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
          .WindowManager.simulateMouseClick(point.x, point.y)
      },
      { id: imageId, box: closeBox }
    )
    await expect.poll(() => photo.isClosed()).toBe(true)
  } finally {
    if (application && originalPointer)
      await application
        .evaluate(({ app, screen }, point) => {
          const physical = screen.dipToScreenPoint(point)
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
            .WindowManager.simulateMouseMove(physical.x, physical.y)
        }, originalPointer)
        .catch(() => {})
    await application?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
