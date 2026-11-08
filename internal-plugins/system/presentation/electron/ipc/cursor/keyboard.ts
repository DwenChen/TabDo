export interface CaptureKeyEvent {
  keycode: number
  keychar?: number
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

const MODIFIERS = ['Ctrl', 'Alt', 'Meta', 'Shift'] as const
type Modifier = (typeof MODIFIERS)[number]

/**
 * 将左右修饰键归并为统一图例，其他物理按键保留原始名称。
 * @param name 原生键码表中的名称。
 * @returns 对应修饰键；普通按键返回 null。
 */
function modifierName(name: string): Modifier | null {
  const canonical = name.replace(/(?:Left|Right)$/, '')
  return MODIFIERS.includes(canonical as Modifier) ? (canonical as Modifier) : null
}

/**
 * 为当前采集订阅建立物理按键解析器，单独修饰键即时响应并保留组合键。
 * @param keyNames 当前平台原生键码表。
 * @returns 处理按下、松开与清理的会话对象；不持有全局钩子或定时器。
 */
export function createKeyboardCapture(keyNames: Record<string, number>) {
  const names = new Map(Object.entries(keyNames).map(([name, code]) => [code, name]))
  const heldModifiers = new Map<number, Modifier>()
  return {
    /**
     * 解析物理按下，拒绝未知键码及修饰键自动重复。
     * @param event 当前原生键盘事件。
     * @returns 单键或组合键文本；无需新增事件时返回 null。
     */
    keydown(event: CaptureKeyEvent): string | null {
      const name = names.get(event.keycode)
      if (!name) return null
      const modifier = modifierName(name)
      if (modifier) {
        if (heldModifiers.has(event.keycode)) return null
        heldModifiers.set(event.keycode, modifier)
      }
      // 本地按下状态补足原生首个修饰键事件中尚未更新的标志位。
      const held = new Set(heldModifiers.values())
      const flags = {
        Ctrl: event.ctrlKey,
        Alt: event.altKey,
        Meta: event.metaKey,
        Shift: event.shiftKey
      }
      const modifiers = MODIFIERS.filter((key) => flags[key] || held.has(key))
      if (modifier) return modifiers.join(' + ')
      const character =
        name === 'Space' || name === 'Spacebar' || event.keychar === 32
          ? 'Space'
          : event.keychar && event.keychar >= 32 && event.keychar < 0xff00
            ? String.fromCodePoint(event.keychar)
            : name.length === 1
              ? name.toLowerCase()
              : name
      return modifiers.length ? [...modifiers, name].join(' + ') : character
    },
    /**
     * 解除对应物理修饰键，左右键分别追踪，避免松开一侧误清另一侧。
     * @param event 当前松开事件。
     * @returns 无返回值；普通键松开不新增采集内容。
     */
    keyup(event: CaptureKeyEvent): void {
      heldModifiers.delete(event.keycode)
    },
    /**
     * 清除暂停、关闭录制或退出订阅前的临时按下状态。
     * @returns 无返回值；不修改已保存遥测。
     */
    reset(): void {
      heldModifiers.clear()
    }
  }
}
