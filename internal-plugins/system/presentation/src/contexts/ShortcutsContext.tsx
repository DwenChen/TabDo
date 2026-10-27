import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  DEFAULT_SHORTCUTS,
  mergeWithDefaults,
  type ShortcutsConfig
} from '@presentation/lib/shortcuts'
import { isMac as getIsMac } from '@presentation/utils/platformUtils'

interface ShortcutsContextValue {
  shortcuts: ShortcutsConfig
  isMac: boolean
  setShortcuts: (config: ShortcutsConfig) => void
  persistShortcuts: (config?: ShortcutsConfig) => Promise<void>
  isConfigOpen: boolean
  openConfig: () => void
  closeConfig: () => void
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null)

/**
 * 取得从宿主设置读取的编辑动作。
 * @returns 当前快捷键上下文。
 */
export function useShortcuts(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext)
  if (!ctx) throw new Error('useShortcuts must be used within <ShortcutsProvider>')
  return ctx
}

/**
 * 读取宿主快捷键配置并在可见时刷新，卸载后停止刷新。
 * @param options 当前操作所需的参数。
 * @returns 共享当前配置的子界面。
 */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState<ShortcutsConfig>(DEFAULT_SHORTCUTS)
  const [isMac, setIsMac] = useState(false)
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  useEffect(() => {
    getIsMac()
      .then(setIsMac)
      .catch(() => undefined)

    const load = async () => {
      try {
        const saved = await window.electronAPI?.getShortcuts?.()
        if (saved) {
          setShortcuts(mergeWithDefaults(saved as Partial<ShortcutsConfig>))
        }
      } catch {
        return undefined
      }
    }
    void load()
    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const persistShortcuts = useCallback(
    async (config?: ShortcutsConfig) => {
      await window.electronAPI?.saveShortcuts?.(config ?? shortcuts)
    },
    [shortcuts]
  )

  const openConfig = useCallback(() => window.electronAPI.openTabDoShortcuts(), [])
  const closeConfig = useCallback(() => setIsConfigOpen(false), [])

  const value = useMemo<ShortcutsContextValue>(
    () => ({
      shortcuts,
      isMac,
      setShortcuts,
      persistShortcuts,
      isConfigOpen,
      openConfig,
      closeConfig
    }),
    [shortcuts, isMac, persistShortcuts, isConfigOpen, openConfig, closeConfig]
  )

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>
}
