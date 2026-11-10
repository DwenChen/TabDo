import {
  expect as playwrightExpect,
  test,
  _electron as electron,
  type ElectronApplication
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
const expect = playwrightExpect.configure({ timeout: 30_000 })

/**
 * 直接捕获已稳定的插件正文。
 * @param app 源码 Electron 实例。
 * @param url 插件开发服务地址。
 * @param file 自动归档中的截图路径。
 * @returns 正文截图写入完成的 Promise。
 */
async function capturePlugin(app: ElectronApplication, url: string, file: string): Promise<void> {
  const screenshot = await app.evaluate(async ({ webContents }, prefix) => {
    const view = webContents.getAllWebContents().find((entry) => entry.getURL().startsWith(prefix))!
    return (await view.capturePage()).toPNG().toString('base64')
  }, url)
  await fs.writeFile(file, Buffer.from(screenshot, 'base64'))
}

test('呼叫AI使用提供商、内置context-mode、审批和提问，关闭后清理并保留产物', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180_000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-call-ai-e2e-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
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
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    const app = application
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const main = await app.firstWindow()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByTestId('call-ai-setting')).toHaveCount(0)
    await settings.getByRole('button', { name: '呼叫AI', exact: true }).click()
    await expect(settings.getByTestId('call-ai-setting')).toBeVisible({ timeout: 30_000 })
    await expect(settings.getByRole('heading', { name: '呼叫AI', exact: true })).toHaveCount(0)
    const managerButtons = await settings
      .locator('.manager-actions .icon-button')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left))
    expect(managerButtons).toHaveLength(2)
    expect(managerButtons[0]).toBe(managerButtons[1])
    const addButtons = settings.locator('.manager-actions .accent-action')
    await expect(addButtons).toHaveText(['添加', '添加'])
    expect(
      await addButtons.evaluateAll((elements) =>
        elements.every((element) => {
          const style = getComputedStyle(element)
          const bounds = element.getBoundingClientRect()
          const text = document.createRange()
          text.selectNodeContents(element)
          const label = text.getBoundingClientRect()
          const centeredX =
            Math.abs(label.left + label.width / 2 - bounds.left - bounds.width / 2) < 1
          const centeredY =
            Math.abs(label.top + label.height / 2 - bounds.top - bounds.height / 2) < 1
          const sample = document.createElement('span')
          sample.style.color = 'var(--primary-color)'
          element.append(sample)
          const matches = style.color === getComputedStyle(sample).color && centeredX && centeredY
          sample.remove()
          return matches
        })
      )
    ).toBe(true)
    await expect(settings.getByLabel('结果产物默认位置')).toBeVisible()
    await expect(settings.getByLabel('结果产物默认位置')).toHaveValue(/[/\\]TabDo[/\\]Call_AI$/)
    await settings.getByText('运行时与额外库', { exact: true }).click()
    const runtimeRows = settings.locator('.runtime-row')
    for (const label of ['更新', '清理额外库']) {
      const buttons = runtimeRows.getByRole('button', { name: label, exact: true })
      await expect(buttons).toHaveCount(2)
      await expect(buttons.first()).toHaveAttribute('title', label)
      await expect(buttons.first()).toHaveText('')
    }
    const checkRuntime = settings.getByRole('button', { name: '检查状态', exact: true })
    const checkRow = checkRuntime.locator('xpath=../..')
    await checkRuntime.click()
    await expect(checkRow.getByRole('status')).toHaveText('状态已检查')
    await expect(checkRow.locator('.runtime-check-mark')).toBeVisible()
    const statusOffset = await checkRow
      .getByRole('status')
      .evaluate((element) =>
        Math.abs(
          element.getBoundingClientRect().right -
            element.parentElement!.getBoundingClientRect().right
        )
      )
    expect(statusOffset).toBeLessThan(1)
    await expect(
      settings.locator('.call-ai-setting .runtime-row small').filter({ hasText: '正常' })
    ).toHaveCount(2)
    await settings.getByLabel('结果产物默认位置').fill(path.join(temporary, 'outputs'))
    await settings.getByLabel('结果产物默认位置').press('Enter')
    await expect(settings.getByText('产物位置已更新', { exact: true })).toBeVisible()
    await settings.getByText('全局规则', { exact: true }).click()
    await settings.getByLabel('呼叫AI全局规则').fill('测试规则：所有产物保持 UTF-8')
    await settings.getByLabel('呼叫AI全局规则').blur()
    await expect(settings.getByText('全局规则已更新', { exact: true })).toBeVisible()
    const mcpServer = path.join(temporary, 'manual-mcp.cjs')
    const manualStarted = path.join(temporary, 'manual-started.txt')
    const inspectionPid = path.join(temporary, 'mcp-inspection-pid.txt')
    await fs.writeFile(
      mcpServer,
      `
      const fs = require('node:fs')
      const path = require('node:path')
      const readline = require('node:readline')
      const inspecting = path.basename(path.dirname(process.cwd())) === 'mcp-inspections'
      if (inspecting) fs.writeFileSync(${JSON.stringify(inspectionPid)}, String(process.pid))
      else fs.writeFileSync(${JSON.stringify(manualStarted)}, 'started')
      const tool = (name, description) => ({
        name, description, inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      })
      readline.createInterface({ input: process.stdin }).on('line', (line) => {
        const request = JSON.parse(line)
        if (request.id === undefined) return
        let result = {}
        if (request.method === 'initialize') result = {
          protocolVersion: request.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'manual', version: '1' }
        }
        if (request.method === 'tools/list') {
          result = request.params?.cursor === 'next'
            ? { tools: [tool('other', 'second page')] }
            : { tools: [tool('echo', 'manual echo')], ...(inspecting ? { nextCursor: 'next' } : {}) }
        }
        if (request.method === 'tools/call') result = {
          content: [{ type: 'text', text: 'manual-result' }]
        }
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n')
      })`
    )
    await settings.locator('.add-menu > summary').click()
    await settings.getByRole('button', { name: '手动配置', exact: true }).click()
    const editor = settings.getByRole('dialog', { name: '手动配置' })
    await editor.getByLabel('MCP 配置 JSON').fill(
      JSON.stringify(
        {
          mcpServers: { manual: { name: '手动MCP', command: 'node', args: [mcpServer] } }
        },
        null,
        2
      )
    )
    await expect(editor.getByRole('button', { name: '确认', exact: true })).toBeEnabled()
    const modalOffset = await editor.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return Math.max(
        Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2),
        Math.abs(bounds.top + bounds.height / 2 - window.innerHeight / 2)
      )
    })
    expect(modalOffset).toBeLessThan(3)
    await capturePlugin(
      app,
      'http://127.0.0.1:15177',
      testInfo.outputPath('call-ai-mcp-editor.png')
    )
    await editor.getByRole('button', { name: '确认', exact: true }).click()
    await expect(editor).toBeHidden()
    const mcpToggle = settings.getByRole('switch', { name: '启用 手动MCP' })
    await mcpToggle.click()
    await expect(mcpToggle).toHaveAttribute('aria-checked', 'false')
    await settings.getByText('手动MCP', { exact: true }).click()
    await expect(fs.stat(inspectionPid)).rejects.toThrow()
    await settings.getByRole('button', { name: '查看工具', exact: true }).click()
    const listedTools = settings.getByRole('list', { name: 'MCP 工具' })
    await expect(listedTools.locator('code')).toHaveText(['echo', 'other'])
    await expect(listedTools.locator('small')).toHaveText(['manual echo', 'second page'])
    const inspectionProcess = Number(await fs.readFile(inspectionPid, 'utf8'))
    await expect
      .poll(() => {
        try {
          process.kill(inspectionProcess, 0)
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
          throw error
        }
      })
      .toBe(false)
    await expect(mcpToggle).toHaveAttribute('aria-checked', 'false')
    await settings.getByText('手动MCP', { exact: true }).click()
    await mcpToggle.click()
    await expect(mcpToggle).toHaveAttribute('aria-checked', 'true')
    const skill = path.join(temporary, '手动Skill.zip')
    const agentSkill = path.join(temporary, '对话Skill.zip')
    const manualZip = new AdmZip()
    manualZip.addFile(
      '手动Skill/SKILL.md',
      Buffer.from(
        '---\nname: manual\ndescription: >-\n  查看已安装\n  Skill 的描述\n---\n# Skill\nSKILL_MANUAL_ONLY_SENTINEL'
      )
    )
    manualZip.addFile('手动Skill/references/notes.txt', Buffer.from('relative resources'))
    await fs.writeFile(skill, manualZip.toBuffer())
    const agentZip = new AdmZip()
    agentZip.addFile('SKILL.md', Buffer.from('# Dialog Skill'))
    await fs.writeFile(agentSkill, agentZip.toBuffer())
    await app.evaluate(({ dialog }, directory) => {
      ;(globalThis as any).__callAiOriginalOpenDialog = dialog.showOpenDialog
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [directory] })) as any
    }, skill)
    await settings.locator('.manager-actions > button').filter({ hasText: '添加' }).click()
    await expect(settings.getByText('手动Skill', { exact: true })).toBeVisible()
    await settings.getByText('手动Skill', { exact: true }).click()
    await expect(settings.getByText('查看已安装 Skill 的描述', { exact: true })).toBeVisible()
    await expect(settings.getByText('SKILL_MANUAL_ONLY_SENTINEL')).toHaveCount(0)
    await settings.getByTestId('call-ai-setting').evaluate((element) => element.scrollTo(0, 0))
    await capturePlugin(app, 'http://127.0.0.1:15177', testInfo.outputPath('call-ai-settings.png'))
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = (globalThis as any).__callAiOriginalOpenDialog
    })
    await settings.getByText('网页搜索', { exact: true }).click()
    await settings.getByLabel('Brave Search API 密钥').fill('fixture-search-key')
    await settings.getByLabel('Brave Search API 密钥').blur()
    await expect(settings.getByRole('button', { name: '移除密钥' })).toBeVisible()
    const desktop = path.join(temporary, '测试桌面')
    const picture = path.join(temporary, '附件图片.png')
    const draggedFile = path.join(temporary, '拖入的资料.txt')
    await fs.mkdir(desktop)
    await fs.writeFile(path.join(desktop, '原有文件.txt'), 'keep')
    await fs.writeFile(
      picture,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
        'base64'
      )
    )
    await fs.writeFile(draggedFile, '本地资料')
    await app.evaluate(
      async ({ app, shell }, { agentSkill, mcpServer, desktop }) => {
        // 记录主进程收到的系统打开请求，避免启动测试机上的默认软件。
        const artifactActions: Array<{ action: string; target: string }> = []
        ;(globalThis as any).__callAiArtifactActions = artifactActions
        shell.openPath = async (target) => {
          artifactActions.push({ action: 'open', target })
          return ''
        }
        shell.showItemInFolder = (target) => {
          artifactActions.push({ action: 'reveal', target })
        }
        // 将系统桌面重定向到隔离夹具，所有其他 app 路径保持隔离配置。
        const getPath = app.getPath.bind(app)
        app.getPath = (name) => (name === 'desktop' ? desktop : getPath(name))
        const load = (file: string): any =>
          process.mainModule!.require(app.getAppPath() + '/src/main/' + file)
        const service = load('core/aiProviderService.ts').default
        service.addProvider({
          name: '测试提供商',
          apiUrl: 'http://127.0.0.1:1/v1',
          apiKey: 'test-only',
          apiFormat: 'openai-chat',
          enabled: true,
          selectedModels: [
            {
              ref: 'call-ai-test',
              modelId: 'call-ai-test',
              description: '可识图的测试模型',
              inputModalities: ['text', 'image']
            }
          ]
        })
        service.addProvider({
          name: 'DeepSeek',
          apiUrl: 'https://api.deepseek.com/v1',
          apiKey: 'fixture-deepseek-key',
          apiFormat: 'openai-chat',
          enabled: true,
          selectedModels: [
            {
              ref: 'call-ai-deepseek',
              modelId: 'deepseek-flash',
              inputModalities: ['text', 'image']
            }
          ]
        })
        const adapters = load('api/plugin/aiProtocol/adapters.ts')
        const https = process.mainModule!.require('node:https')
        const { PassThrough } = process.mainModule!.require('node:stream')
        const { EventEmitter } = process.mainModule!.require('node:events')
        const webRequests: Array<{ url: string; body: any; auth: string }> = []
        ;(globalThis as any).__callAiWebRequests = webRequests
        const request = https.request
        https.request = (url: URL, options: any, callback: (response: any) => void) => {
          if (url.origin !== 'https://api.deepseek.com' || !url.pathname.startsWith('/v1/tools/'))
            return request(url, options, callback)
          const connection = new EventEmitter()
          connection.end = (body: string) => {
            webRequests.push({
              url: url.href,
              body: JSON.parse(body),
              auth: options.headers.authorization
            })
            const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
            callback(response)
            const output = url.pathname.endsWith('/fetch')
              ? JSON.stringify({ title: '夹具网页', content: '# 夹具正文' })
              : webRequests.length === 1
                ? '{"results":[{"summary": DNS 解析测试}]}'
                : JSON.stringify({
                    results: [
                      { url: 'https://example.com/page', title: '夹具', summary: '夹具摘要' }
                    ]
                  })
            response.end(output)
          }
          return connection
        }
        let turn = 0
        ;(globalThis as any).__callAiPrompts = []
        adapters.createAdapter = () => ({
          stream: async (input: any, _signal: AbortSignal, delta: (value: any) => void) => {
            const lastUser = input.messages.findLastIndex((entry: any) => entry.role === 'user')
            const task = input.messages[lastUser].content
            const replies = input.messages
              .slice(lastUser + 1)
              .filter((entry: any) => entry.role === 'tool')
            const tool = (name: string, args: unknown) => ({
              content: '',
              toolCalls: [
                {
                  id: `call-${lastUser}-${replies.length}`,
                  type: 'function',
                  function: { name, arguments: JSON.stringify(args) }
                }
              ],
              finishReason: 'tool_calls'
            })
            if (task === '验证网页检索恢复') {
              const search = tool('web_search', { query: '网页检索夹具' })
              if (!replies.length) {
                search.toolCalls[0].function.arguments = '{"query": DNS 解析测试}'
                return search
              }
              if (replies.length < 3) return search
              if (replies.length === 3)
                return tool('web_fetch', { url: 'https://example.com/page' })
              if (replies.length < 41) return search
              const recovered =
                replies[1].content.includes('返回了无效的 JSON') &&
                replies[2].content.includes('夹具摘要') &&
                replies[3].content.includes('夹具正文')
              const content = recovered ? '检索已恢复并完成超过四十次往返' : '检索夹具失败'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (typeof task === 'string' && /^验证(完全权限)?关闭网页/.test(task)) {
              if (!replies.length) return tool('web_search', { query: '不应发出' })
              const enabled = input.tools.some(({ function: entry }) => /^web_/.test(entry.name))
              const content = enabled ? '关闭时意外注册网页工具' : '本轮网页工具仍关闭'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (JSON.stringify(task).includes('处理这些附件。')) {
              const content = JSON.stringify(task).includes('data:image/png;base64,')
                ? '已收到匹配图片'
                : '匹配图片未发送'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (typeof task === 'string' && task.startsWith('验证类似命令')) {
              const repeat = task === '验证类似命令复用'
              if (!replies.length || (repeat && replies.length < 3))
                return tool('run_code', {
                  language: 'node',
                  code:
                    replies.length === 2 ? 'console.log("不同的参数")' : 'console.log("相同的参数")'
                })
              const content =
                repeat &&
                !replies.slice(0, 2).every(({ content }) => content.includes('相同的参数'))
                  ? '类似命令验证失败'
                  : '类似命令验证完成'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            ;(globalThis as any).__callAiPrompts.push(input)
            turn++
            if (turn <= 3) delta({ reasoningContent: `第 ${turn} 轮思考` })
            if (turn === 2) delta({ content: ' \n ' })
            if (turn === 1)
              return tool('ctx_execute', {
                language: 'javascript',
                code: 'console.log("context-mode-real-execution")'
              })
            if (turn === 2)
              return tool('ask_user', { question: '结果需要什么格式？', options: ['文本', '表格'] })
            if (turn === 3)
              return tool('write_file', { path: '结果.txt', content: '一次性结果产物' })
            if (turn === 4) {
              delta({
                content:
                  '**任务已完成**\n\n|项目|状态|\n|---|---|\n|产物|已保存|\n[外部文件](file:///C:/unregistered.txt)\n<script>window.__unsafe=1</script>'
              })
              return { content: '任务已完成', toolCalls: [], finishReason: 'stop' }
            }
            if (turn === 5)
              return tool('run_code', {
                language: 'python',
                artifacts: ['python-result.txt', 'missing.txt'],
                code: 'import os\nfrom pathlib import Path\nPath(os.environ["TABDO_OUTPUT"],"python-result.txt").write_text("python-ok",encoding="utf-8")\nprint("python-ok")'
              })
            if (turn === 6) return tool('mcp_manual_0', {})
            if (turn === 7) {
              delta({ content: '手动引用已完成' })
              return { content: '手动引用已完成', toolCalls: [], finishReason: 'stop' }
            }
            if (turn === 8) return tool('install_skill', { source: agentSkill })
            if (turn === 9)
              return tool('configure_mcp', {
                action: 'add',
                json: JSON.stringify({
                  mcpServers: { via_chat: { name: '对话MCP', command: 'node', args: [mcpServer] } }
                })
              })
            if (turn === 10) {
              delta({ content: '对话安装已完成' })
              return { content: '对话安装已完成', toolCalls: [], finishReason: 'stop' }
            }
            if (turn === 11)
              return tool('write_files', {
                directory: 'desktop',
                files: Array.from({ length: 5 }, (_, index) => ({
                  path: `测试${index + 1}.txt`,
                  content: ''
                }))
              })
            if (turn === 12) {
              const content = '桌面文件已创建\n\n- 测试1.txt\n- 测试2.txt\n\n完成。'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            return tool('run_code', {
              language: 'node',
              code: 'require("fs").writeFileSync(require("path").join(process.env.TABDO_OUTPUT,"long-pid.txt"),String(process.pid));setInterval(()=>{},1000)'
            })
          }
        })
      },
      { agentSkill, mcpServer, desktop }
    )
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((entry: any) => entry.name === 'system')
    )
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'call-ai' }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const page = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    await expect(page.getByRole('heading', { name: '这次需要完成什么？' })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByLabel('任务输入')).toBeEnabled({ timeout: 30_000 })
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))
    expect(Math.abs(size.width - 650)).toBeLessThan(8)
    expect(Math.abs(size.height - 440)).toBeLessThan(8)
    await expect(page.getByText('一次性对话', { exact: true })).toHaveCount(0)
    await expect(page.getByText('临时常驻 · 关闭后销毁', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('权限模式')).toHaveValue('approve')
    await expect(page.getByLabel('AI模型')).not.toHaveValue('')
    await settings.evaluate(async () => {
      const api = window.tabdo.internal
      await api.dbPut('settings-general', {
        ...(await api.dbGet('settings-general')),
        primaryColor: 'custom',
        customColor: '#3867d6'
      })
      await api.updatePrimaryColor('custom', '#3867d6')
    })
    const modelPicker = page.getByLabel('AI模型')
    const composerActions = page.locator('.composer-actions')
    await expect(page.locator('.call-ai > header')).toHaveCount(0)
    await expect(composerActions.getByLabel('AI模型')).toHaveCount(1)
    await expect(composerActions.getByLabel('权限模式')).toHaveCount(1)
    const permissionPicker = composerActions.getByLabel('权限模式')
    await expect(permissionPicker).toHaveAttribute('title', '请求批准')
    await expect(permissionPicker.locator('.permission-icon')).toHaveText('')
    expect(
      await permissionPicker.evaluate((select) => getComputedStyle(select, '::picker-icon').display)
    ).toBe('none')
    const shieldOffset = await permissionPicker.evaluate((select) => {
      const control = select.getBoundingClientRect()
      const shield = select.querySelector('svg')!.getBoundingClientRect()
      return {
        x: Math.abs(control.x + control.width / 2 - shield.x - shield.width / 2),
        y: Math.abs(control.y + control.height / 2 - shield.y - shield.height / 2)
      }
    })
    expect(shieldOffset.x).toBeLessThan(1)
    expect(shieldOffset.y).toBeLessThan(1)
    await permissionPicker.click()
    await expect(permissionPicker.getByRole('option', { name: '请求批准' })).toBeVisible()
    await expect(permissionPicker.getByRole('option', { name: '完全权限' })).toBeVisible()
    await permissionPicker.press('Escape')
    await expect(modelPicker.locator('.model-label')).toHaveText('call-ai-test')
    await modelPicker.click()
    await expect
      .poll(() =>
        modelPicker.evaluate((select) => {
          const picker = getComputedStyle(select, '::picker(select)')
          const arrow = getComputedStyle(select, '::picker-icon')
          return [select.matches(':open'), picker.borderRadius, arrow.color]
        })
      )
      .toEqual([true, '10px', 'rgb(56, 103, 214)'])
    await expect(modelPicker.locator('.model-option').filter({ hasText: '测试提供商' })).toHaveText(
      '测试提供商 - call-ai-test 可识图的测试模型'
    )
    await modelPicker.press('Escape')
    await expect
      .poll(async () => {
        const titlebars = app
          .context()
          .pages()
          .filter((entry) => entry.url().includes('detached-titlebar.html'))
        const icons = await Promise.all(
          titlebars.map((entry) =>
            entry.evaluate(() =>
              document.body.innerText.includes('呼叫AI')
                ? document.querySelector('.plugin-logo')?.getAttribute('src')
                : ''
            )
          )
        )
        return icons.some((src) => src?.startsWith('data:image/png;base64,'))
      })
      .toBe(true)
    const webSearch = page.getByRole('switch', { name: '网页搜索' })
    await expect(webSearch).toHaveAttribute('aria-checked', 'false')
    await expect(webSearch).toHaveAttribute('title', '开启网页搜索')
    await expect(webSearch).toHaveText('')
    await expect(webSearch.locator('svg')).toBeVisible()
    for (const name of ['附件', '引用', '打开结果目录', '发送']) {
      const control = composerActions.getByRole('button', { name, exact: true })
      await expect(control).toHaveText('')
      await expect(control.locator('svg')).toBeVisible()
    }
    for (const width of [520, 650]) {
      await app.evaluate(({ app, webContents }, width) => {
        const view = webContents
          .getAllWebContents()
          .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
        const owner = process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(view.id)
        owner.setContentSize(width, owner.getContentSize()[1])
      }, width)
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => window.innerWidth)) - width))
        .toBeLessThan(8)
      expect(
        await composerActions.evaluate((actions) => {
          const bounds = actions.getBoundingClientRect()
          return [...actions.querySelectorAll(':scope > button, select')].every((element) => {
            const control = element.getBoundingClientRect()
            return control.left >= bounds.left && control.right <= bounds.right + 1
          })
        })
      ).toBe(true)
      if (width === 520)
        await capturePlugin(
          app,
          'http://127.0.0.1:15178',
          testInfo.outputPath('call-ai-narrow.png')
        )
    }
    await expect(page.getByText('Enter 发送', { exact: false })).toHaveCount(0)
    await capturePlugin(app, 'http://127.0.0.1:15178', testInfo.outputPath('call-ai-initial.png'))
    await page.getByLabel('任务输入').fill('测试 context-mode、向用户提问、保存结果')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('请求批准 · ctx_execute', { exact: true })).toBeVisible({
      timeout: 40_000
    })
    const approval = page.getByLabel('请求批准操作')
    const reasoning = page.locator('.message.assistant .reasoning')
    await expect(reasoning).toHaveCount(1)
    await reasoning.locator('summary').click()
    await expect(reasoning.locator('pre')).toHaveText('第 1 轮思考')
    const codeBounds = (await approval.locator('pre').boundingBox())!
    const buttonBounds = (await approval
      .getByRole('button', { name: '批准本次操作' })
      .boundingBox())!
    expect(buttonBounds.y - codeBounds.y - codeBounds.height).toBeGreaterThan(20)
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('结果需要什么格式？', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '文本', exact: true }).click()
    await expect(page.getByText('请求批准 · write_file', { exact: true })).toBeVisible()
    await expect(reasoning).toHaveCount(1)
    await expect(reasoning).toHaveAttribute('open', '')
    await expect(reasoning.locator('pre')).toHaveText('第 1 轮思考\n\n第 2 轮思考\n\n第 3 轮思考')
    await reasoning.locator('summary').click()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('任务已完成', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    const bubble = (await page.locator('.message.user .plain').boundingBox())!
    const assistant = (await page.locator('.message.assistant').last().boundingBox())!
    expect(bubble.x - assistant.x).toBeGreaterThan(30)
    expect(Math.abs(bubble.x + bubble.width - assistant.x - assistant.width)).toBeLessThan(2)
    expect(await page.evaluate(() => (window as any).__unsafe)).toBeUndefined()
    const evidence = await app.evaluate(({ app, webContents }) => {
      const load = (file: string): any =>
        process.mainModule!.require(app.getAppPath() + '/src/main/' + file)
      const prompts = (globalThis as any).__callAiPrompts
      const last = prompts[3]
      const owner = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      return {
        runtime: app.getPath('userData') + '/call-ai',
        resident: load('core/temporaryResidency.ts').isTemporaryResident(owner),
        messages: last.messages,
        tools: last.tools.map((tool: any) => tool.function.name),
        owner: owner.id
      }
    })
    expect(evidence.resident).toBe(true)
    expect(evidence.tools).toEqual(
      expect.arrayContaining([
        'ctx_execute',
        'ctx_index',
        'ctx_search',
        'install_skill',
        'install_mcp',
        'configure_mcp'
      ])
    )
    expect(evidence.tools).not.toContain('ctx_resume')
    expect(evidence.tools).not.toContain('web_search')
    expect(evidence.tools).not.toContain('web_fetch')
    expect(JSON.stringify(evidence.messages)).toContain('context-mode-real-execution')
    expect(JSON.stringify(evidence.messages)).toContain('测试规则')
    expect(JSON.stringify(evidence.messages)).toContain('mcp-packages')
    expect(JSON.stringify(evidence.messages)).not.toContain('SKILL_MANUAL_ONLY_SENTINEL')
    await expect(fs.stat(manualStarted)).rejects.toThrow()
    const directories = await fs.readdir(path.join(temporary, 'outputs'))
    expect(directories[0]).toMatch(/^Call_AI-/)
    const artifact = path.join(temporary, 'outputs', directories[0], '结果.txt')
    expect(await fs.readFile(artifact, 'utf8')).toBe('一次性结果产物')
    const artifactLink = page.getByRole('link', { name: '结果.txt', exact: true })
    await expect(artifactLink).toHaveAttribute('title', artifact)
    await artifactLink.focus()
    await artifactLink.press('Enter')
    const reveal = page.getByRole('button', { name: '在文件夹中显示 结果.txt', exact: true })
    await expect(reveal).toHaveAttribute('title', '在文件夹中显示')
    await expect(reveal).toHaveText('')
    await expect(reveal.locator('svg')).toBeVisible()
    await reveal.click()
    await expect(page.getByText('外部文件', { exact: true })).not.toHaveAttribute('href')
    expect(
      await page.evaluate(
        (id) =>
          window.tabdo.internal
            .callAi('artifact', { id, action: 'open' })
            .catch((error) => error.message),
        artifact
      )
    ).toContain('产物链接无效')
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__callAiArtifactActions))
      .toEqual([
        { action: 'open', target: artifact },
        { action: 'reveal', target: artifact }
      ])
    await page.getByLabel('任务输入').fill('/')
    await page.getByRole('button', { name: '手动Skill Skill', exact: true }).click()
    await page.getByLabel('任务输入').fill('/')
    const manualMcp = page.getByRole('button', { name: '手动MCP MCP', exact: true })
    await expect(manualMcp).toBeDisabled()
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'true')
    await manualMcp.click()
    await page.getByLabel('任务输入').fill('使用本轮手动引用并运行Python')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('请求批准 · 连接 MCP：手动MCP', { exact: true })).toBeVisible()
    await expect(fs.stat(manualStarted)).rejects.toThrow()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('请求批准 · run_code', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('请求批准 · mcp_manual_0', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('手动引用已完成', { exact: true })).toBeVisible()
    expect(await fs.readFile(path.join(path.dirname(artifact), 'python-result.txt'), 'utf8')).toBe(
      'python-ok'
    )
    await expect(page.getByRole('link', { name: 'python-result.txt', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'missing.txt', exact: true })).toHaveCount(0)
    expect(await fs.readFile(manualStarted, 'utf8')).toBe('started')
    expect(
      await app.evaluate(() => JSON.stringify((globalThis as any).__callAiPrompts[4].messages))
    ).toContain('SKILL_MANUAL_ONLY_SENTINEL')
    const genericTools = await app.evaluate(() => (globalThis as any).__callAiPrompts[4].tools)
    expect(
      genericTools.find(({ function: tool }) => tool.name === 'web_search').function.description
    ).toContain('Brave Search')
    expect(genericTools.some(({ function: tool }) => tool.name === 'web_fetch')).toBe(true)
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-conversation.png')
    )
    await page.getByLabel('任务输入').fill('安装这个 Skill 并配置这个 MCP')
    await page.getByRole('button', { name: '发送' }).click()
    for (const action of ['install_skill', 'configure_mcp']) {
      await expect(page.getByText(`请求批准 · ${action}`, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '批准本次操作' }).click()
    }
    await expect(page.getByText('对话安装已完成', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await page.getByLabel('任务输入').fill('/')
    await expect(page.getByRole('button', { name: '对话Skill Skill', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '对话MCP MCP', exact: true })).toBeVisible()
    await settings.getByRole('button', { name: '刷新 Skill' }).click()
    await expect(settings.getByRole('switch', { name: '启用 对话Skill' })).toBeVisible()
    await expect(settings.getByRole('switch', { name: '启用 对话MCP' })).toBeVisible()
    await settings.getByText('对话Skill', { exact: true }).click()
    await expect(settings.getByText('此 Skill 未声明描述。', { exact: true })).toBeVisible()
    await settings.getByRole('switch', { name: '启用 对话Skill' }).click()
    await expect(page.getByRole('button', { name: '对话Skill Skill', exact: true })).toHaveCount(0)
    await page.getByLabel('选择附件文件').setInputFiles(picture)
    await expect(page.getByRole('button', { name: '附件图片.png ×' })).toBeVisible()
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.type = 'file'
      input.id = 'call-ai-test-drop'
      document.body.append(input)
    })
    await page.locator('#call-ai-test-drop').setInputFiles(draggedFile)
    await page.evaluate(() => {
      const source = window.document.querySelector<HTMLInputElement>('#call-ai-test-drop')!
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(source.files![0])
      const target = window.document.querySelector('[data-testid="call-ai"]')!
      target.dispatchEvent(
        new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true })
      )
      target.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
      source.remove()
    })
    await expect(page.getByRole('button', { name: '拖入的资料.txt ×' })).toBeVisible()
    await page
      .getByRole('combobox', { name: 'AI模型' })
      .selectOption({ label: 'DeepSeek - deepseek-flash' })
    await expect(modelPicker.locator('.model-label')).toHaveText('deepseek-flash')
    await page.getByLabel('任务输入').fill('参考附件，在桌面新建五个空白 txt')
    await page.getByRole('button', { name: '发送' }).click()
    const batch = page.getByLabel('请求批准操作')
    await expect(batch.getByText('请求批准 · write_files', { exact: true })).toBeVisible()
    await expect(batch.locator('pre')).toContainText('测试5.txt')
    expect(await fs.readdir(desktop)).toEqual(['原有文件.txt'])
    await batch.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('桌面文件已创建', { exact: true })).toBeVisible()
    await expect(page.getByLabel('请求批准操作')).toHaveCount(0)
    for (let index = 1; index <= 5; index++) {
      expect((await fs.stat(path.join(desktop, `测试${index}.txt`))).size).toBe(0)
      await expect(
        page.getByRole('link', { name: `测试${index}.txt`, exact: true })
      ).toHaveAttribute('title', path.join(desktop, `测试${index}.txt`))
    }
    expect(await fs.readFile(path.join(desktop, '原有文件.txt'), 'utf8')).toBe('keep')
    const sent = await app.evaluate(() => (globalThis as any).__callAiPrompts[10])
    expect(JSON.stringify(sent)).toContain('data:image/png;base64,')
    expect(JSON.stringify(sent)).toContain('拖入的资料.txt')
    expect(
      sent.tools.find(({ function: tool }) => tool.name === 'web_search').function.description
    ).toContain('DeepSeek Search')
    expect(
      sent.tools.find(({ function: tool }) => tool.name === 'web_fetch').function.description
    ).toContain('DeepSeek Fetch')
    expect(JSON.stringify(sent)).not.toContain('fixture-deepseek-key')
    expect(JSON.stringify(sent)).not.toContain('fixture-search-key')
    expect(
      await page
        .locator('.markdown ul')
        .last()
        .evaluate((list) => parseFloat(getComputedStyle(list).paddingInlineStart))
    ).toBeGreaterThan(15)
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-batch-markdown.png')
    )
    await expect(webSearch).toBeEnabled()
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'false')
    await page.getByLabel('任务输入').fill('验证关闭网页搜索')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('本轮网页工具仍关闭', { exact: true })).toBeVisible()
    expect(await app.evaluate(() => (globalThis as any).__callAiWebRequests.length)).toBe(0)
    // 原会话内重新开启，下一轮应重新注册 Search 和 Fetch。
    await expect(webSearch).toBeEnabled()
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'true')
    await page.getByLabel('任务输入').fill('验证网页检索恢复')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('检索已恢复并完成超过四十次往返', { exact: true })).toBeVisible()
    await expect(page.getByLabel('请求批准操作')).toHaveCount(0)
    await expect(page.locator('.error')).toHaveCount(0)
    const webRequests = await app.evaluate(() => (globalThis as any).__callAiWebRequests)
    expect(webRequests).toHaveLength(40)
    expect(webRequests[0]).toEqual({
      url: 'https://api.deepseek.com/v1/tools/search',
      body: { query: '网页检索夹具', count: 8, need_content: false },
      auth: 'Bearer fixture-deepseek-key'
    })
    expect(webRequests[2].url).toBe('https://api.deepseek.com/v1/tools/fetch')
    // 捕获原生菜单并验证操作发送到当前正文，测试不改写系统剪贴板。
    await app.evaluate(({ Menu, webContents }, id) => {
      const owner = webContents.fromId(id)!
      const actions: string[] = []
      ;(globalThis as any).__callAiMenuActions = actions
      const popup = Menu.prototype.popup
      const { copy, paste } = owner
      // 模拟剪贴板有可粘贴内容，同时保留真实右键事件。
      const exposePaste = (_event: Electron.Event, params: Electron.ContextMenuParams): void => {
        if (params.isEditable) params.editFlags.canPaste = true
      }
      owner.prependListener('context-menu', exposePaste)
      ;(globalThis as any).__restoreCallAiMenu = () => {
        Menu.prototype.popup = popup
        owner.removeListener('context-menu', exposePaste)
        owner.copy = copy
        owner.paste = paste
      }
      owner.copy = () => {
        actions.push('复制')
      }
      owner.paste = () => {
        actions.push('粘贴')
      }
      Menu.prototype.popup = function () {
        for (const item of this.items) item.click()
      }
    }, evidence.owner)
    const resultText = page.getByText('检索已恢复并完成超过四十次往返', { exact: true })
    await resultText.evaluate((element) => {
      const selection = window.getSelection()!
      selection.selectAllChildren(element)
    })
    await resultText.click({ button: 'right' })
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__callAiMenuActions))
      .toEqual(['复制'])
    await page.getByLabel('任务输入').click({ button: 'right' })
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__callAiMenuActions))
      .toEqual(['复制', '粘贴'])
    await app.evaluate(() => (globalThis as any).__restoreCallAiMenu())
    await webSearch.click()
    await page.getByLabel('任务输入').fill('验证类似命令复用')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(approval.locator('pre')).toContainText('相同的参数')
    await approval.getByRole('button', { name: '允许类似命令' }).click()
    await expect(approval.locator('pre')).toContainText('不同的参数')
    await approval.getByRole('button', { name: '拒绝', exact: true }).click()
    await expect(page.getByText('类似命令验证完成', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await page.getByLabel('任务输入').fill('验证类似命令跨轮')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('类似命令验证完成', { exact: true })).toHaveCount(2)
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await page.getByLabel('任务输入').fill('启动长命令以验证关闭清理')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('请求批准 · run_code', { exact: true })).toBeVisible()
    const disabledTools = await app.evaluate(() => (globalThis as any).__callAiPrompts[12].tools)
    expect(
      disabledTools.some(({ function: tool }) => ['web_fetch', 'web_search'].includes(tool.name))
    ).toBe(false)
    await page.getByRole('button', { name: '批准本次操作' }).click()
    const pidFile = path.join(path.dirname(artifact), 'long-pid.txt')
    await expect.poll(async () => Boolean(await fs.stat(pidFile).catch(() => null))).toBe(true)
    const pid = Number(await fs.readFile(pidFile, 'utf8'))
    await app.evaluate(
      ({ app }, ownerId) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(ownerId)
          .close(),
      evidence.owner
    )
    await expect
      .poll(async () => (await fs.readdir(path.join(evidence.runtime, 'sessions'))).length)
      .toBe(0)
    expect(await fs.readFile(artifact, 'utf8')).toBe('一次性结果产物')
    await expect.poll(() => page.isClosed()).toBe(true)
    expect(() => process.kill(pid, 0)).toThrow()
    // 重新打开得到全新正文和空聊天，权限恢复上一次的选择。
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'call-ai' }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((entry) => entry.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const reopened = app
      .context()
      .pages()
      .find((entry) => entry.url().startsWith('http://127.0.0.1:15178'))!
    await expect(reopened.getByRole('heading', { name: '这次需要完成什么？' })).toBeVisible()
    await expect(reopened.getByLabel('权限模式')).toHaveValue('approve')
    await expect(reopened.locator('.message')).toHaveCount(0)
    await expect(reopened.locator('.attachments button')).toHaveCount(0)
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'over',
          param: { type: 'over', payload: 'SELECTED_TEXT_SENTINEL' }
        }),
      plugin
    )
    await expect(reopened.locator('.attachments button')).toHaveAttribute(
      'title',
      'SELECTED_TEXT_SENTINEL'
    )
    await main.evaluate(
      ({ plugin, file }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'files',
          param: { type: 'files', payload: [{ path: file, name: '结果.txt' }] }
        }),
      { plugin, file: artifact }
    )
    await expect(reopened.locator('.attachments button')).toHaveAttribute('title', artifact)
    await main.evaluate(
      ({ plugin, folder }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'window',
          param: {
            type: 'window',
            payload: { path: folder, app: 'test.exe', className: 'TestWindow' }
          }
        }),
      { plugin, folder: temporary }
    )
    await expect(reopened.locator('.attachments button')).toHaveAttribute('title', temporary)
    await expect(reopened.locator('.message')).toHaveCount(0)
    const clipboardContent = {
      type: 'image',
      image: 'data:image/png;base64,' + (await fs.readFile(picture)).toString('base64')
    }
    // 从超级面板搜索入口取得图片匹配，再走同一面板的实际启动路由。
    const matchedType = await app.evaluate(
      async ({ ipcMain, webContents }, { url, clipboardContent }) => {
        const mainView = webContents.getAllWebContents().find((view) => view.getURL() === url)!
        const result = new Promise<any>((resolve) => {
          ipcMain.once('super-panel-search-result', (_event, data) => resolve(data))
        })
        mainView.send('super-panel-search', { text: '', clipboardContent })
        const { results } = await result
        const command = results.find((entry: any) => entry.featureCode === 'call-ai')
        if (command) mainView.send('super-panel-launch', { command, clipboardContent })
        return command?.cmdType
      },
      { url: main.url(), clipboardContent }
    )
    expect(matchedType).toBe('img')
    await expect(reopened.getByRole('button', { name: '选中图片 ×' })).toBeVisible()
    await expect(reopened.locator('.message')).toHaveCount(0)
    await reopened.getByRole('button', { name: '发送' }).click()
    await expect(reopened.getByText('已收到匹配图片', { exact: true })).toBeVisible()
    await expect(reopened.locator('.message.user')).toContainText('选中图片')
    await expect(reopened.locator('.message.user')).not.toContainText('data:image')
    await reopened.getByLabel('任务输入').fill('验证类似命令未跨窗口')
    await reopened.getByRole('button', { name: '发送' }).click()
    const newApproval = reopened.getByLabel('请求批准操作')
    await expect(newApproval.locator('pre')).toContainText('相同的参数')
    await newApproval.getByRole('button', { name: '批准本次操作' }).click()
    await expect(reopened.getByText('类似命令验证完成', { exact: true })).toBeVisible()
    await expect(reopened.getByLabel('权限模式')).toBeEnabled()
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any
    })
    await reopened.getByLabel('权限模式').selectOption('full')
    await expect(reopened.getByLabel('权限模式')).toHaveAttribute('title', '完全权限')
    await expect(reopened.locator('.permission-icon')).toHaveCSS('color', 'rgb(201, 48, 59)')
    await reopened.getByLabel('任务输入').fill('验证完全权限关闭网页')
    await reopened.getByRole('button', { name: '发送' }).click()
    await expect(reopened.getByText('本轮网页工具仍关闭', { exact: true })).toBeVisible()
    expect(await app.evaluate(() => (globalThis as any).__callAiWebRequests.length)).toBe(40)
    await app.evaluate(({ app, webContents }) => {
      const owner = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(owner.id)
        .close()
    })
    await expect.poll(() => reopened.isClosed()).toBe(true)
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'call-ai' }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((entry) => entry.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const restored = app
      .context()
      .pages()
      .find((entry) => entry.url().startsWith('http://127.0.0.1:15178'))!
    await expect(restored.getByLabel('权限模式')).toHaveValue('full')
    await expect(restored.getByLabel('权限模式')).toHaveAttribute('title', '完全权限')
    await expect(restored.locator('.permission-icon')).toHaveCSS('color', 'rgb(201, 48, 59)')
    await expect(restored.getByRole('switch', { name: '网页搜索' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await app.evaluate(({ app, webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(view.id)
        .close()
    })
    await expect.poll(() => restored.isClosed()).toBe(true)
    const unrelated = path.join(temporary, 'outputs', '用户自有文件.txt')
    await fs.writeFile(unrelated, 'preserve')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as any
    })
    await settings.getByRole('button', { name: '一键清理', exact: true }).click()
    expect(await fs.readFile(artifact, 'utf8')).toBe('一次性结果产物')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any
    })
    await settings.getByRole('button', { name: '一键清理', exact: true }).click()
    await expect.poll(async () => Boolean(await fs.stat(artifact).catch(() => null))).toBe(false)
    expect(await fs.readFile(unrelated, 'utf8')).toBe('preserve')
    expect((await fs.stat(path.join(desktop, '测试5.txt'))).size).toBe(0)
  } finally {
    if (application) await application.close().catch(() => {})
    await fs.writeFile(testInfo.outputPath('call-ai-host.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
