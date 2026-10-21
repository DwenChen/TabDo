import { applyRenameModules } from './renameModules'
import {
  NUMBERING_STYLES,
  REPLACE_MODES,
  CASE_MODES,
  INSERT_KINDS,
  INFO_KINDS,
  REMOVE_TYPES
} from './renameModules'

export { NUMBERING_STYLES, REPLACE_MODES, CASE_MODES, INSERT_KINDS, INFO_KINDS, REMOVE_TYPES }

/**
 * 界面统一入口：把规则计算委托给纯引擎，界面只负责状态与交互。
 * @param files 用户选择的文件元数据列表。
 * @param workflow 各标签页的规则配置。
 * @returns 带 newName 与 error 的预览条目列表。
 */
export const applyRenameRules = applyRenameModules

/**
 * 生成稳定的规则标识，兼容无 crypto 的极端环境。
 * @returns 规则唯一标识。
 */
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 创建一条查找替换规则，避免多条规则共享可变状态。
 * @returns 含默认参数的替换规则。
 */
export function newReplaceRule() {
  return {
    id: newId(),
    enabled: true,
    find: '',
    mode: 'normal',
    replace: '',
    start: 1,
    count: 1
  }
}

/**
 * 创建一条删除字符规则。
 * @returns 含默认参数的删除规则。
 */
export function newRemoveRule() {
  return {
    id: newId(),
    enabled: true,
    kind: 'char',
    char: '',
    type: 'digit',
    from: 1,
    count: 0,
    unique: false
  }
}

/**
 * 创建完整的重命名工作流默认配置，供界面持久化与复位使用。
 * @returns 六标签页对应的全新规则对象。
 */
export function createWorkflow() {
  return {
    numbering: { enabled: false, start: 1, style: 'arabic', digits: 3, prefix: '', suffix: '' },
    replace: { enabled: false, replaceExtension: false, rules: [newReplaceRule()] },
    clean: {
      enabled: false,
      case: { enabled: false, mode: 'lower' },
      sanitize: {
        enabled: false,
        mode: 'replace',
        replacement: '_',
        trim: false,
        collapse: false,
        dot: false
      },
      extension: { enabled: false, value: '' },
      remove: { enabled: false, rules: [newRemoveRule()] }
    },
    insert: {
      enabled: false,
      kind: 'text',
      text: '',
      number: 1,
      numberStyle: 'arabic',
      numberDigits: 3,
      info: 'modified',
      position: 'start',
      index: 1,
      prefix: '',
      suffix: ''
    }
  }
}

/**
 * 把持久化配置合并到默认结构，容忍旧版本或缺失字段。
 * 数组字段按整体替换处理，避免与默认样例规则混用。
 * @param raw 从 dbStorage 读到的原始配置。
 * @returns 结构完整的规则配置。
 */
export function normalizeWorkflow(raw) {
  const base = createWorkflow()
  if (!raw || typeof raw !== 'object') return base
  const merge = (target, source) => {
    for (const key of Object.keys(target)) {
      const value = source?.[key]
      if (value === undefined || value === null) continue
      if (Array.isArray(target[key])) {
        if (Array.isArray(value)) target[key] = value
      } else if (typeof target[key] === 'object') {
        merge(target[key], value)
      } else {
        target[key] = value
      }
    }
    return target
  }
  return merge(base, raw)
}
