const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')

/**
 * 验证本地归档目标，防止递归移动越过工作区或穿过外部目录链接。
 * @param {string} root 项目根目录。
 * @param {string} target 待读写或移动的路径。
 * @returns {string} 验证后的绝对路径。
 * @throws {Error} 目标越界、等于根目录或已有父级链接指向外部时抛出。
 */
function workspacePath(root, target) {
  const base = fs.realpathSync(root)
  const resolved = path.resolve(target)
  const relative = path.relative(base, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Unsafe workspace path: ' + resolved)
  let parent = resolved
  while (!fs.existsSync(parent)) parent = path.dirname(parent)
  const physical = fs.realpathSync(parent)
  const physicalRelative = path.relative(base, physical)
  if (physicalRelative.startsWith('..') || path.isAbsolute(physicalRelative))
    throw new Error('Workspace path crosses an external link: ' + resolved)
  return resolved
}

/**
 * 对文件树生成内容指纹，保留链接本身而不读取链接外部的用户数据。
 * @param {string} directory 需要快照的目录。
 * @param {string} prefix 相对路径前缀。
 * @returns {Object<string, string>} 文件与链接的内容指纹。
 */
function snapshot(directory, prefix = '') {
  const result = {}
  if (!fs.existsSync(directory)) return result
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    const relative = prefix + entry.name
    if (entry.isSymbolicLink()) result[relative] = 'link:' + fs.readlinkSync(absolute)
    else if (entry.isDirectory()) Object.assign(result, snapshot(absolute, relative + '/'))
    else if (entry.isFile())
      result[relative] = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
  }
  return result
}

/**
 * 在工作区内移动一个完整目标，已存在的归档不覆盖，移动前校验两个绝对路径。
 * @param {string} root 项目根目录。
 * @param {string} source 来源路径。
 * @param {string} destination 归档路径。
 * @returns {void} 无返回值。
 * @throws {Error} 路径越界、来源为链接或目标已经存在时抛出。
 */
function moveWithinWorkspace(root, source, destination) {
  workspacePath(root, source)
  workspacePath(root, destination)
  if (fs.lstatSync(source).isSymbolicLink())
    throw new Error('Refusing to move a root link: ' + source)
  if (fs.existsSync(destination)) throw new Error('Archive already exists: ' + destination)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.renameSync(source, destination)
}

/**
 * 迁移旧根目录预览和临时材料，保留每个来源的对应位置，不删除历史证据。
 * @param {string} root 项目根目录。
 * @returns {Object[]} 本次移动的来源与目标清单。
 * @throws {Error} 存在冲突、越界路径或无法移动的文件时抛出。
 */
function organize(root) {
  const moves = []
  const batch = new Date().toISOString().replace(/[:.]/g, '-')
  const oldEntries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith('_'))
  // 活跃预览迁移到固定位置，其余旧版本、数据和一次性脚本只进入私有归档。
  for (const entry of oldEntries) {
    const source = path.join(root, entry.name)
    let relative
    if (entry.name === '_portable-preview') relative = '.local/portable-preview'
    else if (entry.name === '_preview-data') relative = '.local/source-preview-data'
    else if (entry.name === '_preview-legacy') relative = '.local/source-preview-legacy'
    else if (entry.name.startsWith('_preview-') && entry.isDirectory())
      relative = '.artifacts/backups/preview-sync/' + entry.name
    else if (/\.log(?:\..*)?$/.test(entry.name))
      relative = '.artifacts/history/' + batch + '/logs/' + entry.name
    else if (/\.(?:cjs|mjs|js|ps1)$/.test(entry.name))
      relative = '.artifacts/history/' + batch + '/scripts/' + entry.name
    else if (/\.zip$/.test(entry.name)) relative = '.artifacts/downloads/' + entry.name
    else relative = '.artifacts/history/' + batch + '/other/' + entry.name
    const destination = path.join(root, relative)
    moveWithinWorkspace(root, source, destination)
    moves.push({ from: entry.name, to: relative.replaceAll('\\', '/') })
  }
  if (moves.length) {
    const manifest = workspacePath(root, path.join(root, '.artifacts/history', batch, 'moves.json'))
    fs.mkdirSync(path.dirname(manifest), { recursive: true })
    fs.writeFileSync(
      manifest,
      JSON.stringify({ createdAt: new Date().toISOString(), moves }, null, 2) + '\n'
    )
  }
  return moves
}

/**
 * 收集受维护目录中的源码与测试，跳过构建、依赖及供应商副本。
 * @param {string} root 项目根目录。
 * @param {string} relative 当前目录。
 * @returns {string[]} 按路径排序的文件清单。
 */
