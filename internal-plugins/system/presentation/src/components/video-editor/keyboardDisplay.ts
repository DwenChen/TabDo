import type { AnnotationRegion, CursorTelemetryPoint } from "./types";
import { DEFAULT_ANNOTATION_STYLE } from "./types";

export const DEFAULT_KEYBOARD_STYLE: AnnotationRegion['style'] = {
  ...DEFAULT_ANNOTATION_STYLE,
  keycapStyle: 'simple',
  keycapScale: 1,
  enterAnimation: 'none',
  exitAnimation: 'none',
  connectInputs: true,
  inputGapMs: 800,
  backgroundColor: '#171717dd',
  color: '#ffffff',
  fontFamily: 'Arial',
  fontSize: 52,
  borderRadius: 12
};

/**
 * Resolve shared keycap edges and shadows for DOM previews and canvas exports.
 * @param style Selected keyboard preset identifier.
 * @returns Border and shadow parameters in output pixels.
 */
export function getKeycapDecoration(style: AnnotationRegion["style"]["keycapStyle"]): { borderColor: string; borderWidth: number; shadowColor: string; shadowBlur: number; shadowOffsetY: number } {
  switch (style) {
    case "apple": return { borderColor: "#b7b7b7", borderWidth: 2, shadowColor: "#929292", shadowBlur: 2, shadowOffsetY: 5 };
    case "clay": return { borderColor: "#ede9fe", borderWidth: 3, shadowColor: "#8b75b8", shadowBlur: 5, shadowOffsetY: 8 };
    case "mechanical": return { borderColor: "#fbbf24", borderWidth: 2, shadowColor: "#111111", shadowBlur: 1, shadowOffsetY: 8 };
    case "rgb": return { borderColor: "#e879f9", borderWidth: 3, shadowColor: "#22d3ee", shadowBlur: 14, shadowOffsetY: 0 };
    default: return { borderColor: "#ffffff66", borderWidth: 2, shadowColor: "#00000088", shadowBlur: 4, shadowOffsetY: 5 };
  }
}

/**
 * Turn captured keystrokes into editable timed overlays, preserving each physical event.
 * @param samples - Keyboard samples already mapped to the edited timeline.
 * @param durationMs - End of the timeline.
 * @param trackIndex - Destination annotation track.
 * @returns Independently editable physical key display annotations.
 */
export function buildKeyboardAnnotations(samples: CursorTelemetryPoint[], durationMs: number, trackIndex: number): AnnotationRegion[] {
  const keys = samples.filter((sample) => typeof sample.keyText === 'string' && sample.keyText.length > 0).sort((a, b) => a.timeMs - b.timeMs);
  return keys.filter((sample) => sample.timeMs < durationMs).map((sample, index) => {
    const text = sample.keyText!;
    const content = text;
    return { id: `keys-${Math.round(sample.timeMs)}-${index}`, type: "keystroke", keystrokeVersion: 1, content, textContent: content, startMs: Math.round(sample.timeMs), endMs: Math.max(Math.round(sample.timeMs) + 1, Math.min(durationMs, keys[index + 1]?.timeMs ?? sample.timeMs + 1500, sample.timeMs + 1500)), position: { x: 25, y: 82 }, size: { width: 50, height: 10 }, style: { ...DEFAULT_KEYBOARD_STYLE }, zIndex: 100 + index, trackIndex };
  });
}

/**
 * 统一选择当前注释；同轨按键只呈现最新片段，并按用户阈值连接相邻输入。
 * @param annotations 完整片段，包含当前时间之前的输入。
 * @param timeMs 当前媒体时间。
 * @returns 可直接交给预览或导出的片段；原片段内容和时长不变。
 */
export function resolveDisplayAnnotations(annotations: AnnotationRegion[], timeMs: number): AnnotationRegion[] {
  const active = annotations.filter(a => timeMs >= a.startMs && timeMs < a.endMs)
  const result = active.filter(a => a.type !== 'keystroke')
  const tracks = new Set(active.filter(a => a.type === 'keystroke').map(a => a.trackIndex ?? 0))
  for (const track of tracks) {
    const keys = annotations.filter(a => a.type === 'keystroke' && (a.trackIndex ?? 0) === track).sort((a, b) => a.startMs - b.startMs || a.zIndex - b.zIndex)
    const current = active.filter(a => a.type === 'keystroke' && (a.trackIndex ?? 0) === track).sort((a, b) => b.startMs - a.startMs || b.zIndex - a.zIndex)[0]
    const index = keys.indexOf(current)
    let first = index
    const gap = Math.max(0, Math.min(5000, current.style.inputGapMs ?? 800))
    if (current.style.connectInputs !== false) {
      while (first > 0 && index - first < 11 && keys[first].startMs - keys[first - 1].startMs <= gap && keys[first].startMs <= keys[first - 1].endMs + gap) first--
    }
    let last = index
    if (current.style.connectInputs !== false) {
      while (last + 1 < keys.length && last - index < 11 && keys[last + 1].startMs - keys[last].startMs <= gap) last++
    }
    // 连接输入沿用整组进出场，避免每个新键都令前一组闪退再弹出。
    result.push({ ...current, startMs: keys[first].startMs, endMs: keys[last].endMs, content: keys.slice(first, index + 1).map((a, offset) => {
      const previous = keys[first + offset - 1]
      // 旧项目曾把连续字符累积到内容中；只在连接呈现时提取增量，磁盘原文不变。
      return first + offset > first && a.keystrokeVersion !== 1 && previous && !KEY_LEGENDS[a.content] && !a.content.includes(' + ') && previous.content.length > 0 && a.content.length > previous.content.length && a.content.startsWith(previous.content)
        ? a.content.slice(previous.content.length) : a.content
    }).join('\u001f') })
  }
  return result
}

