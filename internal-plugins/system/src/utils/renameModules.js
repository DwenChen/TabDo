/**
 * 文件批量重命名的纯计算引擎。
 *
 * 只按「自动编号 → 查找替换 → 规则清理 → 插入内容」这一固定顺序推导目标名称，
 * 不访问文件系统、不修改入参；读取不到的条目信息通过返回值暴露为条目级错误。
 */

/** 序号类型选项：[存储值, 显示名]。 */
export const NUMBERING_STYLES = [
  ['arabic', '阿拉伯数字'],
  ['lowerChinese', '中文小写'],
  ['upperChinese', '中文大写'],
  ['lowerAlpha', '英文小写字母'],
  ['upperAlpha', '英文大写字母']
]

/** 查找替换模式选项：[存储值, 显示名]。 */
export const REPLACE_MODES = [
  ['normal', '普通替换'],
  ['head', '前 N 位'],
  ['tail', '后 N 位'],
  ['range', '从第 X 位开始的 N 位'],
  ['after', '某字符之后的内容'],
  ['before', '某字符之前的内容'],
  ['afterCount', '某字符之后的 N 位'],
  ['beforeCount', '某字符之前的 N 位']
]

/** 大小写转换选项：[存储值, 显示名]，只作用于主文件名。 */
export const CASE_MODES = [
  ['lower', '全部小写'],
  ['upper', '全部大写'],
  ['title', '首字母大写'],
  ['camel', '驼峰 camel'],
  ['snake', '下划线 snake'],
  ['kebab', '短横线 kebab']
]

/** 插入内容类型选项。 */
export const INSERT_KINDS = [
  ['text', '文本'],
  ['number', '序号'],
  ['info', '文件信息']
]

/** 文件信息子类型选项。 */
export const INFO_KINDS = [
  ['created', '创建时间'],
  ['modified', '修改时间'],
  ['size', '大小'],
  ['dimensions', '图片尺寸'],
  ['shot', '拍摄时间']
]

/** 删除字符的类型匹配选项。 */
export const REMOVE_TYPES = [
  ['digit', '数字'],
  ['letter', '字母'],
  ['space', '空白'],
  ['symbol', '符号'],
  ['cjk', '中文']
]

/** Windows 文件名的非法可见字符（控制字符另按码点判断）。 */
const ILLEGAL_NAME = /[<>:"\\/|?*]/
/** 需要替换或删除的可见非法字符集合。 */
const ILLEGAL_CHARS = '<>:"\\/|?*'
/** Windows 保留设备名。 */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
/** 条目信息输出的默认时间格式（避免使用非法字符 `:`）。 */
const DATE_FORMAT = 'YYYY-MM-DD_HH-mm-ss'

/**
 * 判断单个字符是否属于非法可见字符或控制字符。
 * @param char 单个字符。
 * @returns 是否非法。
 */
function isIllegalChar(char) {
  return char.charCodeAt(0) < 32 || ILLEGAL_CHARS.includes(char)
}

/**
 * 把字符串拆成 Unicode 字素簇，保证 emoji 与组合字符不会被拆坏。
 * @param text 待拆分文本。
 * @returns 字素簇数组。
 */
function graphemes(text) {
  const value = String(text ?? '')
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
    return [...segmenter.segment(value)].map((part) => part.segment)
  }
  return [...value]
}

/**
 * 拆分末尾扩展名；目录、Unix 隐藏文件与无点号名称按整体主名处理。
 * @param name 当前文件名。
 * @param directory 是否为目录。
 * @returns [主文件名, 扩展名]。
 */
function parts(name, directory) {
  const at = directory ? -1 : String(name).lastIndexOf('.')
  return at > 0 ? [String(name).slice(0, at), String(name).slice(at + 1)] : [String(name), '']
}

/**
 * 按模板格式化时间戳，支持 YYYY/MM/DD/HH/mm/ss 占位。
 * @param time 毫秒时间戳。
 * @param format 时间格式模板。
 * @returns 格式化后的时间文本。
 */
function formatDate(time, format = DATE_FORMAT) {
  const d = new Date(Number(time) || 0)
  const values = {
    YYYY: d.getFullYear(),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    DD: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0')
  }
  return String(format).replace(/YYYY|MM|DD|HH|mm|ss/g, (key) => String(values[key]))
}