function listFiles(root, relative) {
  const directory = path.join(root, relative)
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isSymbolicLink() || ['node_modules', 'dist', 'vendor', '.git'].includes(entry.name))
        return []
      const file = relative + '/' + entry.name
      return entry.isDirectory() ? listFiles(root, file) : [file]
    })
    .sort()
}

/**
 * 按仓库属性统一维护文本的换行符，只转换 CRLF，不改第三方副本或二进制内容。
 * @param {string} root 项目根目录。
 * @returns {number} 本轮换行符发生转换的文件数量。
 */
function normalizeLineEndings(root) {
  const files = [
    'src',
    'internal-plugins',
    'scripts',
    'tests',
    'docs',
    '.github',
    '.githooks'
  ].flatMap((folder) => listFiles(root, folder))
  files.push(
    ...fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  )
  let count = 0
  for (const file of files) {
    if (
      !/\.(?:ts|tsx|vue|js|cjs|mjs|json|md|ya?ml|sh|bat)$/.test(file) &&
      !file.startsWith('.githooks/') &&
      !['.gitignore', '.prettierignore', '.gitattributes', '.editorconfig', '.gitmodules'].includes(
        file
      )
    )
      continue
    const absolute = path.join(root, file)
    const content = fs.readFileSync(absolute, 'utf8')
    if (!content.includes('\r\n')) continue
    fs.writeFileSync(absolute, content.replaceAll('\r\n', '\n'))
    count++
  }
  return count
}

/**
 * 校验并读取结构化变更记录，记录中的测试状态只能来自实际执行或明确的历史证据。
 * @param {string} root 项目根目录。
 * @returns {Object[]} 按文件名排序的变更记录。
 * @throws {Error} 记录字段缺失或引用的测试文件不存在时抛出。
 */
function readEntries(root) {
  return listFiles(root, 'docs/history/entries')
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const entry = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
      if (
        !entry.id ||
        !entry.date ||
        !entry.summary ||
        !Array.isArray(entry.changes) ||
        !Array.isArray(entry.checks)
      )
        throw new Error('Incomplete maintenance entry: ' + file)
      for (const test of entry.tests || [])
        if (!fs.existsSync(path.join(root, test))) throw new Error('Missing recorded test: ' + test)
      return { ...entry, file }
    })
}

/**
 * 生成目录与全量测试索引、变更索引和故障台账，不把本地数据或日志内容写入可提交文档。
 * @param {string} root 项目根目录。
 * @returns {Object<string, string>} 生成文档的相对路径和内容。
 */
function renderIndexes(root) {
  const entries = readEntries(root)
  const tests = listFiles(root, 'tests').filter((file) => /\.(?:test|spec)\.ts$/.test(file))
  const groups = JSON.parse(
    fs.readFileSync(path.join(root, 'tests/regressions/suites.json'), 'utf8')
  )
  const bugs = JSON.parse(fs.readFileSync(path.join(root, 'docs/history/bugs.json'), 'utf8'))
  const lines = [
    '# 项目与测试索引',
    '',
    '> 由 `pnpm maintain` 自动生成；职责与规则见 [维护必读](../maintenance.md)。',
    '',
    '## 稳定目录',
    ''
  ]
  const roles = {
    src: 'Electron 宿主、预加载和主渲染器',
    'internal-plugins': '随包设置与工具插件',
    resources: '运行时脚本、原生二进制与许可',
    scripts: '开发、维护、预览、验证及发布辅助入口',
    tests: '单测、源码 Electron E2E、回归集',
    docs: '架构、规范、变更与问题记录',
    build: '安装器与云端打包钩子',
    '.local': '本机活跃预览和数据，不提交',
    '.artifacts': '本机测试证据、历史材料和回退备份，不提交'
  }
  for (const [folder, role] of Object.entries(roles)) lines.push(`- \`${folder}/\`：${role}。`)
  lines.push(
    '',
    '## 自动化测试文件',
    '',
    `共 ${tests.length} 个文件；文件数不等于用例数，通过状态以每轮变更记录为准。`,
    ''
  )
  for (const folder of ['tests/main', 'tests/renderer', 'tests/scripts', 'tests/e2e']) {
    const files = tests.filter((file) => file.startsWith(folder + '/'))
    lines.push(`### ${folder}（${files.length}）`, '')
    for (const file of files) lines.push(`- [${file}](../../${file})`)
    lines.push('')
  }
  lines.push('## 历史回归分组', '')
  for (const [name, group] of Object.entries(groups))
    lines.push(
      `- \`${name}\`：${group.unit.length} 个单测文件、${group.e2e.length} 个源码 E2E 文件。`
    )
  const history = ['# 变更索引', '', '> 自动生成；原始记录在 [entries](../history/entries/)。', '']
  for (const entry of [...entries].reverse())
    history.push(
      `## ${entry.date} · ${entry.summary}`,
      '',
      `记录：[${entry.id}](../../${entry.file})；版本：${entry.version || '未发布'}。`,
      '',
      ...entry.changes.map((change) => '- ' + change),
      '',
      ...entry.checks.map((check) => `- 验证：${check}`),
      ''
    )
  const issues = [
    '# Bug 与待验收边界',
    '',
    '> 自动生成；状态只描述已有证据，不以加入测试清单替代实际验证。',
    ''
  ]
  for (const bug of bugs)
    issues.push(
      `## ${bug.id} · ${bug.title}`,
      '',
      `状态：${bug.status}。`,
      '',
      `原因：${bug.cause}`,
      '',
      `处理：${bug.fix}`,
      '',
      `回归：${(bug.cases || []).join('、') || '见记录'}；${bug.coverage}`,
      ''
    )
  return {
    'docs/generated/PROJECT_INDEX.md': lines.join('\n').trimEnd() + '\n',
    'docs/generated/CHANGES.md': history.join('\n').trimEnd() + '\n',
    'docs/generated/BUGS.md': issues.join('\n').trimEnd() + '\n'
  }
}

