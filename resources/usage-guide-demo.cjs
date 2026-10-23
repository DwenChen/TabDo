const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

/**
 * 检查接口只能在本次隔离引导中使用，拒绝正式运行或没有所有权标记的目录。
 * @returns {string} 已核验的桌面练习目录。
 * @throws {Error} 当前不是隔离引导或目录身份无效时抛出。
 */
function workspace() {
  if (process.env.TABDO_USAGE_GUIDE !== '1') throw new Error('教学接口仅供隔离引导使用')
  const root = process.env.TABDO_GUIDE_WORKSPACE
  if (!root || !path.isAbsolute(root) || fs.lstatSync(root).isSymbolicLink())
    throw new Error('教学目录不可用')
  const owner = JSON.parse(fs.readFileSync(path.join(root, '.tabdo-guide-owner.json'), 'utf8'))
  if (owner.token !== process.env.TABDO_GUIDE_TOKEN) throw new Error('教学目录身份不匹配')
  return root
}

/**
 * 返回固定教学识别结果，或对练习目录提供有界的 Everything 查询协议示例。
 * @param {string} operation 受限操作：ocr、formula、translation 或 search。
 * @param {object} input 教学调用参数；图像只检查存在，不进行真实识别。
 * @returns {object} 明确标注 demo 的结果。
 * @throws {Error} 操作、参数或所有权校验失败时抛出。
 */
function respond(operation, input = {}) {
  const root = workspace()
  if (operation === 'ocr' || operation === 'formula') {
    if (typeof input.image !== 'string' || !input.image) throw new Error('请先放入练习图片')
    return operation === 'formula'
      ? { demo: true, text: '\\sum_{k=1}^{n}k=\\frac{n(n+1)}{2}' }
      : {
          demo: true,
          text: 'TabDo 教学演示\nHello TabDo\n这是后台接口返回的固定练习结果。',
          blocks: [{ text: 'Hello TabDo', left: 80, top: 160, right: 330, bottom: 205 }]
        }
  }
  if (operation === 'translation') return { demo: true, text: 'Teaching demo: Hello, TabDo.' }
  if (operation !== 'search') throw new Error('不支持的教学接口')
  const query = String(input.query || '').slice(0, 2000)
  const extensions = /ext:([a-z0-9;]+)/i.exec(query)?.[1].toLowerCase().split(';')
  const keyword = query
    .replace(/ext:[a-z0-9;]+|folder:/gi, '')
    .trim()
    .toLowerCase()
  const items = []
  let visited = 0
  /**
   * 只枚举本次练习目录，限制深度和条数并跳过链接、所有权标记与临时文件。
   * @param {string} folder 本次目录内部的绝对路径。
   * @param {number} depth 当前深度。
   * @returns {void} 无返回值。
   */
  function visit(folder, depth) {
    if (depth > 4) return
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (++visited > 300) return
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const file = path.join(folder, entry.name),
        stat = fs.lstatSync(file)
      if (stat.isSymbolicLink()) continue
      const isDirectory = stat.isDirectory()
      if (
        (!extensions || extensions.includes(path.extname(file).slice(1).toLowerCase())) &&
        (!query.includes('folder:') || isDirectory) &&
        (!keyword || entry.name.toLowerCase().includes(keyword))
      )
        items.push({
          name: entry.name,
          path: file,
          isDirectory,
          size: stat.size,
          modified: stat.mtimeMs
        })
      if (isDirectory) visit(file, depth + 1)
    }
  }
  visit(root, 0)
  const sort = Number(input.sort)
  items.sort((a, b) =>
    sort === 13 || sort === 14
      ? (a.modified - b.modified) * (sort === 14 ? -1 : 1)
      : a.name.localeCompare(b.name) * (sort === 2 ? -1 : 1)
  )
  const offset = Math.max(0, Math.min(300, Number(input.offset) || 0))
  return {
    demo: true,
    state: 'ready',
    total: items.length,
    items: items.slice(offset, offset + 100)
  }
}

/**
 * 每次调用启动一个短期后台脚本，取消、超时、父连接断开后立即退出，不创建过程文件。
 * @param {string} operation 受控教学操作。
 * @param {object} input 用户界面发起的参数。
 * @param {AbortSignal} signal 调用所属会话的取消信号。
 * @returns {Promise<object>} 等工作进程关闭后交付的演示结果。
 * @throws {Error} 非引导环境、取消、超时或后台失败时拒绝。
 */
async function runDemo(operation, input, signal) {
  workspace()
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    })
    let result,
      failure = '',
      diagnostic = ''
    /**
     * 只停止本次创建的脚本；脚本不创建其他子进程。
     * @returns {void} 无返回值。
     */
    const abort = () => {
      failure = '教学请求已取消'
      child.kill()
    }
    const timeout = setTimeout(abort, 5000)
    signal?.addEventListener('abort', abort, { once: true })
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-2000)
    })
    child.once('error', (error) => {
      failure = error.message
    })
    child.once('message', (message) => {
      result = message.result
      failure = message.error || failure
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (failure || code !== 0 || !result)
        reject(new Error(failure || diagnostic || '教学接口异常退出'))
      else resolve(result)
    })
    // 使用结构化 IPC，不拼接命令或传递图像正文；演示只需要知道是否放入了图片。
    child.send(
      { operation, input: { ...input, ...(input?.image ? { image: 'sample-present' } : {}) } },
      (error) => {
        if (error) {
          failure = error.message
          child.kill()
        }
      }
    )
  })
}

module.exports = { runDemo, respond }
if (require.main === module) {
  process.once('disconnect', () => process.exit(0))
  process.once('message', ({ operation, input }) => {
    let message
    try {
      message = { result: respond(operation, input) }
    } catch (error) {
      message = { error: error.message }
    }
    process.send(message, () => process.disconnect())
  })
}