const KEY_LEGENDS: Record<string, string> = {
  Space: '␣', Spacebar: '␣', ' ': '␣', Enter: '↵', Return: '↵', Backspace: '⌫', Delete: '⌦',
  Tab: '⇥', Escape: 'Esc', Esc: 'Esc', Shift: '⇧', Ctrl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt',
  Meta: '⊞', Win: '⊞', Command: '⌘', ArrowUp: '↑', Up: '↑', ArrowDown: '↓', Down: '↓',
  ArrowLeft: '←', Left: '←', ArrowRight: '→', Right: '→', CapsLock: '⇪', Home: '↖', End: '↘',
  PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', NumLock: 'Num', ScrollLock: 'ScrLk', PrintScreen: 'PrtSc', Pause: 'Pause', ContextMenu: '☰',
  Minus: '−', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backquote: '`',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9', NumpadAdd: '+', NumpadSubtract: '−', NumpadMultiply: '×', NumpadDivide: '÷', NumpadEnter: '↵', NumpadDecimal: '.',
  NumpadEnd: '↘', NumpadArrowDown: '↓', NumpadPageDown: 'PgDn', NumpadArrowLeft: '←', NumpadArrowRight: '→', NumpadHome: '↖', NumpadArrowUp: '↑', NumpadPageUp: 'PgUp', NumpadInsert: 'Ins', NumpadDelete: '⌦'
}

/**
 * 将捕捉内容分解为实体键帽图例，空白永远有可见符号。
 * @param content 原始单键、组合键或连接输入。
 * @returns 独立键帽符号列表。
 */
export function getKeyLegends(content: string): string[] {
  return content.split('\u001f').flatMap((event, index, events) => {
    const parts = event.includes(' + ') ? event.split(' + ') : [event]
    const next = events[index + 1]?.split(' + ') ?? []
    // 连接显示中，用完整组合键替代紧邻的纯修饰键前缀，原始事件仍单独保存。
    if (parts.every(key => ['Ctrl', 'Alt', 'Meta', 'Shift'].includes(key)) && next.length > parts.length && parts.every(key => next.includes(key))) return []
    return parts.flatMap(key => KEY_LEGENDS[key] ? [KEY_LEGENDS[key]] : /^F\d{1,2}$/.test(key) ? [key] : Array.from(key || ' ').map(c => KEY_LEGENDS[c] ?? c.toUpperCase()))
  }).slice(-32)
}

/**
 * 绘制带高光、键壁与底部投影的实体键帽，按可用框自动适配以保留完整阴影。
 * @param ctx 目标画布。
 * @param annotation 当前按键片段。
 * @param width 可用宽度。
 * @param height 可用高度。
 * @param scaleFactor 作品参考尺寸倍率。
 * @returns 无返回值；只修改目标像素，恢复绘图状态。
 */
export function drawKeycaps(ctx: CanvasRenderingContext2D, annotation: AnnotationRegion, width: number, height: number, scaleFactor: number): void {
  const style = annotation.style, legends = getKeyLegends(annotation.content)
  if (!legends.length || width <= 0 || height <= 0) return
  const font = Math.max(8, style.fontSize * scaleFactor * Math.max(0.25, Math.min(3, style.keycapScale ?? 1)))
  const decoration = getKeycapDecoration(style.keycapStyle)
  const visualScale = font / 52
  const shadowBlur = Math.max(1, decoration.shadowBlur * visualScale)
  const shadowOffset = decoration.shadowOffsetY ? Math.max(1, decoration.shadowOffsetY * visualScale) : 0
  const borderWidth = Math.max(0.75, decoration.borderWidth * visualScale)
  // 按实际阴影和键壁计算留白；小字号及 RGB 光晕也不能被画布边界截断。
  const edge = Math.max(font * 0.22, shadowBlur * 2 + borderWidth + 2)
  ctx.save()
  ctx.font = `600 ${font}px ${style.fontFamily}`
  const padding = font * 0.45, gap = font * 0.18, capHeight = font * 1.5
  const widths = legends.map(key => Math.max(font * (key === '␣' ? 2.4 : 1.05), ctx.measureText(key).width + padding * 2))
  const total = widths.reduce((a, b) => a + b, 0) + gap * (legends.length - 1)
  const fit = Math.min(1, (width - 4) / (total + edge * 2), (height - 4) / (capHeight + edge * 2 + shadowOffset))
  if (fit <= 0) { ctx.restore(); return }
  ctx.translate((width - total * fit) / 2, (height - (capHeight + shadowOffset) * fit) / 2)
  ctx.scale(fit, fit)
  let x = 0
  legends.forEach((key, index) => {
    const w = widths[index], radius = Math.min(style.borderRadius, capHeight * 0.24)
    ctx.save()
    ctx.shadowColor = decoration.shadowColor; ctx.shadowBlur = shadowBlur
    ctx.shadowOffsetY = shadowOffset
    ctx.fillStyle = style.backgroundColor
    ctx.beginPath(); ctx.roundRect(x, 0, w, capHeight, radius); ctx.fill()
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    const shine = ctx.createLinearGradient(0, 0, 0, capHeight)
    shine.addColorStop(0, '#ffffff38'); shine.addColorStop(0.18, '#ffffff10'); shine.addColorStop(0.78, '#00000008'); shine.addColorStop(1, '#00000050')
    ctx.fillStyle = shine; ctx.fill()
    ctx.strokeStyle = decoration.borderColor; ctx.lineWidth = borderWidth; ctx.stroke()
    ctx.fillStyle = style.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(key, x + w / 2, capHeight * 0.47)
    ctx.restore(); x += w + gap
  })
  ctx.restore()
}