/**
 * 生成维护文档或只读核验其新鲜度，并检查回归集引用是否完整。
 * @param {string} root 项目根目录。
 * @param {boolean} checkOnly 只读模式下禁止自动修复文档。
 * @returns {string[]} 本轮需要更新的生成文档。
 * @throws {Error} 索引过期、回归引用不存在或根目录遗留临时材料时抛出。
 */
function prepare(root, checkOnly = false) {
  if (!checkOnly) {
    organize(root)
    normalizeLineEndings(root)
  }
  const indexes = renderIndexes(root)
  const changed = []
  for (const [relative, content] of Object.entries(indexes)) {
    const absolute = path.join(root, relative)
    if (fs.existsSync(absolute) && fs.readFileSync(absolute, 'utf8') === content) continue
    changed.push(relative)
    if (!checkOnly) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, content)
    }
  }
  const suites = JSON.parse(
    fs.readFileSync(path.join(root, 'tests/regressions/suites.json'), 'utf8')
  )
  for (const suite of Object.values(suites))
    for (const file of [...suite.unit, ...suite.e2e])
      if (!fs.existsSync(path.join(root, file))) throw new Error('Missing regression file: ' + file)
  if (checkOnly && (changed.length || fs.readdirSync(root).some((file) => file.startsWith('_'))))
    throw new Error(
      'Maintenance index or root layout is stale; run pnpm maintain: ' + changed.join(', ')
    )
  // 即使有人强制暂存被忽略文件，提交和 CI 也不得带出预览、私有备份或原始证据。
  if (fs.existsSync(path.join(root, '.git'))) {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split(
      '\0'
    )
    if (
      tracked.some((file) => /^(?:\.local|\.artifacts|test-results|playwright-report)\//.test(file))
    )
      throw new Error('Private preview data or test artifacts are tracked by Git')
  }
  return changed
}

/**
 * 提交前自动整理并暂存生成索引，要求本轮有可审阅的变更记录。
 * @param {string} root 项目根目录。
 * @returns {void} 无返回值。
 * @throws {Error} 暂存修改没有对应变更记录或 Git 操作失败时抛出。
 */
function prepareCommit(root) {
  prepare(root)
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], {
    cwd: root,
    encoding: 'utf8'
  })
    .split('\0')
    .filter(Boolean)
  if (staged.some((file) => /^(?:\.local|\.artifacts|test-results|playwright-report)\//.test(file)))
    throw new Error('Private preview data or test artifacts must not be committed')
  if (!staged.some((file) => /^docs\/history\/entries\/.+\.json$/.test(file)))
    throw new Error(
      '本次提交必须新增或更新 docs/history/entries/*.json，记录修改、Bug、测试和预览状态。'
    )
  execFileSync('git', ['add', '--', ...Object.keys(renderIndexes(root))], { cwd: root })
}

module.exports = {
  workspacePath,
  snapshot,
  moveWithinWorkspace,
  organize,
  listFiles,
  normalizeLineEndings,
  readEntries,
  renderIndexes,
  prepare,
  prepareCommit
}

if (require.main === module) {
  try {
    const command = process.argv[2] || 'prepare'
    if (command === 'commit') prepareCommit(projectRoot)
    else if (command === 'prepare' || command === 'check') {
      const changed = prepare(projectRoot, command === 'check')
      console.log(JSON.stringify({ maintenance: command, generatedFiles: changed.length }))
    } else throw new Error('Usage: node scripts/project-maintenance.cjs [prepare|check|commit]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
