/**
 * 为外部组件和系统错误提供中文说明；技术原文保留在开发日志供诊断。
 * @param value 已知或外部返回的提示文本。
 * @returns 可直接展示的中文提示，保留中文正文、文件名及技术缩写。
 */
export function localizePresentationMessage(value: string): string {
  const message = value.replace(/^Error:\s*/i, '').trim()
  if (/Project video file not found:|项目.*素材.*不存在/.test(message)) return '项目引用的素材已删除或移动，请将素材恢复到原路径，或删除不再需要的项目。'
  if (/ENOENT|no such file|not found|does not exist/i.test(message)) return '找不到所需文件，可能已被移动或删除。请检查原位置；如从系统回收站还原，请将文件放回原路径后重试。'
  if (/EACCES|EPERM|permission denied|access denied/i.test(message)) return '无法访问文件或保存位置，请检查目录权限后重试。'
  if (/EBUSY|sharing violation|being used/i.test(message)) return '文件正在被其他程序使用，请关闭占用后重试。'
  if (/ENOSPC|disk full/i.test(message)) return '磁盘空间不足，请清理空间后重试。'
  if (/cancelled|canceled/i.test(message) && !/[\u3400-\u9fff]/.test(message)) return '操作已取消。'
  if (!message) return '操作未能完成，请重试。'
  if (/[\u3400-\u9fff]/.test(message)) {
    if (/\b(failed|could not|invalid|unavailable|not available|timed out)\b/i.test(message)) {
      console.warn('演示工具原始故障：', value)
      const heading = message.split(/[：:\n]/, 1)[0].trim().replace(/[。！!]+$/, '')
      return /[A-Za-z]/.test(heading)
        ? '操作未能完成，请检查文件、设备或保存位置后重试。'
        : `${heading}。请检查文件、设备或保存位置后重试。`
    }
    return message
  }
  // 格式、快捷键与文件名不是待翻译文案；只收束无法预知的英文故障句子。
  if (/^(?:MP4|GIF|WebM|MOV|PNG|JPEG|JPG|WEBP|NVIDIA CUDA|WebGPU|CPU|GPU|0x[0-9a-f]+)$/i.test(message)
    || /\.(?:mp4|webm|mov|gif|png|jpe?g|webp|recordly)$/i.test(message)
    || /^(?:Ctrl|Alt|Shift|Meta|Cmd)(?:[ +A-Za-z0-9]+)$/.test(message)) return message
  console.warn('演示工具原始提示：', value)
  return '操作未能完成，请检查文件、设备或保存位置后重试。'
}
