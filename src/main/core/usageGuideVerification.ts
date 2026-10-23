import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { GuideStep } from '../../shared/usageGuideSteps'
import { GUIDE_COPY_TEXT, GUIDE_QR_TEXT } from '../../shared/usageGuideSteps'

export interface GuideFile {
  size: number
  modified: number
  hash?: string
}
export interface GuideEvidence {
  settings?: any
  clipboard?: string
  dom?: string
  files?: Record<string, GuideFile>
  history?: Array<{ id: string; text: string; mode: string }>
  web?: string
  translationTarget?: string
  providerSettings?: any
  clipboardSequence?: number
  panel?: { visible: boolean; pinned: boolean }
  toolReady?: boolean
  toolState?: string
  toolMode?: string
  annotationCount?: number
  annotationSaved?: boolean
  outputNames?: string[]
  recognitionText?: string
  formulaPreview?: boolean
  finderPreview?: boolean
  clipboardState?: {
    activeTab: string
    search: string
    menu: boolean
    items: string[]
    selected: string[]
    favorites: Array<{ content: string; remark?: string }>
  }
  notes?: GuideNoteEvidence[]
}

export interface GuideNoteEvidence {
  id: number
  text: string
  color: string
  opacity: number
  collapsed: boolean
  edge: string
  optionsOpen: boolean
}

/**
 * 生成独立便签的只读状态查询；窗口标识由主进程补充，不注入推进接口。
 * @returns 从真实正文、已选纸色、透明度及贴边状态读取证据的脚本。
 */
export function guideNoteEvidenceScript(): string {
  return `(() => {
    const note = document.querySelector('#note');
    if (!note || document.querySelector('#note-body')?.hidden) return null;
    return {
      text: note.value || '',
      color: document.querySelector('[data-note-color][aria-pressed="true"]')?.dataset.noteColor || '',
      opacity: Number(document.querySelector('#note-opacity')?.value || 100),
      collapsed: document.body.dataset.dock === 'collapsed',
      edge: document.body.dataset.edge || '',
      optionsOpen: document.querySelector('#note-options')?.hidden === false
    };
  })()`
}

/**
 * 生成当前工具的有界只读查询，直接读取实际控件、列表和持久化收藏。
 * @param step 当前课程步骤。
 * @returns 可交给真实工具 WebContents 执行并合并为证据的脚本。
 */
