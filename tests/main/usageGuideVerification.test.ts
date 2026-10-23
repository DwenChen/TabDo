import { describe, expect, it } from 'vitest'
import { GUIDE_STEPS, GUIDE_COPY_TEXT, GUIDE_QR_TEXT } from '../../src/shared/usageGuideSteps'
import {
  verifyGuideStep,
  type GuideEvidence,
  type GuideNoteEvidence
} from '../../src/main/core/usageGuideVerification'

/**
 * 按课程标识验证当前操作的前后真实证据。
 * @param id 步骤标识。
 * @param before 本步开始时的基线。
 * @param after 本步实际结果。
 * @returns 本步是否满足完成条件。
 */
function verifies(id: string, before: GuideEvidence, after: GuideEvidence): boolean {
  return verifyGuideStep(GUIDE_STEPS.find((step) => step.id === id)!, before, after)
}

const clipboardState = {
  activeTab: 'all',
  search: '',
  menu: false,
  items: [GUIDE_COPY_TEXT],
  selected: [] as string[],
  favorites: [] as Array<{ content: string; remark?: string }>
}
const note: GuideNoteEvidence = {
  id: 1,
  text: GUIDE_COPY_TEXT,
  color: '#f3f0bd',
  opacity: 100,
  collapsed: false,
  edge: '',
  optionsOpen: false
}

