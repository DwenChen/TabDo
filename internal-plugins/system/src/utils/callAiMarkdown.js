import { buildReplyDiagram, buildReplyHtml } from './callAiReplyBlocks'

export const maxRichReplyLength = 64000

/**
 * 重建静态块，启用已登记的链接，并在原位置收起产物的绝对路径。
 * @param {string} html Worker 生成的正文。
 * @param {Function} findKnownPath 当前会话的本地路径匹配函数。
 * @param {object[]} artifacts 当前回复收到的产物。
 * @param {Set<string>} linked 已在正文提供入口的产物标识。
 * @param {Map<string,object>} generated 当前窗口登记的全部产物。
 * @returns {string} 重建后的正文 HTML。
 */
export function prepareCallAiReply(html, findKnownPath, artifacts, linked, generated) {
  if (!generated.size && !/data-reply-(?:href|block)=/.test(html)) return html
  const template = document.createElement('template')
  template.innerHTML = html
  const names = artifactNames(artifacts)
  for (const anchor of template.content.querySelectorAll('a[data-reply-href]')) {
    const href = anchor.dataset.replyHref
    delete anchor.dataset.replyHref
    const local = findKnownPath(href)
    const artifact = local ? generated.get(local.id) : names.get(href.toLowerCase())
    if (artifact) {
      const label = anchor.textContent.trim()
      anchor.replaceWith(
        artifactMarkup(
          artifact,
          linked,
          /^(?:file:|[a-z]:|[/\\])/i.test(label) ? artifact.name : label
        )
      )
    } else if (local || /^https?:\/\//i.test(href)) {
      anchor.className = 'accent-link'
      anchor.setAttribute('href', local ? '#local-link' : href)
      anchor.dataset.linkTarget = local?.value || href
      if (local) anchor.dataset.localLink = 'true'
      else {
        anchor.rel = 'noreferrer'
        anchor.target = '_blank'
      }
    }
  }
  linkArtifactReferences(template.content, names, linked, generated)
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
  return template.innerHTML
}

/**
 * 将流式末段和降级内容转义，并识别其中的产物引用。
 * @param {string} source 尚未排版的回复。
 * @param {object[]} artifacts 本条回复收到的产物。
 * @param {Set<string>} linked 已在正文提供入口的产物标识。
 * @param {Map<string,object>} generated 当前窗口登记的全部产物。
 * @returns {string} 安全的纯文本及产物链接。
 */
export function preparePlainCallAiReply(source, artifacts, linked, generated) {
  if (!source) return ''
  const template = document.createElement('template')
  template.content.append(source)
  linkArtifactReferences(template.content, artifactNames(artifacts), linked, generated)
  return template.innerHTML
}

/**
 * 按当前回复的文件名索引产物，同名冲突交由完整路径区分。
 * @param {object[]} artifacts 当前回复收到的产物。
 * @returns {Map<string,object|null>} 文件名与产物的对应关系。
 */
function artifactNames(artifacts) {
  const names = new Map()
  for (const artifact of artifacts) {
    const name = artifact.name.toLowerCase()
    names.set(name, names.has(name) ? null : artifact)
  }
  return names
}

/**
 * 将已登记的完整路径或独立文件名替换为原位链接，保留周围正文和代码。
 * @param {DocumentFragment} content Worker 生成的回复节点。
 * @param {Map<string,object|null>} names 文件名和同名冲突记录。
 * @param {Set<string>} linked 已在正文提供入口的产物标识。
 * @param {Map<string,object>} generated 当前窗口登记的全部产物。
 * @returns {void} 就地更新正文节点。
 */
function linkArtifactReferences(content, names, linked, generated) {
  if (!generated.size) return
  const references = new Map([...names].filter(([, artifact]) => artifact))
  for (const artifact of generated.values()) {
    const slashes = artifact.path.replaceAll('\\', '/')
    const uri =
      (/^[a-z]:/i.test(slashes) ? 'file:///' : slashes.startsWith('//') ? 'file:' : 'file://') +
      slashes
    const encoded = uri
      .split('/')
      .map((part, index) =>
        index === 0 || /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)
      )
      .join('/')
    for (const variant of [artifact.path, slashes, uri, encoded]) {
      references.set(variant.toLowerCase(), artifact)
    }
  }
  const alternatives = [...references.keys()]
    .sort((left, right) => right.length - left.length)
    .map((reference) => reference.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'))
  // 先匹配完整路径，同时避免把更长文件名或未登记路径的末段误认成产物。
  const pattern = new RegExp(
    '(?<![\\p{L}\\p{N}_./\\\\-])(?:' +
      alternatives.join('|') +
      ')(?![\\p{L}\\p{N}_/\\\\-]|\\.[\\p{L}\\p{N}])',
    'giu'
  )
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    if (node.parentElement?.closest('a, button, .reply-code-bar')) continue
    const block = node.parentElement?.closest('pre')
    const code = block || node.parentElement?.closest('code')
    if (code) {
      const artifact = references.get(code.textContent.trim().toLowerCase())
      // 只含路径的代码格式可以去掉，保留完整代码示例及其复制功能。
      if (artifact && !block?.hasAttribute('data-reply-block')) {
        const target = block?.closest('.reply-code') || code
        target.replaceWith(artifactMarkup(artifact, linked))
      }
      continue
    }
    let replacement
    let end = 0
    for (const match of node.data.matchAll(pattern)) {
      const artifact = references.get(match[0].toLowerCase())
      if (!artifact) continue
      replacement ??= document.createDocumentFragment()
      replacement.append(node.data.slice(end, match.index), artifactMarkup(artifact, linked))
      end = match.index + match[0].length
    }
    if (replacement) {
      replacement.append(node.data.slice(end))
      node.replaceWith(replacement)
    }
  }
}

/**
 * 生成产物链接，首次出现时在旁边提供定位按钮。
 * @param {{id:string,name:string,path:string}} artifact 宿主登记的产物。
 * @param {Set<string>} linked 已在正文提供入口的产物标识。
 * @param {string} label 模型给出的链接文字，默认使用文件名。
 * @returns {HTMLElement} 可插入正文的链接或操作组。
 */
function artifactMarkup(artifact, linked, label = artifact.name) {
  const anchor = document.createElement('a')
  anchor.textContent = label || artifact.name
  anchor.className = 'accent-link'
  anchor.setAttribute('href', '#local-link')
  anchor.dataset.linkTarget = artifact.path
  anchor.dataset.localLink = 'true'
  anchor.dataset.openArtifact = artifact.id
  if (linked.has(artifact.id)) return anchor
  const reveal = document.createElement('button')
  reveal.type = 'button'
  reveal.className = 'artifact-reveal'
  reveal.title = '在文件夹中显示'
  reveal.setAttribute('aria-label', '在文件夹中显示 ' + artifact.name)
  reveal.dataset.revealArtifact = artifact.id
  const actions = document.createElement('span')
  actions.className = 'artifact-actions'
  actions.append(anchor, reveal)
  linked.add(artifact.id)
  return actions
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
