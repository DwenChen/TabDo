import { describe, expect, it } from 'vitest'
import { createKeyboardCapture } from '../../internal-plugins/system/presentation/electron/ipc/cursor/keyboard'
import { getKeyLegends } from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardDisplay'

const codes = {
  Shift: 42,
  ShiftRight: 54,
  Ctrl: 29,
  CtrlRight: 3613,
  Alt: 56,
  AltRight: 3640,
  Meta: 3675,
  MetaRight: 3676,
  A: 30,
  S: 31,
  '1': 2,
  Space: 57,
  Enter: 28,
  Tab: 15,
  Backspace: 14,
  ArrowLeft: 57419,
  F12: 88,
  NumpadAdd: 78,
  NumpadArrowLeft: 61003
}

describe('物理键盘采集与修饰键', () => {
  it.each([
    'Shift',
    'ShiftRight',
    'Ctrl',
    'CtrlRight',
    'Alt',
    'AltRight',
    'Meta',
    'MetaRight'
  ] as const)('%s 单独按下立即响应，长按不重复，松开后可再次录制', (name) => {
    const capture = createKeyboardCapture(codes)
    const event = { keycode: codes[name] }
    expect(capture.keydown(event)).toBe(name.replace('Right', ''))
    expect(capture.keydown(event)).toBeNull()
    capture.keyup(event)
    expect(capture.keydown(event)).toBe(name.replace('Right', ''))
  })
  it('组合键补足首帧标志，左右键分别释放且普通按键重复保留', () => {
    const capture = createKeyboardCapture(codes)
    capture.keydown({ keycode: codes.Shift })
    capture.keydown({ keycode: codes.ShiftRight })
    capture.keyup({ keycode: codes.Shift })
    expect(capture.keydown({ keycode: codes.A })).toBe('Shift + A')
    capture.keyup({ keycode: codes.ShiftRight })
    expect(capture.keydown({ keycode: codes.A })).toBe('a')
    expect(capture.keydown({ keycode: codes.A })).toBe('a')
    capture.keydown({ keycode: codes.CtrlRight })
    capture.keydown({ keycode: codes.ShiftRight })
    expect(capture.keydown({ keycode: codes.S })).toBe('Ctrl + Shift + S')
    capture.reset()
    expect(capture.keydown({ keycode: codes.S })).toBe('s')
    expect(capture.keydown({ keycode: codes.A, altKey: true })).toBe('Alt + A')
  })
  it('物理空格、数字、功能键和小键盘具有可见图例，未知键码不污染记录', () => {
    const capture = createKeyboardCapture(codes)
    expect(capture.keydown({ keycode: codes.Space, keychar: 32 })).toBe('Space')
    expect(capture.keydown({ keycode: codes['1'], shiftKey: true })).toBe('Shift + 1')
    for (const name of [
      'Enter',
      'Tab',
      'Backspace',
      'ArrowLeft',
      'F12',
      'NumpadAdd',
      'NumpadArrowLeft'
    ] as const) {
      expect(capture.keydown({ keycode: codes[name], keychar: 65535 })).toBe(name)
      expect(getKeyLegends(name)).toHaveLength(1)
    }
    expect(capture.keydown({ keycode: -1 })).toBeNull()
  })
  it('连接输入折叠紧邻的修饰键前缀，独立按键和历史文字继续保留', () => {
    expect(getKeyLegends('Shift\u001fCtrl + Shift\u001fCtrl + Shift + S')).toEqual([
      'Ctrl',
      '⇧',
      'S'
    ])
    expect(getKeyLegends('Shift\u001fa')).toEqual(['⇧', 'A'])
    expect(getKeyLegends('Meta\u001fMeta + ArrowLeft')).toEqual(['⊞', '←'])
    expect(getKeyLegends('Shift')).toEqual(['⇧'])
  })
})