/**
 * 将正整数转成中文数字，支持小写（一二三）与大写（壹贰叁）两套写法。
 * @param value 正整数。
 * @param upper 是否使用大写形式。
 * @returns 中文数字文本。
 */
function toChineseNumber(value, upper) {
  const numerals = upper
    ? ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
    : ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const units = upper ? ['', '拾', '佰', '仟'] : ['', '十', '百', '千']
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number) || number <= 0) return numerals[0]
  const digits = String(number)
  const length = digits.length
  let output = ''
  for (let index = 0; index < length; index++) {
    const digit = Number(digits[index])
    const unit = units[length - 1 - index] || ''
    if (digit === 0) {
      // 连续零只保留一个，且不在末尾堆积。
      if (output && !output.endsWith(numerals[0])) output += numerals[0]
      continue
    }
    output += numerals[digit] + unit
  }
  output = output.replace(new RegExp(`${numerals[0]}$`), '')
  // 小写中文习惯把“一十”简写为“十”。
  if (!upper) output = output.replace(/^一十/, '十')
  return output
}

/**
 * 将正整数转成字母序号（1→A、26→Z、27→AA 的双射进制）。
 * @param value 正整数。
 * @returns 大写字母序号。
 */
function toAlphaNumber(value) {
  let number = Math.trunc(Number(value))
  if (!Number.isFinite(number) || number <= 0) number = 1
  let output = ''
  while (number > 0) {
    number -= 1
    output = String.fromCharCode(65 + (number % 26)) + output
    number = Math.floor(number / 26)
  }
  return output
}

/**
 * 按所选类型格式化序号，固定位数只在阿拉伯数字下生效。
 * @param value 序号数值。
 * @param style 序号类型。
 * @param digits 固定位数。
 * @returns 格式化后的序号文本。
 */
export function formatSequence(value, style, digits) {
  const number = Math.trunc(Number(value)) || 0
  if (style === 'lowerChinese') return toChineseNumber(number, false)
  if (style === 'upperChinese') return toChineseNumber(number, true)
  if (style === 'lowerAlpha') return toAlphaNumber(number).toLowerCase()
  if (style === 'upperAlpha') return toAlphaNumber(number)
  const width = Math.max(1, Math.min(12, Math.trunc(Number(digits)) || 1))
  return String(Math.max(0, number)).padStart(width, '0')
}

/**
 * 把主文件名切成用于大小写转换的单词序列，兼顾驼峰与分隔符。
 * @param stem 主文件名。
 * @returns 单词数组。
 */
function words(stem) {
  return String(stem)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
}

/**
 * 按指定模式转换主文件名大小写。
 * @param stem 主文件名。
 * @param mode 转换模式（CASE_MODES 的存储值）。
 * @returns 转换后的主文件名。
 */
