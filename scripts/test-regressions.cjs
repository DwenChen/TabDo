const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const suites = require('../tests/regressions/suites.json')
const root = path.resolve(__dirname, '..')

/**
 * 按历史故障分组选取测试；只列清单时不启动服务或 Electron。
 * @param {string[]} args 分组名与 --list、--unit、--e2e 选项。
 * @returns {number} 测试进程或参数校验的退出码。
 * @throws {Error} 测试清单引用不存在的文件或测试进程无法启动时抛出错误。
 */
function main(args) {
  // 参数错误必须在执行任何测试前停止，避免误启动其他分组。
  const flags = new Set(args.filter((arg) => arg.startsWith('--')))
  const groups = [...new Set(args.filter((arg) => !arg.startsWith('--')))]
  if (
    [...flags].some((flag) => !['--list', '--unit', '--e2e'].includes(flag)) ||
    groups.some((group) => group !== 'all' && !Object.hasOwn(suites, group))
  ) {
    console.error(
      'Usage: pnpm test:regressions [all|' +
        Object.keys(suites).join('|') +
        '] [--list] [--unit|--e2e]'
    )
    return 1
  }
  const selected = groups.length === 0 || groups.includes('all') ? Object.keys(suites) : groups
  const kinds =
    flags.has('--unit') && !flags.has('--e2e')
      ? ['unit']
      : flags.has('--e2e') && !flags.has('--unit')
        ? ['e2e']
        : ['unit', 'e2e']
  const files = { unit: new Set(), e2e: new Set() }
  for (const group of selected) {
    console.log(`[${group}]`)
    for (const kind of kinds) {
      for (const file of suites[group][kind]) {
        if (!fs.existsSync(path.join(root, file)))
          throw new Error('Missing regression test: ' + file)
        files[kind].add(file)
        if (flags.has('--list')) console.log(`  ${kind}: ${file}`)
      }
    }
  }
  console.log(
    `Selected: ${files.unit.size} unit files, ${files.e2e.size} E2E files. Manual cases: tests/regressions/README.md`
  )
  if (flags.has('--list')) return 0

  // 共用文件只执行一次；单测失败时不继续启动原生桌面测试。
  for (const kind of kinds) {
    if (files[kind].size === 0) continue
    const commandArgs = [path.join(__dirname, 'run-tests.cjs'), kind, ...files[kind]]
    const result = spawnSync(process.execPath, commandArgs, {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true
    })
    if (result.error) throw result.error
    if (result.status !== 0) return result.status ?? 1
  }
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