export function guideDomEvidenceScript(step: GuideStep): string {
  const roots: Record<string, string> = {
    clipboard: '.clipboard-app',
    'sticky-note': '#note-body:not([hidden])',
    'image-annotate': '#canvas:not([hidden])',
    'file-renamer': '.rename-page',
    'folder-break': '.break-page',
    'qrcode-scan': '.qr-page',
    'image-batch': '.media-batch[data-media="image"]',
    'image-manual-crop': '.media-batch[data-media="image"]',
    'image-merge': '.media-batch[data-media="image"]',
    'video-batch': '.media-batch[data-media="video"]',
    'screen-recorder': '.recorder-page',
    recognize: '.provider-tools',
    'latex-recognize': '.provider-tools',
    'web-quick-open': '.quick-open',
    'local-search': '.search-workspace'
  }
  const root = step.route
    ? '.setting-container, .providers-tabs, [data-guide="panel-trigger"], [data-guide="shortcut-esc"]'
    : roots[step.tool || '']
  // 状态只包含当前工具所需的控件值，不读取任意页面正文或外部应用。
  return `(async () => {
    const root = document.querySelector(${JSON.stringify(root || ':not(*)')});
    const evidence = { toolReady: Boolean(root) };
    if (!root) return evidence;
    evidence.toolMode = document.querySelector('.media-batch')?.dataset.mode || '';
    evidence.outputNames = Array.from(document.querySelectorAll('.media-batch .result-link[data-output-name]')).map(element => element.dataset.outputName || '').filter(Boolean);
    evidence.annotationCount = Number(document.querySelector('#canvas')?.dataset.annotationCount || 0);
    evidence.annotationSaved = document.querySelector('#status')?.textContent?.trim() === '图片已保存';
    const app = document.querySelector('.clipboard-app');
    if (app) {
      let favorites = [];
      try {
        const value = await window.tabdo.db.promises.get('clipboard_favorites');
        favorites = Array.isArray(value?.favorites) ? value.favorites.map(item => ({content: item.content, remark: item.remark})) : [];
      } catch { /* 读取失败不算完成，留待下次检查。 */ }
      evidence.clipboardState = {
        activeTab: app.dataset.activeTab || '', search: app.dataset.searchText || '',
        menu: app.dataset.contextMenu === 'true' && Boolean(document.querySelector('.context-menu')),
        items: Array.from(document.querySelectorAll('.clipboard-item')).map(item => item.dataset.content || ''),
        selected: Array.from(document.querySelectorAll('.clipboard-item[aria-selected="true"]')).map(item => item.dataset.content || ''),
        favorites
      };
    }
    evidence.dom = document.querySelector('.qr-result textarea')?.value || document.querySelector('.providers-tabs .tab-btn.active')?.textContent?.trim() || '';
    const result = document.querySelector('.provider-tools .result textarea');
    if (result) evidence.recognitionText = result.value || '';
    evidence.formulaPreview = Boolean(document.querySelector('.formula-preview')?.textContent?.trim());
    evidence.finderPreview = Boolean(document.querySelector('.search-result[aria-selected="true"]') && document.querySelector('.finder-preview-zoom .preview-content img'));
    if (${JSON.stringify(step.check)} === 'finder') {
      const active = document.querySelector('.finder-sidebar .active, .finder-sidebar .selected')?.textContent || '';
      evidence.dom = active.includes('图片') && document.querySelector('.result-list[aria-busy="false"] .search-result') ? '图片:ready' : '';
    }
    if (${JSON.stringify(step.check)} === 'tool-config' && (!${JSON.stringify(step.expectedState || '')} || evidence.toolMode === ${JSON.stringify(step.expectedState || '')})) {
      const scope = document.querySelector('.number-panel, .media-parameters, .recorder-form') || root;
      evidence.toolState = JSON.stringify(Array.from(scope.querySelectorAll('input,select,button[aria-pressed],button.selected')).map(element => ({
        name: element.getAttribute('aria-label') || element.name || element.id || element.textContent?.trim(),
        value: element.value || '', checked: element.checked, pressed: element.getAttribute('aria-pressed'), selected: element.classList.contains('selected')
      })));
    }
    return evidence;
  })()`
}

/**
 * 对本次桌面目录作有界只读快照；不跟随链接，不读取大文件正文。
 * @param root 已验证的本次桌面练习目录。
 * @returns 相对路径、大小、修改时间及小文本摘要。
 */
export function snapshotGuideFiles(root: string): Record<string, GuideFile> {
  const result: Record<string, GuideFile> = {}
  let count = 0
  /**
   * 仅检查四层、最多三百个条目，防止用户加入大量文件造成后台遍历。
   * @param relative 当前相对目录。
   * @param depth 当前深度。
   * @returns 无返回值。
   */
  function visit(relative: string, depth: number): void {
    if (depth > 4 || count >= 300) return
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (++count > 300) return
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const name = path.join(relative, entry.name)
      if (entry.isDirectory()) visit(name, depth + 1)
      else if (entry.isFile()) {
        const file = path.join(root, name),
          stat = fs.statSync(file)
        result[name.replaceAll('\\', '/')] = {
          size: stat.size,
          modified: stat.mtimeMs,
          ...(stat.size < 65536 && name.endsWith('.txt')
            ? { hash: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
            : {})
        }
      }
    }
  }
  try {
    visit('', 0)
  } catch {
    /* 尚在发布、取消或目录被用户移走时，等待下次检查。 */
  }
  return result
}

/**
 * 直接匹配课程规定的真实控件值；准备期间已经完成的目标也有效，不依赖轮询基线。
 * @param step 当前配置课程及非默认目标。
 * @param state 工具只读查询返回的实际控件序列。
 * @returns 所有明确配置目标是否匹配；无目标或损坏证据返回 false。
 */
