import { useEffect, type ReactNode } from 'react'
export type ThemePreference = 'light' | 'dark' | 'system'
/**
 * 从所属宿主页面读取主题，独立覆盖层从宿主提供的设置读取。
 * @returns 已解析的明暗主题。
 */
function currentTheme() {
  try {
    return window.parent !== window &&
      (window.parent.document.documentElement.classList.contains('dark') ||
        window.parent.document.documentElement.dataset.theme === 'dark')
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}
/**
 * 同步 TabDo 主题，退出时解除观察和定时刷新。
 * @param children 当前演示界面。
 * @returns 随宿主主题显示的界面。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let active = true
    const update = async () => {
      const settings = await window.electronAPI.getTabDoSettings().catch(() => ({}))
      if (!active) return
      const theme =
        window.parent !== window
          ? currentTheme()
          : settings.theme === 'dark' ||
              (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
            ? 'dark'
            : 'light'
      document.documentElement.dataset.theme = theme
      document.documentElement.classList.toggle('dark', theme === 'dark')
      if (window.parent !== window) {
        const color = getComputedStyle(window.parent.document.documentElement).getPropertyValue(
          '--primary-color'
        )
        if (color) document.documentElement.style.setProperty('--accent', color)
      }
    }
    void update()
    const timer = setInterval(() => {
      if (!document.hidden) void update()
    }, 1000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  return children
}
/**
 * 提供随宿主解析的主题兼容接口。
 * @returns 宿主主题及无状态兼容方法。
 */
export function useTheme() {
  return {
    preference: 'system',
    theme: currentTheme(),
    setPreference: () => {},
    toggleTheme: () => {}
  }
}
