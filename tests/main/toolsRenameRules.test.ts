import { describe, expect, it } from 'vitest'
import {
  applyRenameRules,
  createWorkflow,
  normalizeWorkflow,
  newReplaceRule,
  newRemoveRule
} from '../../internal-plugins/system/src/utils/renameRules'

const file = {
  path: 'C:/fixture/My File.txt',
  name: 'My File.txt',
  size: 0,
  mtimeMs: 0,
  birthtimeMs: 0,
  isDirectory: false
}

/**
 * 构造启用后的完整工作流。
 * @param patch 覆盖默认配置的回调。
 * @returns 可直接送入引擎的配置。
 */
function workflow(patch: (config: any) => any = (config: any): any => config): any {
  return patch(createWorkflow())
}

describe('rename workflow previews', () => {
  it('auto numbering replaces the stem and keeps the extension', () => {
    expect(
      applyRenameRules(
        [file],
        workflow((c) => ((c.numbering.enabled = true), c))
      )[0].newName
    ).toBe('001.txt')
    const affixed = workflow((c) => {
      c.numbering.enabled = true
      c.numbering.prefix = 'IMG_'
      c.numbering.suffix = '_x'
      c.numbering.digits = 5
      return c
    })
    expect(applyRenameRules([file], affixed)[0].newName).toBe('IMG_00001_x.txt')
  })

  it('formats numbering as Chinese and alphabet styles', () => {
    const chinese = workflow((c) => {
      c.numbering.enabled = true
      c.numbering.style = 'lowerChinese'
      c.numbering.start = 3
      return c
    })
    expect(applyRenameRules([file], chinese)[0].newName).toBe('三.txt')
    const alpha = workflow((c) => {
      c.numbering.enabled = true
      c.numbering.style = 'upperAlpha'
      c.numbering.start = 27
      return c
    })
    expect(applyRenameRules([file], alpha)[0].newName).toBe('AA.txt')
  })

  it('supports literal and positional replacement modes', () => {
    const literal = workflow((c) => {
      c.replace.enabled = true
      c.replace.rules = [{ ...newReplaceRule(), find: 'My', replace: 'Your' }]
      return c
    })
    expect(applyRenameRules([file], literal)[0].newName).toBe('Your File.txt')
    const head = workflow((c) => {
      c.replace.enabled = true
      c.replace.rules = [{ ...newReplaceRule(), mode: 'head', count: 2, replace: 'X' }]
      return c
    })
    expect(applyRenameRules([file], head)[0].newName).toBe('X File.txt')
    const after = workflow((c) => {
      c.replace.enabled = true
      c.replace.rules = [{ ...newReplaceRule(), mode: 'after', find: ' ', replace: '_tail' }]
      return c
    })
    expect(applyRenameRules([file], after)[0].newName).toBe('My _tail.txt')
  })

  it('replaces the extension only when the extension switch is on', () => {
    const config = workflow((c) => {
      c.replace.enabled = true
      c.replace.rules = [{ ...newReplaceRule(), find: 'txt', replace: 'md' }]
      c.replace.replaceExtension = true
      return c
    })
    expect(applyRenameRules([file], config)[0].newName).toBe('My File.md')
  })

  it('cleans case, illegal characters, extensions and duplicates', () => {
    const snake = workflow((c) => {
      c.clean.enabled = true
      c.clean.case.enabled = true
      c.clean.case.mode = 'snake'
      return c
    })
    expect(applyRenameRules([file], snake)[0].newName).toBe('my_file.txt')
    const sanitize = workflow((c) => {
      c.clean.enabled = true
      c.clean.sanitize.enabled = true
      return c
    })
    expect(applyRenameRules([{ ...file, name: 'My:File.txt' }], sanitize)[0].newName).toBe(
      'My_File.txt'
    )
    const extension = workflow((c) => {
      c.clean.enabled = true
      c.clean.extension.enabled = true
      c.clean.extension.value = '.md'
      return c
    })
    expect(applyRenameRules([file], extension)[0].newName).toBe('My File.md')
  })

  it('removes characters by grapheme cluster without breaking emoji', () => {
    const emoji = workflow((c) => {
      c.clean.enabled = true
      c.clean.remove.enabled = true
      c.clean.remove.rules = [{ ...newRemoveRule(), kind: 'char', char: '😀' }]
      return c
    })
    expect(applyRenameRules([{ ...file, name: '😀文字.txt' }], emoji)[0].newName).toBe('文字.txt')
    const cjk = workflow((c) => {
      c.clean.enabled = true
      c.clean.remove.enabled = true
      c.clean.remove.rules = [{ ...newRemoveRule(), kind: 'type', type: 'cjk' }]
      return c
    })
    expect(applyRenameRules([{ ...file, name: '😀文字.txt' }], cjk)[0].newName).toBe('😀.txt')
  })

  it('inserts text, numbers and file information at the chosen position', () => {
    const start = workflow((c) => {
      c.insert.enabled = true
      c.insert.kind = 'text'
      c.insert.text = 'after_'
      c.insert.position = 'start'
      return c
    })
    expect(applyRenameRules([file], start)[0].newName).toBe('after_My File.txt')
    const index = workflow((c) => {
      c.insert.enabled = true
      c.insert.kind = 'text'
      c.insert.text = 'after_'
      c.insert.position = 'index'
      c.insert.index = 4
      return c
    })
    expect(applyRenameRules([file], index)[0].newName).toBe('My after_File.txt')
    const size = workflow((c) => {
      c.insert.enabled = true
      c.insert.kind = 'info'
      c.insert.info = 'size'
      c.insert.position = 'end'
      return c
    })
    expect(applyRenameRules([{ ...file, size: 2048 }], size)[0].newName).toBe('My File2.0KB.txt')
  })

  it('reports entry-level errors for unreadable information and invalid names', () => {
    const dimensions = workflow((c) => {
      c.insert.enabled = true
      c.insert.kind = 'info'
      c.insert.info = 'dimensions'
      return c
    })
    expect(applyRenameRules([file], dimensions)[0].error).toBeTruthy()
    expect(applyRenameRules([{ ...file, width: 10, height: 20 }], dimensions)[0].newName).toBe(
      '10x20My File.txt'
    )
    const invalid = workflow((c) => {
      c.clean.enabled = true
      c.clean.sanitize.enabled = true
      c.clean.sanitize.mode = 'delete'
      return c
    })
    expect(applyRenameRules([{ ...file, name: '***' }], invalid)[0].error).toBe('文件名无效')
  })

  it('preserves hidden files and directory names', () => {
    const prefix = workflow((c) => {
      c.insert.enabled = true
      c.insert.kind = 'text'
      c.insert.text = 'new'
      c.insert.position = 'start'
      return c
    })
    expect(applyRenameRules([{ ...file, name: '.env' }], prefix)[0].newName).toBe('new.env')
    expect(
      applyRenameRules([{ ...file, isDirectory: true, name: 'folder.name' }], prefix)[0].newName
    ).toBe('newfolder.name')
  })

  it('merges stored settings onto defaults', () => {
    const merged = normalizeWorkflow({ numbering: { enabled: true, start: 5 } })
    expect(merged.numbering.enabled).toBe(true)
    expect(merged.numbering.start).toBe(5)
    expect(merged.numbering.style).toBe('arabic')
    expect(merged.insert.kind).toBe('text')
    expect(Array.isArray(merged.replace.rules)).toBe(true)
  })
})
