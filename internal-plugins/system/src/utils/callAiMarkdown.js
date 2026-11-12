import { buildReplyDiagram, buildReplyHtml } from './callAiReplyBlocks'

export const maxRichReplyLength = 64000

/**
 * 在原位置重建静态块并启用会话已登记的链接。
 * @param {string} html Worker 生成的正文。
 * @param {Function} findKnownPath 当前会话的本地路径匹配函数。
 * @returns {string} 重建后的正文 HTML。
 */
export function prepareCallAiReply(html, findKnownPath) {
  if (!/data-reply-(?:href|block)=/.test(html)) return html
  const template = document.createElement('template')
  template.innerHTML = html
  for (const block of template.content.querySelectorAll('pre[data-reply-block]')) {
    const kind = block.dataset.replyBlock
    const source = block.textContent
    delete block.dataset.replyBlock
    if (source.length > 24000) continue
    if (kind === 'html') {
      const content = buildReplyHtml(source)
      if (content) block.replaceWith(content)
    } else if (kind === 'svg') {
      const svg = buildReplyDiagram(source)
      if (!svg) continue
      const figure = document.createElement('figure')
      figure.className = 'reply-diagram'
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.exportDiagram = ''
      button.textContent = '导出 SVG'
      figure.append(svg, button)
      block.replaceWith(figure)
    }
  }
  for (const anchor of template.content.querySelectorAll('a[data-reply-href]')) {
    const href = anchor.dataset.replyHref
    delete anchor.dataset.replyHref
    const local = href && findKnownPath(href)
    if (!local && !/^https?:\/\//i.test(href)) continue
    anchor.className = 'accent-link'
    anchor.setAttribute('href', local ? '#local-link' : href)
    anchor.dataset.linkTarget = local?.value || href
    if (local) anchor.dataset.localLink = 'true'
    else {
      anchor.rel = 'noreferrer'
      anchor.target = '_blank'
    }
  }
  return template.innerHTML
}

const replyMarkup = new WeakMap()

/**
 * 追加已完成的 Markdown 块或更新被新内容改写的正文。
 * @param {HTMLElement} element 当前回复正文。
 * @param {{value:{html:string,formulas:string[],onLayout:Function}}} binding 受控正文和 Worker 结果。
 * @returns {void} 无返回值。
 */
function mountReplyMarkup(element, { value: { html, formulas, onLayout } }) {
  let state = replyMarkup.get(element)
  if (state?.html === html) return
  const appending = state && html.startsWith(state.html)
  const template = document.createElement('template')
  template.innerHTML = appending ? html.slice(state.html.length) : html
  const pending = template.content.querySelectorAll('[data-reply-math]')
  if (!appending) {
    releaseReplyMarkup(element)
    element.replaceChildren()
    state = { html, formulas, pending: [], index: 0, total: 0, frame: 0, onLayout }
    replyMarkup.set(element, state)
  }
  state.html = html
  state.formulas = formulas
  state.pending.push(...pending)
  state.total += pending.length
  // 密集回复只让可见附近的段落参与布局，缩放时也不重排全部公式。
  element.classList.toggle('reply-dense', state.total > 100)
  element.append(template.content)
  if (!state.frame && state.index < state.pending.length)
    state.frame = requestAnimationFrame(() => paintFormulas(state))
}

/**
 * 按帧写入有限数量的 MathML，给滚动和输入留出处理时间。
 * @param {object} state 当前回复的待挂载公式。
 * @returns {void} 无返回值。
 */
function paintFormulas(state) {
  const end = Math.min(state.pending.length, state.index + 32)
  const deadline = performance.now() + 4
  do {
    const node = state.pending[state.index++]
    const mathml = state.formulas[Number(node.dataset.replyMath)]
    if (mathml) node.innerHTML = mathml
    delete node.dataset.replyMath
  } while (state.index < end && performance.now() < deadline)
  state.onLayout()
  if (state.index < state.pending.length) {
    state.frame = requestAnimationFrame(() => paintFormulas(state))
  } else {
    state.pending.length = 0
    state.index = 0
    state.frame = 0
  }
}

/**
 * 回复替换或窗口退出时取消未完成的公式挂载。
 * @param {HTMLElement} element 当前回复正文。
 * @returns {void} 无返回值。
 */
function releaseReplyMarkup(element) {
  const state = replyMarkup.get(element)
  if (state) cancelAnimationFrame(state.frame)
  replyMarkup.delete(element)
}

export const callAiReplyMarkup = {
  mounted: mountReplyMarkup,
  updated: mountReplyMarkup,
  beforeUnmount: releaseReplyMarkup
}