function applyCase(stem, mode) {
  const text = String(stem)
  if (mode === 'lower') return text.toLowerCase()
  if (mode === 'upper') return text.toUpperCase()
  const list = words(text)
  if (!list.length) return text
  if (mode === 'snake') return list.join('_').toLowerCase()
  if (mode === 'kebab') return list.join('-').toLowerCase()
  if (mode === 'camel')
    return list
      .map((word, index) =>
        index ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
      )
      .join('')
  // 默认首字母大写（Title）：每个单词首字母大写、其余小写。
  return list.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

/**
 * 按「字符 / 类型 + 位置 + 去重」规则删除主文件名中的字素簇。
 * @param text 主文件名。
 * @param rule 单条删除规则。
 * @returns 删除后的主文件名。
 */
function removeChars(text, rule) {
  const chars = graphemes(text)
  const matches = chars.map((char) => matchRemoveChar(char, rule))
  if (rule.unique) {
    // 去重：同一字符只保留首次出现，后续重复项视为可删除。
    const seen = new Set()
    for (let index = 0; index < chars.length; index++) {
      if (!matches[index]) continue
      if (seen.has(chars[index])) matches[index] = false
      else seen.add(chars[index])
    }
  }
  const from = Math.max(1, Math.trunc(Number(rule.from)) || 1)
  const requested = Math.max(0, Math.trunc(Number(rule.count)) || 0)
  let removed = 0
  let passed = 0
  const kept = []
  for (let index = 0; index < chars.length; index++) {
    if (matches[index]) {
      passed++
      // requested 为 0 表示从起始位置起全部删除。
      if (passed >= from && (requested === 0 || removed < requested)) {
        removed++
        continue
      }
    }
    kept.push(chars[index])
  }
  return kept.join('')
}

/**
 * 判断单个字素簇是否命中删除规则。
 * @param char 单个字素簇。
 * @param rule 单条删除规则。
 * @returns 是否命中。
 */
function matchRemoveChar(char, rule) {
  if (rule.kind !== 'type') return !!rule.char && char === rule.char
  switch (rule.type) {
    case 'digit':
      return /^[0-9]$/.test(char)
    case 'letter':
      return /^[A-Za-z]$/.test(char)
    case 'space':
      return /^\s$/.test(char)
    case 'cjk':
      return /^[\u4e00-\u9fff]$/.test(char)
    case 'symbol':
      return /^[^\p{L}\p{N}\s_]$/u.test(char)
    default:
      return false
  }
}

/**
 * 清洗主文件名：替换或删除非法字符与控制字符，可选首尾空白、连续空白与点号归一。
 * @param text 主文件名。
 * @param config 清洗配置。
 * @returns 清洗后的主文件名。
 */
function sanitizeName(text, config) {
  const replacement = config.mode === 'delete' ? '' : String(config.replacement ?? '_')
  let result = ''
  // 逐字符处理，避免正则匹配控制字符；控制字符与保留字符统一替换或删除。
  for (const char of String(text)) result += isIllegalChar(char) ? replacement : char
  if (config.trim) result = result.trim()
  if (config.collapse) result = result.replace(/\s+/g, ' ')
  if (config.dot) result = result.replace(/\.{2,}/g, '.')
  return result
}

/**
 * 按查找替换规则的模式改写一段文本，位置类模式按字素簇计数。
 * @param text 待改写文本。
 * @param rule 单条替换规则。
 * @returns 改写后的文本。
 * @throws {Error} 查找内容过长时抛出，交由条目级错误呈现。
 */
function applyReplace(text, rule) {
  const find = String(rule.find ?? '')
  const replace = String(rule.replace ?? '')
  if (rule.mode === 'normal') {
    if (!find) return text
    if (find.length > 300) throw new Error('查找内容过长')
    return text.split(find).join(replace)
  }
  const chars = graphemes(text)
  const count = Math.max(0, Math.trunc(Number(rule.count)) || 0)
  const start = Math.max(1, Math.trunc(Number(rule.start)) || 1)
  if (rule.mode === 'head') return replace + chars.slice(count).join('')
  if (rule.mode === 'tail')
    return (count ? chars.slice(0, Math.max(0, chars.length - count)).join('') : text) + replace
  if (rule.mode === 'range')
    return chars.slice(0, start - 1).join('') + replace + chars.slice(start - 1 + count).join('')
  // 字符锚点模式：先定位锚点，再替换锚点前/后内容。
  const anchor = text.indexOf(find)
  if (!find || anchor < 0) return text
  const before = text.slice(0, anchor)
  const afterAnchor = text.slice(anchor + find.length)
  if (rule.mode === 'after') return before + find + replace
  if (rule.mode === 'before') return replace + text.slice(anchor)
  if (rule.mode === 'afterCount')
    return before + find + replace + graphemes(afterAnchor).slice(count).join('')
  if (rule.mode === 'beforeCount') {
    const beforeChars = graphemes(before)
    return (
      beforeChars.slice(0, Math.max(0, beforeChars.length - count)).join('') +
      replace +
      text.slice(anchor)
    )
  }
  return text
}

/**
 * 计算插入内容的值；无法读取的信息返回条目级错误而不是抛错。
 * @param insert 插入模块配置。
 * @param file 当前文件元数据。
 * @param index 当前条目在列表中的序号（从 0 开始）。
 * @returns 含 value 与 error 的结果。
 */
function insertValue(insert, file, index) {
  if (insert.kind === 'number')
    return {
      value: formatSequence(
        Math.trunc(Number(insert.number)) + index,
        insert.numberStyle,
        insert.numberDigits
      ),
      error: ''
    }
  if (insert.kind === 'text') return { value: String(insert.text ?? ''), error: '' }
  // 文件信息：仅使用宿主已提供或界面预读到的元数据。
  if (insert.info === 'created') return { value: formatDate(file.birthtimeMs), error: '' }
  if (insert.info === 'modified') return { value: formatDate(file.mtimeMs), error: '' }
  if (insert.info === 'size') return { value: humanSize(file.size), error: '' }
  if (insert.info === 'dimensions')
    return Number.isFinite(file.width) && Number.isFinite(file.height)
      ? { value: `${file.width}x${file.height}`, error: '' }
      : { value: '', error: '无法读取图片尺寸' }
  if (insert.info === 'shot')
    return Number.isFinite(file.shotAt)
      ? { value: formatDate(file.shotAt), error: '' }
      : { value: '', error: '无法读取拍摄时间' }
  return { value: '', error: '' }
}

/**
 * 把字节数格式化为便于阅读的大小文本。
 * @param bytes 字节数。
 * @returns 大小文本。
 */
function humanSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(1)}${units[unit]}`
}

/**
 * 把插入内容按位置写入主文件名，保留扩展名。
 * @param stem 主文件名。
 * @param wrapped 已套用前后缀的插入内容。
 * @param position 插入位置。
 * @param positionIndex 指定位置的起始序号（从 1 开始）。
 * @returns 写入后的主文件名。
 */
function applyInsert(stem, wrapped, position, positionIndex) {
  if (position === 'end') return stem + wrapped
  if (position === 'index') {
    const chars = graphemes(stem)
    const at = Math.max(0, Math.min(chars.length, Math.trunc(Number(positionIndex)) - 1))
    return chars.slice(0, at).join('') + wrapped + chars.slice(at).join('')
  }
  return wrapped + stem
}

/**
 * 校验目标名称是否满足 Windows 命名约束。
 * @param name 目标名称。
 * @returns 是否合法。
 */
export function isValidName(name) {
  return (
    !!name &&
    name.length <= 255 &&
    !ILLEGAL_NAME.test(name) &&
    ![...name].some((char) => char.charCodeAt(0) < 32) &&
    !/^\.{1,2}$/.test(name) &&
    !/[. ]$/.test(name) &&
    !RESERVED_NAME.test(name)
  )
}

/**
 * 按固定模块顺序计算名称预览，不执行任何文件操作。
 * @param files 用户选择的文件元数据列表。
 * @param workflow 各标签页的规则配置。
 * @returns 带 newName 与 error 的预览条目列表。
 */
export function applyRenameModules(files, workflow) {
  const config = workflow || {}
  return (files || []).map((file, index) => {
    let name = file.name
    let error = ''
    try {
      let [stem, ext] = parts(file.name, file.isDirectory)
      const numbering = config.numbering
      if (numbering?.enabled) {
        // 自动编号用「前面字符 + 序号 + 后面字符」整体替换主文件名。
        const sequence = formatSequence(
          Math.trunc(Number(numbering.start)) + index,
          numbering.style,
          numbering.digits
        )
        stem = `${numbering.prefix ?? ''}${sequence}${numbering.suffix ?? ''}`
      }
      const replace = config.replace
      if (replace?.enabled) {
        for (const rule of (replace.rules || []).filter((item) => item.enabled)) {
          stem = applyReplace(stem, rule)
          // 勾选后，普通替换规则同样作用于扩展名。
          if (replace.replaceExtension && !file.isDirectory && rule.mode === 'normal' && rule.find)
            ext = ext.split(rule.find).join(String(rule.replace ?? ''))
        }
      }
      const clean = config.clean
      if (clean?.enabled) {
        if (clean.case?.enabled) stem = applyCase(stem, clean.case.mode)
        if (clean.sanitize?.enabled) stem = sanitizeName(stem, clean.sanitize)
        if (clean.extension?.enabled && !file.isDirectory)
          ext = String(clean.extension.value ?? '').replace(/^\./, '')
        if (clean.remove?.enabled)
          for (const rule of (clean.remove.rules || []).filter((item) => item.enabled))
            stem = removeChars(stem, rule)
      }
      const insert = config.insert
      if (insert?.enabled) {
        const info = insertValue(insert, file, index)
        if (info.error) error = info.error
        else {
          const wrapped = `${insert.prefix ?? ''}${info.value}${insert.suffix ?? ''}`
          stem = applyInsert(stem, wrapped, insert.position, insert.index)
        }
      }
      name = stem + (ext ? '.' + ext : '')
      // 仅在前序步骤未产生错误时再做最终合法性校验。
      if (!error && !isValidName(name)) error = '文件名无效'
    } catch (failure) {
      error = failure.message
    }
    return { ...file, newName: name, error }
  })
}

export { graphemes, formatDate, humanSize }
