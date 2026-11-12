import katex from 'katex'
import { Marked, Tokenizer } from 'marked'
import highlighter from '../vendor/highlight.min'

import { maxRichReplyLength } from '../utils/callAiMarkdown'

/**
 * 转义将写入正文或 HTML 属性的文本。
 * @param {string} value 普通文本。
 * @returns {string} 可插入 HTML 的文本。
 */
function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  )
}

/**
 * 跳过外部图片和任务列表中的控件。
 * @returns {string} 空标记。
 */
function ignoreUnsupportedMarkup() {
  return ''
}

/**
 * 输出仅含转义文本的占位块，正文线程再按白名单构建可见节点。
 * @param {string} kind 区分 SVG 和静态 HTML。
 * @param {string} text 完整块源码。
 * @returns {string} 惰性 HTML。
 */
function embedBlock(kind, text) {
  return '<pre data-reply-block="' + kind + '"><code>' + escapeHtml(text) + '</code></pre>'
}

const formulas = []
const formulaIndexes = new Map()
let formulaWrappers = 0
let codeBudget = 24000
let renderedTokens = []
let renderedHtml = ''
let renderedLinks = ''

const parser = new Marked().setOptions({ breaks: true }).use({
  renderer: {
    /**
     * 标记独立 HTML 和 SVG 块，在正文原位置按白名单重建。
     * @param {object} token Marked 的原始标记。
     * @returns {string} 惰性占位块，或空字符串。
     */
    html({ text, block }) {
      if (!block || !text.trim()) return ''
      return embedBlock(/^\s*<svg[\s>]/i.test(text) ? 'svg' : 'html', text.trimEnd())
    },
    image: ignoreUnsupportedMarkup,
    checkbox: ignoreUnsupportedMarkup,
    /**
     * 先输出惰性链接，由聊天窗口校验并启用目标地址。
     * @param {object} token Marked 链接标记。
     * @returns {string} HTML 及待校验的地址。
     */
    link({ href, tokens }) {
      return (
        '<a data-reply-href="' + escapeHtml(href) + '">' + this.parser.parseInline(tokens) + '</a>'
      )
    },
    /**
     * 生成可复制的代码块，只为有限长度的代码调用高亮库。
     * @param {object} token Marked 代码块标记。
     * @returns {string} 经过转义的代码面板。
     */
    code({ text, lang }) {
      const language = lang?.trim().split(/\s/, 1)[0]
      const known = /^[\w+#.-]{1,30}$/.test(language || '') ? language : ''
      if (['svg', 'html'].includes(known.toLowerCase()))
        return embedBlock(known.toLowerCase(), text)
      let code = escapeHtml(text)
      if (known && highlighter.getLanguage(known) && text.length <= codeBudget) {
        codeBudget -= text.length
        // 高亮失败时保留原始代码及复制按钮。
        try {
          code = highlighter.highlight(text, { language: known, ignoreIllegals: true }).value
        } catch {
          // 保留已转义的代码。
        }
      }
      return (
        '<div class="reply-code"><div class="reply-code-bar"><span>' +
        (known || '代码') +
        '</span><button type="button" class="copy-reply-code" aria-label="复制代码">复制</button></div><pre><code>' +
        code +
        '</code></pre></div>'
      )
    }
  },
  tokenizer: {
    /**
     * 识别紧跟汉字且以书名号等标点开头的粗体。
     * @param {string} source 尚未分词的正文。
     * @param {string} masked 已屏蔽代码等内容的扫描文本。
     * @param {string} previous 分隔符前一个字符。
     * @returns {*} 匹配到的标记，或交回默认分词器。
     */
    emStrong(source, masked, previous) {
      if (!/\p{Script=Han}/u.test(previous || '') || !/^\*\*[\p{Ps}\p{Pi}]/u.test(source))
        return false
      return Tokenizer.prototype.emStrong.call(this, source, masked, ' ') ?? false
    }
  },
  extensions: [
    {
      name: 'displayMath',
      level: 'block',
      start: (text) => text.search(/(?:^|\n) {0,3}(?:\$\$|\\\[)/),
      tokenizer: (text) => mathToken(text, true),
      renderer: formula
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start: (text) => text.search(/\$|\\\(/),
      tokenizer: (text) => mathToken(text, false),
      renderer: formula
    }
  ]
})

/**
 * 给每个公式生成紧凑 MathML。单个公式异常时仍保留它的 TeX。
 * @param {object} token 已分词的 TeX 公式。
 * @returns {string} 等待分批显示的公式占位符。
 */
function formula(token) {
  const tag = token.type === 'displayMath' ? 'div' : 'span'
  const className = token.display ? 'math-display' : 'math-inline'
  const raw = escapeHtml(token.raw.trim())
  const key = (token.display ? 'block:' : 'inline:') + token.text
  let index = formulaIndexes.get(key)
  if (index === undefined) {
    index = -1
    try {
      // 常见公式使用紧凑的 MathML，框线类命令保留 KaTeX 的 HTML 外观。
      const mathml = katex.renderToString(token.text, {
        output: /\\(?:boxed|fbox|cancel|bcancel|xcancel|sout)\b/.test(token.text)
          ? 'htmlAndMathml'
          : 'mathml',
        displayMode: token.display,
        trust: false,
        strict: 'ignore',
        maxExpand: 200,
        maxSize: 20
      })
      // 限制单个异常公式的 DOM 开销，后面的公式仍按原顺序处理。
      if (mathml.length <= 48000) index = formulas.push(mathml) - 1
    } catch {
      // 仅当前公式回退到原文。
    }
    formulaIndexes.set(key, index)
  }
  const attr = index >= 0 ? ' data-reply-math="' + index + '"' : ''
  const wrapper = '<' + tag + ' class="' + className + '"' + attr + '>'
  const close = '</' + tag + '>'
  formulaWrappers += wrapper.length + close.length
  return wrapper + raw + close
}

/**
 * 排版完整 Markdown 块，流式期间保留尚未完成的末块。
 * @param {string} source 当前已收到的回复。
 * @param {boolean} final 是否已收到该段回复的结束事件。
 * @returns {{html:string,formulas:string[],tail:string}|null} 已排版正文和仍在生成的文字。
 */
function renderCallAiMarkdown(source, final) {
  if (source.length > maxRichReplyLength) return null
  const normalized = source.replace(/\r\n?/g, '\n')
  const tokens = parser.lexer(final ? normalized.trimEnd() : normalized)
  const last = tokens.findLastIndex((token) => token.type !== 'space')
  const end = final || isCompleteBlock(tokens[last], normalized) ? tokens.length : Math.max(0, last)
  const links = JSON.stringify(tokens.links)
  // 引用定义和未定型的列表等可能改变之前的解释；仅重用仍等价的前缀。
  if (
    links !== renderedLinks ||
    renderedTokens.length > end ||
    !renderedTokens.every(
      (token, index) =>
        token.type === tokens[index].type &&
        (token.type === 'space' || token.raw === tokens[index].raw)
    )
  ) {
    renderedHtml = ''
    renderedTokens = []
    formulaWrappers = 0
    codeBudget = 24000
  }
  const appended = tokens.slice(renderedTokens.length, end)
  if (appended.length) renderedHtml += parser.parser(appended)
  renderedTokens = tokens.slice(0, end)
  renderedLinks = links
  if (renderedHtml.length - formulaWrappers > 380000 || (final && !renderedHtml.trim())) return null
  const tail = final
    ? ''
    : tokens
        .slice(end)
        .map((token) => token.raw)
        .join('')
  return { html: renderedHtml, formulas, tail }
}

/**
 * 判断末块是否已有结束边界，未闭合的代码围栏仍显示原文。
 * @param {object|undefined} token 最后一个非空白 Markdown 标记。
 * @param {string} source 当前回复。
 * @returns {boolean} 当前末块是否可提前排版。
 */
function isCompleteBlock(token, source) {
  if (!token) return false
  if (token.type === 'displayMath' || token.type === 'hr') return true
  if (token.type === 'paragraph') return /\n[ \t]*\n[ \t]*$/.test(source)
  if (token.type === 'heading') return /\n$/.test(source)
  if (token.type !== 'code') return false
  const opening = /^ {0,3}(\x60{3,}|~{3,})[^\n]*\n/.exec(token.raw)
  if (!opening) return false
  const fence = opening[1]
  return new RegExp(
    '(?:^|\\n) {0,3}' + fence[0] + '{' + fence.length + ',}[ \\t]*(?:\\n[ \\t]*)*$'
  ).test(token.raw.slice(opening[0].length))
}

/**
 * 识别有闭合符的 TeX，保留货币、转义和未完成的流式正文。
 * @param {string} source Marked 尚未消费的文本。
 * @param {boolean} block 当前是否处于块级分词。
 * @returns {object|undefined} 匹配结果。
 */
function mathToken(source, block) {
  const match = block
    ? /^ {0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/.exec(source)
    : /^(?:\$\$([^\n]+?)\$\$|\\\[([^\n]+?)\\\]|\\\((.+?)\\\)|\$(?![\s$])((?:\\.|[^\\$\n])+?)\$(?![\d$]))/.exec(
        source
      )
  if (!match) return
  const text = match
    .slice(1)
    .find((value) => value !== undefined)
    ?.trim()
  if (
    !text ||
    text.length > 8000 ||
    (match[4] && (/\s\$/.test(match[0]) || /^\d+(?:[.,]\d+)?\s+[\p{L}]/u.test(text)))
  )
    return
  return {
    type: block ? 'displayMath' : 'inlineMath',
    raw: match[0],
    text,
    display: block || match[1] !== undefined || match[2] !== undefined
  }
}

/**
 * 排版来自当前聊天的纯文本，错误时保留原文。
 * @param {MessageEvent<{source:string,final:boolean}>} event 回复快照及结束标记。
 * @returns {void} 将排版结果送回聊天。
 */
function renderReply(event) {
  try {
    self.postMessage(renderCallAiMarkdown(event.data.source, event.data.final))
  } catch {
    self.postMessage(null)
  }
}
self.onmessage = renderReply