describe('walkthrough actual completion verification', () => {
  it('waits for saved settings and keeps independent provider switches separate', () => {
    expect(
      verifies(
        'panel',
        {},
        { settings: { superPanelMouseButton: 'middle', superPanelLongPressMs: 0 } }
      )
    ).toBe(false)
    expect(
      verifies(
        'panel',
        {},
        { settings: { superPanelMouseButton: 'middle', superPanelLongPressMs: 300 } }
      )
    ).toBe(true)
    expect(verifies('match', {}, { settings: { clipboardQuickMatchSeconds: '10' } })).toBe(false)
    expect(verifies('match', {}, { settings: { clipboardQuickMatchSeconds: 10 } })).toBe(true)
    const ocrOnly = { providerSettings: { enabled: { ocr: ['builtin-wechat-ocr'] } } }
    expect(verifies('provider-enable', {}, ocrOnly)).toBe(true)
    expect(verifies('provider-formula', {}, ocrOnly)).toBe(false)
    expect(
      verifies(
        'provider-formula',
        {},
        { providerSettings: { params: { 'builtin-latex': { enabled: true } } } }
      )
    ).toBe(true)
    expect(verifies('translation', {}, { dom: 'OCR', translationTarget: 'en' })).toBe(false)
    expect(verifies('translation', {}, { dom: '翻译', translationTarget: 'en' })).toBe(true)
  })

  it('requires a fresh real copy, then a visible panel and actual clipboard tool', () => {
    const old = { clipboard: GUIDE_COPY_TEXT, clipboardSequence: 4 }
    expect(verifies('copy', old, old)).toBe(false)
    expect(verifies('copy', old, { ...old, clipboardSequence: 5 })).toBe(true)
    expect(verifies('copy', old, { clipboard: 'other', clipboardSequence: 5 })).toBe(false)
    expect(verifies('copy', { clipboard: 'other' }, { clipboard: GUIDE_COPY_TEXT })).toBe(true)
    expect(verifies('panel-open', {}, { panel: { visible: false, pinned: true } })).toBe(false)
    expect(verifies('panel-open', {}, { panel: { visible: true, pinned: false } })).toBe(true)
    expect(verifies('panel-pinned', {}, { panel: { visible: true, pinned: false } })).toBe(false)
    expect(verifies('panel-pinned', {}, { panel: { visible: true, pinned: true } })).toBe(true)
    expect(verifies('clipboard-open', {}, { toolReady: false, clipboardState })).toBe(false)
    expect(verifies('clipboard-open', {}, { toolReady: true, clipboardState })).toBe(true)
  })

  it('does not mistake first clipboard selection for search, menu, collection or floating completion', () => {
    const selected = { ...clipboardState, selected: [GUIDE_COPY_TEXT] }
    expect(verifies('selection', {}, { dom: GUIDE_COPY_TEXT, clipboardState })).toBe(false)
    expect(verifies('selection', {}, { clipboardState: selected })).toBe(true)
    for (const id of [
      'clipboard-search',
      'clipboard-menu',
      'clipboard-favorite',
      'clipboard-favorites',
      'clipboard-floating'
    ]) {
      expect(verifies(id, {}, { clipboardState: selected })).toBe(false)
    }
    expect(
      verifies('clipboard-search', {}, { clipboardState: { ...selected, search: '先复制' } })
    ).toBe(true)
    expect(
      verifies(
        'clipboard-search',
        {},
        { clipboardState: { ...selected, search: '先复制', items: [] } }
      )
    ).toBe(false)
    expect(verifies('clipboard-menu', {}, { clipboardState: { ...selected, menu: true } })).toBe(
      true
    )
    const favorite = { ...selected, favorites: [{ content: GUIDE_COPY_TEXT, remark: '入门练习' }] }
    expect(
      verifies(
        'clipboard-favorite',
        {},
        { clipboardState: { ...favorite, favorites: [{ content: GUIDE_COPY_TEXT }] } }
      )
    ).toBe(false)
    expect(verifies('clipboard-favorite', {}, { clipboardState: favorite })).toBe(true)
    expect(verifies('clipboard-favorites', {}, { clipboardState: favorite })).toBe(false)
    expect(
      verifies(
        'clipboard-favorites',
        {},
        { clipboardState: { ...favorite, activeTab: 'favorite' } }
      )
    ).toBe(true)
    expect(verifies('clipboard-floating', { notes: [note] }, { notes: [note] })).toBe(false)
    expect(verifies('clipboard-floating', { notes: [] }, { notes: [note] })).toBe(true)
    expect(
      verifies(
        'clipboard-floating',
        { notes: [note] },
        {
          notes: [{ ...note, text: note.text + '\n\n' + GUIDE_COPY_TEXT }]
        }
      )
    ).toBe(true)
  })

  it('requires each note feature and expands the same note that was collapsed', () => {
    const edited = { ...note, text: GUIDE_COPY_TEXT + '\n你好 TabDo' }
    expect(verifies('note', {}, { notes: [note] })).toBe(false)
    expect(verifies('note', {}, { notes: [edited] })).toBe(true)
    for (const id of [
      'note-options',
      'note-color',
      'note-opacity',
      'note-create',
      'note-collapse',
      'note-expand'
    ]) {
      expect(verifies(id, { notes: [edited] }, { notes: [edited] })).toBe(false)
    }
    expect(verifies('note-options', {}, { notes: [{ ...edited, optionsOpen: true }] })).toBe(true)
    expect(verifies('note-color', {}, { notes: [{ ...edited, color: '#bdd7f3' }] })).toBe(true)
    expect(verifies('note-opacity', {}, { notes: [{ ...edited, opacity: 80 }] })).toBe(true)
    expect(
      verifies('note-create', { notes: [edited] }, { notes: [edited, { ...note, id: 2 }] })
    ).toBe(true)
    const collapsed = { ...edited, collapsed: true, edge: 'left' }
    expect(verifies('note-collapse', { notes: [edited] }, { notes: [collapsed] })).toBe(true)
    expect(verifies('note-expand', { notes: [collapsed] }, { notes: [{ ...note, id: 2 }] })).toBe(
      false
    )
    expect(verifies('note-expand', { notes: [collapsed] }, { notes: [edited] })).toBe(true)
  })

  it('waits for user parameter changes, committed annotations and separate scan copying', () => {
    const before = { toolReady: true, toolState: '[original]', toolMode: 'resize' }
    expect(verifies('resize-config', {}, { toolReady: true, toolState: '[original]' })).toBe(false)
    expect(verifies('resize-config', before, before)).toBe(false)
    const resized = { ...before, toolState: JSON.stringify([{ name: '宽度', value: '50%' }]) }
    expect(verifies('resize-config', before, resized)).toBe(true)
    expect(verifies('resize-config', before, { ...resized, toolMode: 'compress' })).toBe(false)
    expect(verifies('annotate-config', before, { ...before, annotationCount: 0 })).toBe(false)
    expect(verifies('annotate-config', before, { ...before, annotationCount: 1 })).toBe(true)
    expect(verifies('qr-result', {}, { dom: GUIDE_QR_TEXT })).toBe(true)
    expect(verifies('qr', {}, { dom: GUIDE_QR_TEXT })).toBe(false)
    expect(verifies('qr', {}, { dom: GUIDE_QR_TEXT, clipboard: GUIDE_QR_TEXT })).toBe(true)
    expect(
      verifies(
        'qr',
        { clipboard: GUIDE_QR_TEXT, clipboardSequence: 5 },
        {
          dom: GUIDE_QR_TEXT,
          clipboard: GUIDE_QR_TEXT,
          clipboardSequence: 5
        }
      )
    ).toBe(false)
    expect(
      verifies(
        'qr',
        { clipboard: GUIDE_QR_TEXT, clipboardSequence: 5 },
        {
          dom: GUIDE_QR_TEXT,
          clipboard: GUIDE_QR_TEXT,
          clipboardSequence: 6
        }
      )
    ).toBe(true)
    expect(verifies('finder-preview', {}, { dom: '图片:ready' })).toBe(false)
    expect(verifies('finder-preview', {}, { finderPreview: true })).toBe(true)
    expect(verifies('screenshot', {}, { dom: 'cancelled' })).toBe(false)
  })

  it('accepts explicit nondefault goals even when users finish during tool preparation', () => {
    const cases = [
      {
        id: 'rename-config',
        mode: '',
        initial: [{ name: '编号前缀', value: '' }],
        result: [{ name: '编号前缀', value: '入门_' }]
      },
      {
        id: 'resize-config',
        mode: 'resize',
        initial: [{ name: '宽度', value: '' }],
        result: [{ name: '宽度', value: '50%' }]
      },
      {
        id: 'crop-config',
        mode: 'crop',
        initial: [
          { name: '自由', pressed: 'true' },
          { name: '1:1', pressed: 'false' }
        ],
        result: [{ name: '1:1', pressed: 'true' }]
      },
      {
        id: 'merge-config',
        mode: 'merge',
        initial: [{ name: '合并方向', value: 'vertical' }],
        result: [{ name: '合并方向', value: 'horizontal' }]
      },
      {
        id: 'video-config',
        mode: 'cut',
        initial: [
          { name: '开始位置（秒）', value: '0' },
          { name: '片段时长（秒）', value: '' }
        ],
        result: [
          { name: '开始位置（秒）', value: '0' },
          { name: '片段时长（秒）', value: '1' }
        ]
      },
      {
        id: 'recorder-config',
        mode: '',
        initial: [
          { name: '3 秒', pressed: 'true' },
          { name: '5 秒', pressed: 'false' }
        ],
        result: [{ name: '5 秒', pressed: 'true' }]
      }
    ]
    for (const entry of cases) {
      const initial = {
        toolReady: true,
        toolMode: entry.mode,
        toolState: JSON.stringify(entry.initial)
      }
      const result = {
        toolReady: true,
        toolMode: entry.mode,
        toolState: JSON.stringify(entry.result)
      }
      expect(verifies(entry.id, {}, initial), entry.id).toBe(false)
      // 即使晚到的基线也已包含目标，实际非默认控件值仍应被接受。
      expect(verifies(entry.id, result, result), entry.id).toBe(true)
      expect(verifies(entry.id, {}, { ...result, toolState: '{partial' }), entry.id).toBe(false)
    }
  })

  it('rejects old and empty outputs and requires all renamed file contents preserved', () => {
    const file = { size: 20, modified: 1 },
      before = { files: { '图片/样例.png': file } }
    expect(verifies('resize', before, before)).toBe(false)
    expect(
      verifies('resize', before, {
        outputNames: ['result.png'],
        files: { ...before.files, '练习输出/result.png': { size: 0, modified: 2 } }
      })
    ).toBe(false)
    expect(
      verifies('resize', before, {
        outputNames: ['result.png'],
        files: { ...before.files, '练习输出/result.png': { size: 15, modified: 2 } }
      })
    ).toBe(true)
    const text = { size: 4, modified: 1, hash: 'a' },
      other = { size: 5, modified: 1, hash: 'b' }
    const originals = { files: { '练习文件甲.txt': text, '练习文件乙.txt': other } }
    expect(verifies('rename', originals, { files: {} })).toBe(false)
    expect(verifies('rename', originals, { files: { '1.txt': text, '2.txt': other } })).toBe(true)
  })

  it('rejects late output from another tool without matching current publication evidence', () => {
    const original = { files: { '图片/练习图片.png': { size: 100, modified: 1 } } }
    const lateFiles = { ...original.files, '练习输出/旧工具迟到.png': { size: 55, modified: 2 } }
    expect(verifies('resize', original, { files: lateFiles })).toBe(false)
    expect(verifies('resize', original, { files: lateFiles, outputNames: ['当前缩小.png'] })).toBe(
      false
    )
    const published = { ...lateFiles, '练习输出/当前缩小.png': { size: 25, modified: 3 } }
    expect(verifies('resize', original, { files: published, outputNames: ['当前缩小.png'] })).toBe(
      true
    )
    expect(
      verifies('resize', { files: published }, { files: published, outputNames: ['当前缩小.png'] })
    ).toBe(false)
    expect(
      verifies('annotate', original, {
        files: lateFiles,
        annotationCount: 1,
        annotationSaved: false
      })
    ).toBe(false)
    expect(
      verifies('annotate', original, {
        files: lateFiles,
        annotationCount: 0,
        annotationSaved: true
      })
    ).toBe(false)
    expect(
      verifies('annotate', original, {
        files: published,
        annotationCount: 1,
        annotationSaved: true
      })
    ).toBe(true)
    const foreignVideo = { files: { '练习输出/裁剪样片.mp4': { size: 99, modified: 4 } } }
    expect(verifies('recorder', {}, foreignVideo)).toBe(false)
    expect(
      verifies(
        'recorder',
        {},
        { files: { '.tabdo-recorder-x/capture.mp4': { size: 99, modified: 4 } } }
      )
    ).toBe(false)
    expect(
      verifies(
        'recorder',
        {},
        { files: { '练习输出/录屏助手_20261023230500.mp4': { size: 99, modified: 4 } } }
      )
    ).toBe(true)
    expect(
      verifies(
        'recorder',
        {},
        { files: { '练习输出/录屏助手_20261023230500 (1).mp4': { size: 99, modified: 4 } } }
      )
    ).toBe(true)
  })

  it('teaches recognition results before requiring a separate real copy', () => {
    const result = { id: 'one', text: 'Hello', mode: 'ocr' }
    const after = { history: [result], recognitionText: 'Hello' }
    expect(verifies('ocr-result', { history: [result] }, after)).toBe(false)
    expect(verifies('ocr-result', {}, after)).toBe(true)
    expect(verifies('ocr', {}, after)).toBe(false)
    expect(
      verifies(
        'ocr',
        { clipboardSequence: 1 },
        { ...after, clipboard: 'Hello', clipboardSequence: 2 }
      )
    ).toBe(true)
    expect(
      verifies(
        'ocr',
        { clipboardSequence: 2 },
        { ...after, clipboard: 'Hello', clipboardSequence: 2 }
      )
    ).toBe(false)
    expect(verifies('formula-result', {}, after)).toBe(false)
    expect(
      verifies(
        'formula-result',
        {},
        {
          history: [{ ...result, mode: 'formula' }],
          recognitionText: 'Hello',
          formulaPreview: true
        }
      )
    ).toBe(true)
  })

  it('does not count saving untouched default websites as a configuration exercise', () => {
    const defaults = JSON.stringify({
      sites: [{ id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={query}' }]
    })
    const saved = JSON.stringify({
      sites: [{ id: 'baidu', name: 'TabDo 入门搜索', url: 'https://www.baidu.com/s?wd={query}' }]
    })
    expect(verifies('web', { web: 'null' }, { web: defaults })).toBe(false)
    expect(verifies('web', { web: defaults }, { web: defaults, dom: 'TabDo 入门搜索' })).toBe(false)
    expect(verifies('web', { web: defaults }, { web: saved })).toBe(true)
    expect(verifies('web', {}, { web: '{partial' })).toBe(false)
  })
})