function guideConfigurationMatches(step: GuideStep, state?: string): boolean {
  if (!step.configTargets?.length || !state) return false
  try {
    const fields = JSON.parse(state)
    if (!Array.isArray(fields)) return false
    return step.configTargets.every((target) =>
      fields.some(
        (field) =>
          typeof field?.name === 'string' &&
          field.name.replace(/\s+/g, '') === target.name.replace(/\s+/g, '') &&
          (target.value === undefined || field.value === target.value) &&
          (target.pressed === undefined || field.pressed === String(target.pressed))
      )
    )
  } catch {
    // 正文切换期间的残缺状态不代表用户完成操作，等待后续完整快照。
    return false
  }
}

/**
 * 对比本步开始前后的实际证据；取消、初始页面和旧结果都不能冒充完成。
 * @param step 当前课程步骤。
 * @param before 本步开始前的基线。
 * @param now 当前只读结果。
 * @returns 是否满足该步骤的实际完成条件。
 */
export function verifyGuideStep(
  step: GuideStep,
  before: GuideEvidence,
  now: GuideEvidence
): boolean {
  const settings = now.settings || {},
    files = now.files || {},
    original = before.files || {},
    state = now.clipboardState,
    notes = now.notes || []
  switch (step.check) {
    case 'panel':
      return settings.superPanelMouseButton === 'middle' && settings.superPanelLongPressMs > 0
    case 'match':
      return settings.clipboardQuickMatchSeconds === 10
    case 'shortcut':
      return settings.builtinAppShortcutsEnabled?.esc === true
    case 'copy':
      return (
        now.clipboard === GUIDE_COPY_TEXT &&
        (typeof now.clipboardSequence === 'number' && typeof before.clipboardSequence === 'number'
          ? now.clipboardSequence > before.clipboardSequence
          : now.clipboard !== before.clipboard)
      )
    case 'panel-open':
      return now.panel?.visible === true
    case 'panel-pinned':
      return now.panel?.visible === true && now.panel.pinned === true
    case 'clipboard-open':
      return now.toolReady === true && state?.items.includes(GUIDE_COPY_TEXT) === true
    case 'selection':
      return state?.selected.includes(GUIDE_COPY_TEXT) === true
    case 'clipboard-search':
      return Boolean(state?.search.includes('先复制') && state.items.includes(GUIDE_COPY_TEXT))
    case 'clipboard-menu':
      return state?.menu === true && state.selected.includes(GUIDE_COPY_TEXT)
    case 'clipboard-favorite':
      return (
        state?.favorites.some(
          (item) => item.content === GUIDE_COPY_TEXT && item.remark === '入门练习'
        ) === true
      )
    case 'clipboard-favorites':
      return (
        state?.activeTab === 'favorite' &&
        state.items.includes(GUIDE_COPY_TEXT) &&
        state.favorites.some(
          (item) => item.content === GUIDE_COPY_TEXT && item.remark === '入门练习'
        )
      )
    case 'clipboard-floating':
      return notes.some(
        (note) =>
          note.text.includes(GUIDE_COPY_TEXT) &&
          !before.notes?.some((old) => old.id === note.id && old.text === note.text)
      )
    case 'note':
      return notes.some((note) => note.text.includes('你好 TabDo'))
    case 'note-options':
      return notes.some((note) => note.optionsOpen)
    case 'note-color':
      return notes.some((note) => note.color === '#bdd7f3')
    case 'note-opacity':
      return notes.some((note) => note.opacity >= 35 && note.opacity <= 80)
    case 'note-create':
      return notes.some((note) => !before.notes?.some((old) => old.id === note.id))
    case 'note-collapse':
      return notes.some(
        (note) =>
          note.collapsed &&
          note.edge &&
          !before.notes?.some((old) => old.id === note.id && old.collapsed)
      )
    case 'note-expand':
      return notes.some(
        (note) =>
          !note.collapsed && before.notes?.some((old) => old.id === note.id && old.collapsed)
      )
    case 'tool-config':
      return (
        now.toolReady === true &&
        (!step.expectedState || now.toolMode === step.expectedState) &&
        (step.tool === 'image-annotate'
          ? (now.annotationCount || 0) > 0
          : step.configTargets?.length
            ? guideConfigurationMatches(step, now.toolState)
            : Boolean(before.toolState && now.toolState && now.toolState !== before.toolState))
      )
    case 'qr-result':
      return now.dom === GUIDE_QR_TEXT
    case 'qr':
      return (
        now.dom === GUIDE_QR_TEXT &&
        now.clipboard === GUIDE_QR_TEXT &&
        (typeof now.clipboardSequence === 'number' && typeof before.clipboardSequence === 'number'
          ? now.clipboardSequence > before.clipboardSequence
          : now.clipboard !== before.clipboard)
      )
    case 'rename': {
      const sources = ['练习文件甲.txt', '练习文件乙.txt']
      return (
        sources.some((name) => !files[name]) &&
        sources.every(
          (name) =>
            original[name]?.hash &&
            Object.values(files).some((file) => file.hash === original[name].hash)
        )
      )
    }
    case 'folder':
      return (
        !files['待解散文件夹/练习文件.txt'] &&
        Boolean(
          original['待解散文件夹/练习文件.txt']?.hash &&
          files['练习文件.txt']?.hash === original['待解散文件夹/练习文件.txt'].hash
        )
      )
    case 'image':
    case 'video': {
      const extension =
        step.check === 'image'
          ? /\.(png|jpe?g|webp|gif|avif|tiff?|bmp)$/i
          : /\.(mp4|webm|mkv|mov|avi|gif)$/i
      return Object.entries(files).some(([name, file]) => {
        if (
          !extension.test(name) ||
          file.size <= 0 ||
          (original[name] &&
            original[name].size === file.size &&
            original[name].modified === file.modified)
        )
          return false
        // 必须关联当前工具实际发布的结果，其他课程迟到的同类文件不能借此完成。
        if (step.tool === 'image-annotate')
          return (now.annotationCount || 0) > 0 && now.annotationSaved === true
        if (step.tool === 'screen-recorder')
          return /^录屏助手_\d+(?: \(\d+\))?\.mp4$/i.test(path.basename(name))
        return now.outputNames?.includes(path.basename(name)) === true
      })
    }
    case 'provider-tab':
      return now.dom === 'OCR'
    case 'provider-enable':
      return step.expectedState === 'formula'
        ? now.providerSettings?.params?.['builtin-latex']?.enabled === true
        : now.providerSettings?.enabled?.ocr?.includes('builtin-wechat-ocr') === true
    case 'provider-config':
      return now.dom === '翻译' && now.translationTarget === 'en'
    case 'ocr-result':
    case 'formula-result':
      return Boolean(
        now.recognitionText?.trim() &&
        (step.check !== 'formula-result' || now.formulaPreview) &&
        now.history?.some(
          (item) =>
            item.mode === (step.check === 'formula-result' ? 'formula' : 'ocr') &&
            item.text.trim() &&
            item.text === now.recognitionText &&
            !before.history?.some((old) => old.id === item.id)
        )
      )
    case 'ocr':
    case 'formula':
      return Boolean(
        now.recognitionText?.trim() &&
        now.recognitionText === now.clipboard &&
        (typeof now.clipboardSequence === 'number' && typeof before.clipboardSequence === 'number'
          ? now.clipboardSequence > before.clipboardSequence
          : before.clipboard !== now.clipboard)
      )
    case 'web': {
      try {
        // 初次保存默认配置不代表修改过网站；必须实际持久化课程指定的非默认名称。
        const config = JSON.parse(now.web || 'null')
        return (
          Array.isArray(config?.sites) &&
          config.sites.some((site) => site?.name === 'TabDo 入门搜索')
        )
      } catch {
        return false
      }
    }
    case 'finder':
      return now.dom === '图片:ready'
    case 'finder-preview':
      return now.finderPreview === true
    case 'native':
      return now.dom === 'confirmed'
  }
}
