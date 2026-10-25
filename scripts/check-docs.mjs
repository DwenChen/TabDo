/* eslint-disable @typescript-eslint/explicit-function-return-type -- 此ESM脚本直接由Node执行，参数与返回类型通过JSDoc声明。 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import ts from 'typescript'

/**
 * 收集当前维护的文档，不将历史记录中的旧路径当作现行入口。
 * @param {string} root 仓库根目录。
 * @returns {string[]} 待检查文档的相对路径。
 */
function documentFiles(root) {
  const files = fs.readdirSync(root).filter((file) => file.endsWith('.md'))
  const docs = path.join(root, 'docs')
  if (fs.existsSync(docs))
    files.push(
      ...fs
        .readdirSync(docs)
        .filter((file) => file.endsWith('.md'))
        .map((file) => `docs/${file}`)
    )
  for (const file of ['tests/README.md', 'tests/regressions/README.md', 'scripts/README.md'])
    if (fs.existsSync(path.join(root, file))) files.push(file)
  return files
}

/**
 * 收集标题和显式HTML锚点，保留重复标题的序号。
 * @param {string} source Markdown正文。
 * @returns {Set<string>} 文档可用的本地锚点。
 */
function documentAnchors(source) {
  const result = new Set()
  const duplicates = new Map()
  marked.walkTokens(marked.lexer(source), (token) => {
    if (token.type !== 'heading') return
    const base = token.text
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-')
    const count = duplicates.get(base) || 0
    result.add(base + (count ? `-${count}` : ''))
    duplicates.set(base, count + 1)
  })
  for (const match of source.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1])
  return result
}

/**
 * 规范化可见文字，允许Markdown排版和自动换行而不改变教程内容。
 * @param {string} text 待比较的可见文字或HTML。
 * @returns {string} 去除标签、解码常用实体及空白后的文字。
 */
function visibleText(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
      if (entity.startsWith('#'))
        return String.fromCodePoint(
          Number.parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10)
        )
      return entities[entity] || match
    })
    .replace(/\s+/g, '')
}

/**
 * 检查本地链接、工具清单和应用内/仓库教程的一致性。
 * @param {string} root 仓库或隔离测试夹具的根目录。
 * @returns {object} 检查数量、清单统计、教程统计及可定位的错误。
 * @throws {Error} 必需文件缺失、JSON无效或教程无法解析时抛错。
 */
export function checkDocumentation(root) {
  const files = documentFiles(root)
  const errors = []
  const anchors = new Map()
  let links = 0
  // 只检查本地目标；外部网址的可达性和语言审校仍由发布前人工核对。
  for (const file of files) {
    marked.walkTokens(marked.lexer(fs.readFileSync(path.join(root, file), 'utf8')), (token) => {
      if (
        !['link', 'image'].includes(token.type) ||
        /^[a-z][a-z\d+.-]*:/i.test(token.href) ||
        token.href.startsWith('//')
      )
        return
      links++
      const [relative, fragment] = token.href.split('#')
      const target = path.resolve(
        root,
        path.dirname(file),
        decodeURIComponent(relative || path.basename(file))
      )
      if (!fs.existsSync(target)) errors.push(`${file}: 本地目标不存在 ${token.href}`)
      else if (fragment && path.extname(target) === '.md') {
        if (!anchors.has(target))
          anchors.set(target, documentAnchors(fs.readFileSync(target, 'utf8')))
        if (!anchors.get(target).has(decodeURIComponent(fragment)))
          errors.push(`${file}: 锚点不存在 ${token.href}`)
      }
    })
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'internal-plugins/system/public/plugin.json'), 'utf8')
  )
  const features = manifest.features
  const counts = {
    features: features.length,
    groups: new Set(features.map((feature) => feature.group)).size,
    ordinary: features.flatMap((feature) =>
      feature.cmds.filter((command) => typeof command === 'string')
    ).length
  }
  const catalog = fs.readFileSync(path.join(root, 'docs/tools-catalog.md'), 'utf8')
  if (
    !catalog.includes(
      `共 ${counts.features} 个功能码、${counts.groups} 个分类、${counts.ordinary} 个普通文字指令`
    )
  )
    errors.push('docs/tools-catalog.md: 统计与plugin.json不一致')
  const table = marked
    .lexer(catalog)
    .find((token) => token.type === 'table' && token.header.some((cell) => cell.text === '功能码'))
  const rows =
    table?.rows.map((row) => ({ group: row[0]?.text, code: row[2]?.text.replaceAll('`', '') })) ||
    []
  if (
    rows.length !== features.length ||
    features.some(
      (feature) =>
        rows.filter((row) => row.code === feature.code && row.group === feature.group).length !== 1
    )
  )
    errors.push('docs/tools-catalog.md: 功能码表或分类与plugin.json不一致')
  const source = fs.readFileSync(
    path.join(root, 'internal-plugins/setting/src/views/UsageGuide/tutorialChapters.ts'),
    'utf8'
  )
  const context = { exports: {} }
  // 教程源只导出静态数据，隔离执行不提供require或进程能力，并限制执行时间。
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    context,
    { timeout: 1000 }
  )
  const chapters = context.exports.tutorialChapters
  const guide = visibleText(
    marked.parse(fs.readFileSync(path.join(root, 'docs/usage-guide.md'), 'utf8'))
  )
  let steps = 0
  for (const chapter of chapters) {
    const paragraphs = [
      chapter.title,
      chapter.intro,
      chapter.figure,
      chapter.prepare,
      chapter.result,
      ...chapter.steps,
      ...chapter.problems.flatMap((problem) => [problem.question, problem.answer])
    ]
    if (paragraphs.some((paragraph) => !guide.includes(visibleText(paragraph))))
      errors.push(`docs/usage-guide.md: ${chapter.id} 与应用内教程不一致`)
    if (
      !fs.existsSync(path.join(root, `internal-plugins/setting/public/tutorial/${chapter.id}.svg`))
    )
      errors.push(`教程插图不存在: ${chapter.id}.svg`)
    steps += chapter.steps.length
  }
  return {
    files: files.length,
    localLinks: links,
    counts,
    chapters: chapters.length,
    steps,
    errors
  }
}

// 命令行只报告可定位结果，失败退出可供推送hook和云端构建阻断后续操作。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkDocumentation(process.cwd())
    console.log(JSON.stringify(result, null, 2))
    if (result.errors.length) process.exitCode = 1
  } catch (error) {
    console.error(`文档检查失败: ${error.message}`)
    process.exitCode = 1
  }
}
