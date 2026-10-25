import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkDocumentation } from '../../scripts/check-docs.mjs'

let root: string

/**
 * 在当前测试自有目录写入文档或静态数据夹具。
 * @param file 相对夹具路径。
 * @param content UTF-8正文。
 * @returns 无返回值。
 */
function write(file: string, content: string): void {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-docs-check-'))
  write(
    'README.md',
    '# 示例\n\n[教程](docs/usage-guide.md#start)\n[重复标题](#重复-1)\n\n## 重复\n\n## 重复\n'
  )
  write(
    'docs/tools-catalog.md',
    '# 清单\n\n共 1 个功能码、1 个分类、1 个普通文字指令。\n\n| 分类 | 中文名称 | 功能码 | 图标 |\n| --- | --- | --- | --- |\n| 示例 | 示例 | `demo` | demo |\n'
  )
  write(
    'internal-plugins/system/public/plugin.json',
    JSON.stringify({
      features: [{ code: 'demo', group: '示例', cmds: ['示例', { type: 'over' }] }]
    })
  )
  write(
    'internal-plugins/setting/src/views/UsageGuide/tutorialChapters.ts',
    "export const tutorialChapters = [{id:'start',title:'开始',intro:'阅读说明',figure:'操作示意',prepare:'准备内容',steps:['先复制内容','再按 Ctrl+C'],result:'看到结果',problems:[{question:'没有内容？',answer:'重新复制'}]}]"
  )
  write(
    'internal-plugins/setting/public/tutorial/start.svg',
    '<svg xmlns="http://www.w3.org/2000/svg"/>'
  )
  write(
    'docs/usage-guide.md',
    '# 教程\n\n<a id="start"></a>\n\n## 开始\n\n阅读说明\n\n操作示意\n\n准备内容\n\n1. 先复制内容\n2. 再按 `Ctrl+C`\n\n看到结果\n\n**没有内容？** 重新复制\n'
  )
})

afterEach(() => {
  // 验证绝对目标仍属于本测试创建的目录，再递归清理。
  expect(path.resolve(root).startsWith(path.join(os.tmpdir(), 'tabdo-docs-check-'))).toBe(true)
  fs.rmSync(root, { recursive: true, force: true })
})

describe('documentation release gate', () => {
  it('accepts existing anchors, matching catalog and equivalent Markdown formatting', () => {
    expect(checkDocumentation(root)).toMatchObject({
      counts: { features: 1, groups: 1, ordinary: 1 },
      chapters: 1,
      steps: 2,
      errors: []
    })
  })

  it('rejects broken local links and missing anchors', () => {
    write('README.md', '[缺失文件](docs/missing.md)\n[缺失锚点](docs/usage-guide.md#missing)')
    expect(checkDocumentation(root).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('本地目标不存在'),
        expect.stringContaining('锚点不存在')
      ])
    )
  })

  it('rejects a catalog table that hides a changed feature identity or group', () => {
    const file = path.join(root, 'docs/tools-catalog.md')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('`demo`', '`old-demo`'))
    expect(checkDocumentation(root).errors).toContain(
      'docs/tools-catalog.md: 功能码表或分类与plugin.json不一致'
    )
  })

  it('rejects outdated catalog statistics', () => {
    const file = path.join(root, 'docs/tools-catalog.md')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('共 1 个功能码', '共 2 个功能码'))
    expect(checkDocumentation(root).errors).toContain(
      'docs/tools-catalog.md: 统计与plugin.json不一致'
    )
  })

  it('rejects stale tutorial text and missing distributed artwork', () => {
    write('docs/usage-guide.md', '# 开始\n\n旧版教程')
    fs.unlinkSync(path.join(root, 'internal-plugins/setting/public/tutorial/start.svg'))
    expect(checkDocumentation(root).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('与应用内教程不一致'),
        expect.stringContaining('教程插图不存在')
      ])
    )
  })
})
