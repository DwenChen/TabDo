const list = document.getElementById('words')
const count = document.getElementById('count')
const hint = document.getElementById('hint')
const empty = document.getElementById('empty')
const statusElement = document.getElementById('status')
const copyButton = document.getElementById('copy')
const baseHint = hint.textContent
let words = []
let buttons = []
const selected = new Set()
let statusTimer = null

/**
 * 显示限时反馈，连续触发时从最后一次操作重新计时。
 * @param {string} message 操作结果。
 * @param {boolean} error 是否为错误。
 * @returns {void} 无返回值。
 */
function status(message, error = false) {
  clearTimeout(statusTimer)
  statusElement.textContent = message
  statusElement.classList.toggle('error', error)
  // 提示到期清除，保留底部行高以免按钮位置跳动。
  statusTimer = setTimeout(
    () => {
      statusElement.textContent = ''
      statusElement.classList.remove('error')
      statusTimer = null
    },
    error ? 4000 : 3000
  )
}

/**
 * 同步选中数量和按钮状态，不重建词语节点。
 * @returns {void} 无返回值。
 */
function updateState() {
  buttons.forEach((button, index) =>
    button.setAttribute('aria-pressed', String(selected.has(index)))
  )
  count.textContent = words.length ? `已选 ${selected.size} / ${words.length}` : ''
  copyButton.disabled = !selected.size
}

/**
 * 切换单个词语的选择状态。
 * @param {number} index 词语序号。
 * @returns {void} 无返回值。
 */
function toggle(index) {
  if (selected.has(index)) selected.delete(index)
  else selected.add(index)
  updateState()
}

/**
 * 按原文顺序拼接选中的词语；英文和数字之间保留空格，连续中文直接拼接。
 * @returns {string} 可直接写入剪贴板的词语文本；未选择时为空字符串。
 */
function selectedText() {
  const picked = words.filter((_, index) => selected.has(index))
  let text = ''
  picked.forEach((word, index) => {
    if (!index) {
      text = word
      return
    }
    // 只有两侧都是中文等非 ASCII 词时才不加空格，避免把英文词粘在一起。
    const previous = picked[index - 1]
    const needsSpace = /[A-Za-z0-9]$/.test(previous) || /^[A-Za-z0-9]/.test(word)
    text += (needsSpace ? ' ' : '') + word
  })
  return text
}

/**
 * 复制指定文本并反馈结果。
 * @param {string} text 待写入剪贴板的文本。
 * @param {string} label 成功提示中的内容说明。
 * @returns {Promise<void>} 复制完成后更新提示。
 */
async function copyText(text, label) {
  if (!text) return
  try {
    const result = await window.wordPicker.copy(text)
    if (result?.success) status(`已复制${label}`)
    else status(result?.error || '复制失败', true)
  } catch (error) {
    status(String(error.message || error), true)
  }
}

/**
 * 渲染一组词语，并重置本次选择。
 * @param {object} payload 主进程提供的正文快照。
 * @returns {void} 无返回值。
 */
function render(payload) {
  words = Array.isArray(payload?.words) ? payload.words : []
  selected.clear()
  buttons = []
  const fragment = document.createDocumentFragment()
  words.forEach((word, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'word'
    button.textContent = word
    button.setAttribute('aria-pressed', 'false')
    button.title = '点选加入选择，双击直接复制'
    button.addEventListener('click', () => toggle(index))
    button.addEventListener('dblclick', () => {
      void copyText(word, `“${word}”`)
    })
    buttons.push(button)
    fragment.appendChild(button)
  })
  list.replaceChildren(fragment)
  empty.hidden = !!words.length
  hint.textContent = payload?.truncated
    ? `${baseHint}；文本较长，仅显示前 ${words.length} 个词`
    : baseHint
  updateState()
}

copyButton.addEventListener('click', () => {
  const text = selectedText()
  if (text) void copyText(text, ` ${selected.size} 个词`)
})
document.getElementById('close').onclick = () => window.wordPicker.close()
document.onkeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    window.wordPicker.close()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    if (selected.size === words.length) selected.clear()
    else words.forEach((_, index) => selected.add(index))
    updateState()
    return
  }
  if (event.key === 'Enter' && selected.size) {
    event.preventDefault()
    copyButton.click()
  }
}
window.addEventListener(
  'beforeunload',
  () => {
    clearTimeout(statusTimer)
    statusTimer = null
    words.length = 0
    buttons = []
    selected.clear()
  },
  { once: true }
)
window.wordPicker.onData(render)
