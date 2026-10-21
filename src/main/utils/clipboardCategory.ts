export type ClipboardCategory = 'text' | 'code' | 'link' | 'image' | 'file'

/**
 * 识别纯图片文件组，保留文件载荷以继续支持资源管理器粘贴。
 * @param files 剪贴板文件组。
 * @returns 非空且全部为受支持图片文件时为真。
 */
export function isClipboardImageFiles(files?: { path: string; isDirectory?: boolean }[]): boolean {
  return (
    !!files?.length &&
    files.every(
      (file) => !file.isDirectory && /\.(?:png|jpe?g|gif|bmp|webp|ico|avif|tiff?)$/i.test(file.path)
    )
  )
}

/**
 * 用有界的同步规则识别文本类别，避免对完整历史反复运行语言自动检测。
 * @param content 剪贴板原始文本。
 * @returns 文本、代码或链接类别。
 */
export function classifyClipboardText(content: string): 'text' | 'code' | 'link' {
  // 仅将完整的 HTTP(S) 地址或 www 地址归为链接，防止将任意协议作为可执行链接。
  const text = content.trim()
  if (/^(?:https?:\/\/|www\.)[^\s<>]+$/i.test(text)) {
    try {
      const url = new URL(/^www\./i.test(text) ? `https://${text}` : text)
      if (url.hostname.includes('.')) return 'link'
    } catch {
      /* 地址无效时继续按文本判断。 */
    }
  }
  // 限制检测长度；强语法特征支持常见脚本、JSON、SQL、HTML 和硬件描述语言。
  const sample = text.slice(0, 12000)
  if (
    /^```[\w+-]*\s*\n[\s\S]*\n```$/.test(sample) ||
    /^(?:\s*)(?:import\s.+from\s|(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(|(?:const|let|var)\s+\w+\s*=|(?:async\s+)?def\s+\w+\s*\(|class\s+\w+\s*[:{]|#include\s*[<"]|module\s+\w+\s*[#(;]|SELECT\s.+\sFROM\s|(?:public|private|protected)\s+(?:static\s+)?\w+\s+\w+\s*\()/im.test(
      sample
    ) ||
    /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*<\/\1>/i.test(sample) ||
    (/^[{[]\s*["{[]/.test(sample) && /[}\]]$/.test(text))
  )
    return 'code'
  return 'text'
}
