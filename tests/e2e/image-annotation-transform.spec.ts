import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('图片标记的非笔触标记可选中拖动、手柄缩放并撤销', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(90_000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-annotation-transform-'))
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
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 20_000 })
    await expect
      .poll(
        () =>
          main.evaluate(async () =>
            (await window.tabdo.getAllPlugins()).some((p) => p.name === 'system')
          ),
        { timeout: 20_000 }
      )
      .toBe(true)
    const source = await main.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 300
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 400, 300)
      return canvas.toDataURL()
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
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((p) => p.url().includes('tools-floating.html')),
        { timeout: 20_000 }
      )
      .toBe(true)
    const editor = app
      .context()
      .pages()
      .find((p) => p.url().includes('tools-floating.html'))!
    editor.on('pageerror', (error) => logs.push('PAGE ERROR: ' + error.message))
    await expect(editor.locator('#status')).toContainText('Ctrl+S', { timeout: 20_000 })

    /**
     * 将原图坐标换算为页面指针坐标。
     * @param x 原图横坐标。
     * @param y 原图纵坐标。
     * @returns 页面内指针坐标。
     */
    async function position(x: number, y: number): Promise<{ x: number; y: number }> {
      const box = (await editor.locator('#canvas').boundingBox())!
      return { x: box.x + (x * box.width) / 400, y: box.y + (y * box.height) / 300 }
    }

    /**
     * 按下、移动并松开，用于绘制或拖动标记。
     * @param from 起始原图坐标。
     * @param to 结束原图坐标。
     * @returns 操作完成后的 Promise。
     */
    async function drag(from: [number, number], to: [number, number]): Promise<void> {
      const start = await position(...from)
      const end = await position(...to)
      await editor.mouse.move(start.x, start.y)
      await editor.mouse.down()
      for (let step = 1; step <= 8; step++) {
        await editor.mouse.move(
          start.x + ((end.x - start.x) * step) / 8,
          start.y + ((end.y - start.y) * step) / 8
        )
      }
      await editor.mouse.up()
    }

    /**
     * 读取原图坐标处是否落在红色矩形边线上。
     * @param x 原图横坐标。
     * @param y 原图纵坐标。
     * @returns 该像素是否为标记红色。
     */
    async function isMarked(x: number, y: number): Promise<boolean> {
      return editor.locator('#canvas').evaluate(
        (canvas, [px, py]) => {
          const data = (canvas as HTMLCanvasElement)
            .getContext('2d')!
            .getImageData(px, py, 1, 1).data
          return data[0] > 180 && data[1] < 130 && data[2] < 130
        },
        [x, y]
      )
    }

    await editor.getByRole('button', { name: '矩形', exact: true }).click()
    await editor.getByRole('button', { name: '笔触 4 像素', exact: true }).click()
    await drag([100, 100], [220, 180])
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', '1')
    await expect(editor.locator('#annotation-selection')).toBeVisible()
    expect(await isMarked(100, 120)).toBe(true)

    // 在边线上按下会优先进入拖动，而不是再画一个新矩形。
    await drag([100, 120], [180, 120])
    expect(await isMarked(100, 120)).toBe(false)
    expect(await isMarked(180, 120)).toBe(true)
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', '1')

    // 撤销恢复拖动前的位置，且不会丢失标记。
    await editor.getByRole('button', { name: '撤销', exact: true }).click()
    expect(await isMarked(100, 120)).toBe(true)
    expect(await isMarked(180, 120)).toBe(false)

    // 选中框右中手柄向右拖，验证非笔触标记可变形。
    const selectPoint = await position(100, 120)
    await editor.mouse.click(selectPoint.x, selectPoint.y)
    const handle = editor.locator('#annotation-selection [data-annotation-handle="e"]')
    await expect(handle).toBeVisible()
    const handleBox = (await handle.boundingBox())!
    await editor.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await editor.mouse.down()
    await editor.mouse.move(handleBox.x + handleBox.width / 2 + 40, handleBox.y + handleBox.height / 2)
    await editor.mouse.up()
    expect(await isMarked(260, 140)).toBe(true)
    expect(await isMarked(220, 140)).toBe(false)
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', '1')

    /**
     * 读取原图坐标处的 RGBA 像素。
     * @param x 原图横坐标。
     * @param y 原图纵坐标。
     * @returns 该像素的四通道值。
     */
    async function pixel(x: number, y: number): Promise<number[]> {
      return editor.locator('#canvas').evaluate(
        (canvas, [px, py]) =>
          Array.from(
            (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(px, py, 1, 1).data
          ),
        [x, y]
      )
    }

    // 橡皮擦只擦除标记层：之后创建的聚光灯压暗不能被旧擦除路径打穿。
    await editor.getByRole('button', { name: '画笔', exact: true }).click()
    await editor.getByRole('button', { name: '笔触 4 像素', exact: true }).click()
    await drag([60, 250], [340, 250])
    await editor.getByRole('button', { name: '橡皮擦', exact: true }).click()
    await editor.getByRole('button', { name: '笔触 4 像素', exact: true }).click()
    await drag([250, 210], [250, 290])
    expect((await pixel(250, 250)).slice(0, 3)).toEqual([255, 255, 255])
    await editor.getByRole('button', { name: '聚光灯', exact: true }).click()
    await drag([60, 40], [360, 140])
    const erasedPath = await pixel(250, 250)
    const nearby = await pixel(300, 270)
    // 擦除路径位于清晰区域之外，应与相邻的压暗区域同样变暗，不能残留白色旧路径。
    expect(erasedPath[0]).toBeLessThan(160)
    expect(Math.abs(erasedPath[0] - nearby[0])).toBeLessThan(8)
    expect((await pixel(250, 90)).slice(0, 3)).toEqual([255, 255, 255])

    // 聚光灯笔触复用马赛克的胶囊蒙版：沿笔触形成清晰带，带外继续压暗。
    await editor.getByRole('button', { name: '聚光灯笔', exact: true }).click()
    await editor.getByRole('button', { name: '聚光灯笔 中', exact: true }).click()
    await drag([60, 280], [340, 280])
    expect((await pixel(150, 280)).slice(0, 3)).toEqual([255, 255, 255])
    expect((await pixel(150, 170))[0]).toBeLessThan(160)

    // 文字工具点中已有文本框时先选中移动，不再同时弹出新的输入框。
    await editor.getByRole('button', { name: '文字', exact: true }).click()
    const textAnchor = await position(60, 170)
    await editor.mouse.click(textAnchor.x, textAnchor.y)
    const entry = editor.getByLabel('标注文字')
    await expect(entry).toBeVisible()
    await entry.fill('文本甲')
    await entry.press('Enter')
    await expect(entry).toBeHidden()
    const count = await editor.locator('#canvas').getAttribute('data-annotation-count')
    // 文本框内的非手柄位置：点中后应保持输入框隐藏，只显示选中框。
    const textPoint = await position(80, 182)
    await editor.mouse.click(textPoint.x, textPoint.y)
    await expect(entry).toBeHidden()
    await expect(editor.locator('#annotation-selection')).toBeVisible()
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', count!)
    const before = (await editor.locator('#annotation-selection').boundingBox())!
    const target = await position(180, 252)
    await editor.mouse.move(textPoint.x, textPoint.y)
    await editor.mouse.down()
    await editor.mouse.move(target.x, target.y)
    await editor.mouse.up()
    const after = (await editor.locator('#annotation-selection').boundingBox())!
    expect(after.x).toBeGreaterThan(before.x + 60)
    expect(after.y).toBeGreaterThan(before.y + 40)

    // 选中标记后 Delete 删除并写入撤销历史；无选中时 Delete 不改变画布。
    await editor.keyboard.press('Delete')
    await expect(editor.locator('#annotation-selection')).toBeHidden()
    await expect(editor.locator('#canvas')).toHaveAttribute(
      'data-annotation-count',
      String(Number(count) - 1)
    )
    await editor.keyboard.press('Delete')
    await expect(editor.locator('#canvas')).toHaveAttribute(
      'data-annotation-count',
      String(Number(count) - 1)
    )
    await editor.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(editor.locator('#canvas')).toHaveAttribute('data-annotation-count', count!)

    expect(logs.filter((line) => line.startsWith('PAGE ERROR:'))).toEqual([])
  } finally {
    await app?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
