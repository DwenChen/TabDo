import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('图片标记对齐截图箭头、连续马赛克及透明彩色文字框', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(90_000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-annotation-interactions-'))
  let app: ElectronApplication | undefined
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
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((p) => p.name === 'system')
        )
      )
      .toBe(true)
    const source = await main.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 600
      c.height = 400
      const context = c.getContext('2d')!,
        pixels = context.createImageData(600, 400)
      for (let y = 0; y < 400; y++)
        for (let x = 0; x < 600; x++) {
          const i = (y * 600 + x) * 4
          pixels.data[i] = y < 160 ? 255 : (x * 13 + y * 7) % 256
          pixels.data[i + 1] = y < 160 ? 255 : (x * 19 + y * 3) % 256
          pixels.data[i + 2] = y < 160 ? 255 : (x * 5 + y * 11) % 256
          pixels.data[i + 3] = 255
        }
      context.putImageData(pixels, 0, 0)
      return c.toDataURL()
    })
    await main.evaluate(async (image) => {
      const plugin = (await window.tabdo.getAllPlugins()).find((p) => p.name === 'system')!
      await window.tabdo.launch({
        path: plugin.path,
        type: 'plugin',
        featureCode: 'image-annotate',
        param: { type: 'img', payload: image }
      })
    }, source)
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const editor = app
      .context()
      .pages()
      .find((p) => p.url().includes('tools-floating.html'))!
    editor.on('pageerror', (error) => logs.push('PAGE ERROR: ' + error.message))
    await expect(editor.locator('#status')).toContainText('Ctrl+S')
    /**
     * 将原图坐标映射为当前缩放下的真实画布位置。
     * @param x 原图横坐标。
     * @param y 原图纵坐标。
     * @returns 页面内指针坐标。
     */
    async function position(x: number, y: number): Promise<{ x: number; y: number }> {
      const b = (await editor.locator('#canvas').boundingBox())!
      return { x: b.x + (x * b.width) / 600, y: b.y + (y * b.height) / 400 }
    }
    /**
     * 在实际页面绘制，单次快速移动用于检查马赛克路径是否存在空洞。
     * @param from 起点原图坐标。
     * @param to 终点原图坐标。
     * @returns 绘制完成后的Promise。
     */
    async function stroke(from: [number, number], to: [number, number]): Promise<void> {
      const a = await position(...from),
        b = await position(...to)
      await editor.mouse.move(a.x, a.y)
      await editor.mouse.down()
      await editor.mouse.move(b.x, b.y)
      await editor.mouse.up()
    }
    /**
     * 读取已渲染画布，光标与框选参考线不属于该图片。
     * @returns 当前PNG数据URL。
     */
    async function png(): Promise<string> {
      return editor.locator('#canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())
    }
    /**
     * 等待正文绘制稳定后保存独立窗口的可见WebContents，不拼接宿主。
     * @param name 证据文件名。
     * @returns 截图写入后的Promise。
     */
    async function capture(name: string): Promise<void> {
      // 等选中底色的短过渡结束，避免把上一工具尚未褪去的高亮当作最终界面。
      await expect
        .poll(() =>
          editor
            .locator('#image-tools .active')
            .evaluateAll((elements) =>
              elements
                .filter((el) => el.getBoundingClientRect().width > 0)
                .every((el) => getComputedStyle(el).backgroundColor === 'rgb(225, 237, 253)')
            )
        )
        .toBe(true)
      await editor.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      const encoded = await app!.evaluate(
        async ({ webContents }, url) =>
          (
            await webContents
              .getAllWebContents()
              .find((c) => c.getURL() === url)!
              .capturePage()
          )
            .toPNG()
            .toString('base64'),
        editor.url()
      )
      await fs.writeFile(testInfo.outputPath(name), Buffer.from(encoded, 'base64'))
    }
    const baseline = await png()
    await editor.getByRole('button', { name: '箭头', exact: true }).click()
    await editor.getByRole('button', { name: '笔触 4 像素', exact: true }).click()
    await stroke([60, 80], [300, 80])
    const arrow = await editor.locator('#canvas').evaluate((c: HTMLCanvasElement) => {
      const context = c.getContext('2d')!
      const samples = [
        [65, 85],
        [240, 85],
        [279, 91],
        [275, 93],
        [300, 80]
      ]
      return samples.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data))
    })
    // 窄尾、渐宽箭身、张开的机翼和内凹底边；普通直线加三角形不能通过这些像素断言。
    expect(arrow[0][1]).toBe(255)
    expect(arrow[1][1]).toBeLessThan(100)
    expect(arrow[2][1]).toBeLessThan(100)
    expect(arrow[3][1]).toBe(255)
    const tail = await editor.locator('#canvas').evaluate((c: HTMLCanvasElement) => {
      const context = c.getContext('2d')!
      return [79, 80].map((y) => context.getImageData(62, y, 1, 1).data[1])
    })
    // 尾端从单点展开，起点附近不能残留原先四像素宽的平切端面。
    expect(Math.min(...tail)).toBeGreaterThan(230)
    await capture('arrow-wing-style.png')
    await editor.getByRole('button', { name: '撤销', exact: true }).click()
    expect(await png()).toBe(baseline)
    await editor.getByRole('button', { name: '重做', exact: true }).click()
    expect(await png()).not.toBe(baseline)
    await editor.getByRole('button', { name: '清除所有标注', exact: true }).click()
    // 先分别设置，再逐个返回，证明颜色、笔触和字号不是几个工具共享的最后值。
    const remembered = [
      { name: '矩形', color: '橙色', rgb: 'rgb(255, 149, 0)', size: 2 },
      { name: '椭圆', color: '蓝色', rgb: 'rgb(0, 122, 255)', size: 8 },
      { name: '箭头', color: '紫色', rgb: 'rgb(175, 82, 222)', size: 12 },
      { name: '画笔', color: '蓝色', rgb: 'rgb(0, 122, 255)', size: 20 },
      { name: '荧光笔', color: '绿色', rgb: 'rgb(52, 199, 89)', size: 8 },
      { name: '序号圆圈', color: '白色', rgb: 'rgb(255, 255, 255)', size: 12 },
      { name: '橡皮擦', color: '黑色', rgb: 'rgb(28, 28, 30)', size: 2 },
      { name: '文字', color: '绿色', rgb: 'rgb(52, 199, 89)', font: 36 }
    ]
    for (const option of remembered) {
      await editor.getByRole('button', { name: option.name, exact: true }).click()
      await editor
        .getByRole('button', {
          name: option.name === '荧光笔' ? '荧光笔颜色' : '画笔颜色',
          exact: true
        })
        .click()
      await editor.getByRole('button', { name: option.color, exact: true }).click()
      await editor
        .getByRole('button', {
          name: option.font ? `字号 ${option.font} 像素` : `笔触 ${option.size} 像素`,
          exact: true
        })
        .click()
    }
    for (const option of remembered) {
      await editor.getByRole('button', { name: option.name, exact: true }).click()
      await expect(editor.locator('#color-preview')).toHaveCSS('background-color', option.rgb)
      await expect(
        editor.getByRole('button', {
          name: option.font ? `字号 ${option.font} 像素` : `笔触 ${option.size} 像素`,
          exact: true
        })
      ).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(editor.getByRole('group', { name: '笔触大小', exact: true })).toBeHidden()
    await expect(editor.getByRole('group', { name: '文字字号', exact: true })).toBeVisible()
    await expect(editor.locator('#font-control [data-font-size]')).toHaveCount(3)
    await expect(editor.locator('#font-control i')).toHaveCount(0)
    await capture('independent-font-options.png')
    await editor.getByRole('button', { name: '马赛克', exact: true }).click()
    await expect(editor.getByRole('group', { name: '马赛克设置', exact: true })).toBeVisible()
    await expect(editor.locator('#mosaic-controls select')).toHaveCount(0)
    expect((await editor.locator('#mosaic-controls').innerText()).trim()).toBe('')
    await expect(editor.locator('[data-mosaic-density] svg')).toHaveCount(3)
    await expect(
      editor.getByRole('button', { name: '马赛克浓度 中', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    // 非整数DPI会将1px细线吸附为物理像素，实际计算宽度应可见且保持细线。
    const dividerWidth = await editor
      .locator('#mosaic-controls')
      .evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth))
    expect(dividerWidth).toBeGreaterThan(0)
    expect(dividerWidth).toBeLessThanOrEqual(1.5)
    await expect(editor.locator('#mosaic-controls')).toHaveCSS(
      'border-left-color',
      'rgb(220, 220, 220)'
    )
    await expect(editor.getByRole('button', { name: '画笔颜色', exact: true })).toBeHidden()
    const hover = await position(100, 240)
    await editor.mouse.move(hover.x, hover.y)
    await expect(editor.locator('#mosaic-cursor')).toBeVisible()
    const width = (await editor.locator('#canvas').boundingBox())!.width
    expect((await editor.locator('#mosaic-cursor').boundingBox())!.width).toBeCloseTo(
      (44 * width) / 600,
      0
    )
    await editor.getByRole('button', { name: '马赛克笔 大', exact: true }).click()
    await editor.mouse.move(hover.x, hover.y)
    expect((await editor.locator('#mosaic-cursor').boundingBox())!.width).toBeCloseTo(
      (72 * width) / 600,
      0
    )
    await editor.getByRole('button', { name: '马赛克笔 中', exact: true }).click()
    await editor.getByRole('button', { name: '马赛克浓度 轻', exact: true }).click()
    await stroke([70, 240], [530, 240])
    const smooth = await editor.locator('#canvas').evaluate((c: HTMLCanvasElement) => {
      const bits = c.getContext('2d')!.getImageData(80, 240, 440, 1).data
      let unchanged = 0,
        transitions = 0
      for (let i = 0; i < 440; i++) {
        const x = i + 80
        if (
          bits[i * 4] === (x * 13 + 240 * 7) % 256 &&
          bits[i * 4 + 1] === (x * 19 + 240 * 3) % 256
        )
          unchanged++
        if (i && bits[i * 4] !== bits[(i - 1) * 4]) transitions++
      }
      return { unchanged, transitions }
    })
    expect(smooth.unchanged).toBeLessThan(5)
    const light = await png()
    await editor.getByRole('button', { name: '马赛克浓度 重', exact: true }).click()
    const heavy = await editor.locator('#canvas').evaluate((c: HTMLCanvasElement) => {
      const bits = c.getContext('2d')!.getImageData(80, 240, 440, 1).data
      let changes = 0
      for (let i = 1; i < 440; i++) if (bits[i * 4] !== bits[(i - 1) * 4]) changes++
      return changes
    })
    expect(await png()).not.toBe(light)
    expect(heavy).toBeLessThan(smooth.transitions * 0.6)
    const brush = await png()
    await editor.getByRole('button', { name: '框选马赛克', exact: true }).click()
    await expect(editor.locator('#mosaic-cursor')).toBeHidden()
    await expect(editor.getByRole('group', { name: '马赛克笔大小', exact: true })).toBeHidden()
    const a = await position(450, 370),
      b = await position(350, 290)
    await editor.mouse.move(a.x, a.y)
    await editor.mouse.down()
    await editor.mouse.move(b.x, b.y)
    await expect(editor.locator('#mosaic-selection')).toBeVisible()
    await editor.mouse.up()
    await expect(editor.locator('#mosaic-selection')).toBeHidden()
    const rectangle = await png()
    expect(rectangle).not.toBe(brush)
    const rectPixels = await editor
      .locator('#canvas')
      .evaluate((c: HTMLCanvasElement) =>
        [400, 330].map((x) => Array.from(c.getContext('2d')!.getImageData(x, 330, 1, 1).data))
      )
    expect(rectPixels[0].slice(0, 2)).not.toEqual([
      (400 * 13 + 330 * 7) % 256,
      (400 * 19 + 330 * 3) % 256
    ])
    expect(rectPixels[1].slice(0, 2)).toEqual([
      (330 * 13 + 330 * 7) % 256,
      (330 * 19 + 330 * 3) % 256
    ])
    await editor.getByRole('button', { name: '撤销', exact: true }).click()
    expect(await png()).toBe(brush)
    await editor.getByRole('button', { name: '重做', exact: true }).click()
    expect(await png()).toBe(rectangle)
    const count = await editor.locator('#canvas').getAttribute('data-annotation-count')
    await stroke([220, 320], [220, 320])
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', count!)
    const cancelledStart = await position(200, 310),
      cancelledEnd = await position(280, 360)
    await editor.mouse.move(cancelledStart.x, cancelledStart.y)
    await editor.mouse.down()
    await editor.mouse.move(cancelledEnd.x, cancelledEnd.y)
    await expect(editor.locator('#mosaic-selection')).toBeVisible()
    await editor.locator('#canvas').dispatchEvent('pointercancel', { pointerId: 1 })
    await editor.mouse.up()
    await expect(editor.locator('#mosaic-selection')).toBeHidden()
    expect(await png()).toBe(rectangle)
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', count!)
    await capture('mosaic-rectangle-and-brush.png')
    await editor.getByRole('button', { name: '马赛克笔', exact: true }).click()
    const ring = await position(100, 240)
    await editor.mouse.move(ring.x, ring.y)
    expect(await png()).toBe(rectangle)
    await capture('mosaic-brush-cursor.png')
    await editor.mouse.move(10, 10)
    await expect(editor.locator('#mosaic-cursor')).toBeHidden()
    await editor.getByRole('button', { name: '清除所有标注', exact: true }).click()
    await editor.getByRole('button', { name: '文字', exact: true }).click()
    await expect(editor.getByRole('button', { name: '字号 36 像素', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await editor.getByRole('button', { name: '字号 24 像素', exact: true }).click()
    await editor.getByRole('button', { name: '画笔颜色', exact: true }).click()
    await editor.getByRole('button', { name: '蓝色', exact: true }).click()
    const anchor = await position(70, 55)
    await editor.mouse.click(anchor.x, anchor.y)
    const entry = editor.getByLabel('标注文字')
    await expect(entry).toBeFocused()
    await expect(entry).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(entry).toHaveCSS('border-top-color', 'rgb(0, 122, 255)')
    const emptyWidth = (await entry.boundingBox())!.width
    await entry.fill('透明彩色输入')
    await editor.getByRole('button', { name: '字号 36 像素', exact: true }).click()
    await expect(entry).toBeFocused()
    await expect(entry).toHaveCSS('font-size', '36px')
    await editor.getByRole('button', { name: '字号 16 像素', exact: true }).click()
    await expect(entry).toHaveCSS('font-size', '16px')
    await expect(entry).toHaveValue('透明彩色输入')
    await editor.getByRole('button', { name: '字号 24 像素', exact: true }).click()
    await entry.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
    await entry.dispatchEvent('keydown', { key: 'Escape', isComposing: true })
    await expect(entry).toBeVisible()
    expect((await entry.boundingBox())!.width).toBeGreaterThan(emptyWidth + 20)
    await editor.getByRole('button', { name: '画笔颜色', exact: true }).click()
    await editor.getByRole('button', { name: '绿色', exact: true }).click()
    await expect(entry).toBeFocused()
    await expect(entry).toHaveValue('透明彩色输入')
    await expect(entry).toHaveCSS('color', 'rgb(52, 199, 89)')
    await expect(entry).toHaveCSS('border-top-color', 'rgb(52, 199, 89)')
    await expect(entry).toHaveCSS('caret-color', 'rgb(52, 199, 89)')
    await capture('transparent-colored-text-input.png')
    await editor.locator('#zoom').selectOption('0.5')
    const scaled = await position(70, 55),
      field = (await entry.boundingBox())!
    expect(Math.abs(field.x - (scaled.x - 5))).toBeLessThan(2)
    expect(Math.abs(field.y - (scaled.y - 5))).toBeLessThan(2)
    await expect(entry).toHaveCSS('font-size', '12px')
    await editor.getByRole('button', { name: '字号 36 像素', exact: true }).click()
    await expect(entry).toHaveCSS('font-size', '18px')
    await entry.press('Enter')
    await expect(entry).toBeHidden()
    // 最终原图文字也必须使用36px，不能只改变输入框外观而仍导出固定24px。
    const inkRows = await editor.locator('#canvas').evaluate((c: HTMLCanvasElement) => {
      const pixels = c.getContext('2d')!.getImageData(60, 45, 350, 90).data
      let rows = 0
      for (let y = 0; y < 90; y++) {
        for (let x = 0; x < 350; x++) {
          const i = (y * 350 + x) * 4
          if (pixels[i + 1] - pixels[i] > 40 && pixels[i + 1] - pixels[i + 2] > 40) {
            rows++
            break
          }
        }
      }
      return rows
    })
    expect(inkRows).toBeGreaterThan(28)
    const committed = await png()
    const cancel = await position(200, 55)
    await editor.mouse.click(cancel.x, cancel.y)
    await entry.fill('不提交')
    await entry.press('Escape')
    expect(await png()).toBe(committed)
    await editor.getByRole('button', { name: '复制图片', exact: true }).click()
    expect(
      await app.evaluate(
        ({ clipboard, nativeImage }, data) =>
          clipboard.readImage().toBitmap().equals(nativeImage.createFromDataURL(data).toBitmap()),
        committed
      )
    ).toBe(true)
    // 窄窗口中模式、浓度和独立笔刷参数均可用，普通悬浮图片不受这些控件影响。
    await editor.evaluate(() =>
      (window as any).floating.invoke('resize', { width: 340, height: 620, direction: 'se' })
    )
    await expect.poll(() => editor.evaluate(() => innerWidth)).toBeLessThanOrEqual(342)
    await editor.getByRole('button', { name: '马赛克', exact: true }).click()
    await expect(editor.getByRole('button', { name: '马赛克浓度 重', exact: true })).toBeVisible()
    await expect(editor.locator('[data-tool="mosaic"]')).toHaveAttribute('aria-pressed', 'true')
    expect(
      await editor.locator('#mosaic-controls button').evaluateAll((elements) =>
        elements
          .filter((el) => el.getBoundingClientRect().width)
          .every((el) => {
            const r = el.getBoundingClientRect()
            return (
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= document.getElementById('image-tools')!.getBoundingClientRect().bottom
            )
          })
      )
    ).toBe(true)
    await capture('mosaic-narrow-toolbar.png')
    await editor.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => editor.isClosed()).toBe(true)
    expect(logs.filter((line) => line.startsWith('PAGE ERROR:'))).toEqual([])
  } finally {
    await app?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
