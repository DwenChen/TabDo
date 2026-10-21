import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('real downloaded offline OCR and formula engines execute and release all runtime resources', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(
    !process.env.TABDO_MODEL_TEST_ASSETS,
    '需要显式指定经下载的 v1.1.1 离线归档目录，常规 E2E 不下载大型模型'
  )
  test.setTimeout(240_000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-real-models-'))
  let app: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
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
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15177')),
        { timeout: 30_000 }
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
    await app.evaluate(({ net }, assets) => {
      const original = net.fetch.bind(net)
      net.fetch = (async (url, options) => {
        const name = String(url).split('/').pop()!
        if (['native-win.zip', 'latex-ort-win.zip', 'latex-models.zip'].includes(name)) {
          const buffer = await process
            .mainModule!.require('node:fs')
            .promises.readFile(process.mainModule!.require('node:path').join(assets, name))
          return new Response(new Uint8Array(buffer))
        }
        return original(url, options)
      }) as typeof net.fetch
    }, process.env.TABDO_MODEL_TEST_ASSETS!)
    await settings.evaluate(async () => {
      const result = await window.tabdo.internal.providers.setEnabled('builtin-wechat-ocr', true)
      if (!result.success) throw new Error(result.error)
    })
    await expect
      .poll(
        () =>
          settings.evaluate(
            async () =>
              (await window.tabdo.internal.providers.getBuiltinState()).engines.wechat.status
          ),
        { timeout: 60_000 }
      )
      .toBe('ready')
    const images = await settings.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 130
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 600, 130)
      ctx.fillStyle = 'black'
      ctx.font = '42px Arial'
      ctx.fillText('HELLO 123', 40, 80)
      const ocr = canvas.toDataURL()
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 600, 130)
      ctx.fillStyle = 'black'
      ctx.font = 'italic 48px Times New Roman'
      ctx.fillText('x + y = 2', 40, 80)
      return { ocr, formula: canvas.toDataURL() }
    })
    const ocr = await settings.evaluate(
      (image) =>
        window.tabdo.internal.providers.invokeBuiltin('builtin-wechat-ocr', { image }, 'real-ocr'),
      images.ocr
    )
    expect(ocr.text.replaceAll(' ', '')).toContain('HELLO123')
    await settings.evaluate(async () => {
      const result = await window.tabdo.internal.providers.setEnabled('builtin-latex', true)
      if (!result.success) throw new Error(result.error)
    })
    await expect
      .poll(
        () =>
          settings.evaluate(
            async () =>
              (await window.tabdo.internal.providers.getBuiltinState()).engines.latex.status
          ),
        { timeout: 90_000 }
      )
      .toBe('ready')
    const formula = await settings.evaluate(
      (image) =>
        window.tabdo.internal.providers.invokeBuiltin('builtin-latex', { image }, 'real-latex'),
      images.formula
    )
    expect(formula.text).toMatch(/x/)
    expect(formula.text).toMatch(/[=+]/)
    // 该用例验证真实推理与释放；识别精度单独记录，不把模型误识别算作精度通过。
    const formulaExact =
      formula.text.replace(/\\textstyle|\\s/g, '').replaceAll(' ', '') === 'x+y=2'
    const resources = await app.evaluate(({ app }) => {
      const fs = process.mainModule!.require('node:fs')
      const root = process
        .mainModule!.require(app.getAppPath() + '/src/main/core/provider/modelAssets.ts')
        .getBuiltinModelsRoot()
      return fs.readdirSync(root).filter((name: string) => name.startsWith('.request-'))
    })
    expect(resources).toEqual([])
    await fs.writeFile(
      testInfo.outputPath('real-offline-results.json'),
      JSON.stringify({ ocr, formula, expectedFormula: 'x+y=2', formulaExact, resources }, null, 2)
    )
    await settings.evaluate(async () => {
      await window.tabdo.internal.providers.removeModel('builtin-wechat-ocr')
      await window.tabdo.internal.providers.removeModel('builtin-latex')
    })
    expect(
      await settings.evaluate(
        async () => (await window.tabdo.internal.providers.getBuiltinState()).engines
      )
    ).toMatchObject({ wechat: { installed: false }, latex: { installed: false } })
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
