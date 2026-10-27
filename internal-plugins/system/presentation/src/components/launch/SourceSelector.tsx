import { useCallback, useEffect, useState } from 'react'
import { Button } from '@presentation/components/ui/button'

/**
 * 沿用上游来源列表，为屏幕和应用窗口提供缩略图与明确选择。
 * @param props 是否嵌入控制条菜单，以及关闭菜单的回调。
 * @returns 当前会话的分组来源列表。
 */
export function SourceSelector({
  embedded = false,
  onClose = () => window.close()
}: {
  embedded?: boolean
  onClose?: () => void
}) {
  const [sources, setSources] = useState<ProcessedDesktopSource[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string>()
  const [selectedId, setSelectedId] = useState<string>()
  /**
   * 重新读取当前可捕获来源，失败时保留重试入口。
   * @returns 列表加载完成后的 Promise。
   */
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setSources(
        await window.electronAPI.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 160, height: 90 },
          fetchWindowIcons: false
        })
      )
    } catch {
      setError('无法读取录制来源，请刷新列表后重试。')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
    void window.electronAPI.getSelectedSource().then((source) => setSelectedId(source?.id))
  }, [refresh])
  useEffect(() => {
    /**
     * 取消来源选择，保留此前已选来源。
     * @param event 当前键盘事件。
     * @returns 无返回值。
     */
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    const unsubscribe = window.electronAPI.onRecordingStateChanged((state) => {
      if (state.recording) onClose()
    })
    return () => {
      window.removeEventListener('keydown', key)
      unsubscribe()
    }
  }, [onClose])
  /**
   * 提交来源，收起所属菜单或备用窗口并显示短时边缘高亮。
   * @param source 用户选择的屏幕或应用窗口。
   * @returns 来源提交完成后的 Promise。
   */
  const select = async (source: ProcessedDesktopSource) => {
    if (selecting) return
    setSelecting(true)
    setError(undefined)
    try {
      const selected = await window.electronAPI.selectSource(source)
      if (selected?.id !== source.id) throw new Error('录制期间无法切换来源。')
      // 嵌入列表没有独立来源窗口，由当前操作链通知宿主播放短时边缘高亮。
      if (embedded) void window.electronAPI.showSourceHighlight(source)
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法选择此来源，请刷新后重试。')
    } finally {
      setSelecting(false)
    }
  }
  return (
    <div
      data-source-menu
      className={`flex flex-col text-foreground ${embedded ? '' : 'h-screen rounded-2xl border border-separator bg-surface p-3'}`}
    >
      <div className="min-h-0 flex-1">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status" className="py-6 text-center text-sm text-muted">
            正在读取录制来源…
          </p>
        ) : sources.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">未找到可录制的屏幕或应用窗口。</p>
        ) : (
          ['screen', 'window'].map((kind) => {
            const entries = sources.filter((source) => source.id.startsWith(`${kind}:`))
            return (
              entries.length > 0 && (
                <section key={kind} className="mb-3">
                  <h2 className="px-2 py-2 text-xs font-semibold text-muted">
                    {kind === 'screen' ? '屏幕' : '应用窗口'}
                  </h2>
                  <div className="flex flex-col gap-1">
                    {entries.map((source) => (
                      <Button
                        key={source.id}
                        variant="ghost"
                        aria-label={source.name}
                        aria-pressed={source.id === selectedId}
                        disabled={selecting}
                        className={`h-auto min-w-0 w-full justify-start gap-3 rounded-lg p-2 text-left ${source.id === selectedId ? 'bg-accent/10 text-accent' : ''}`}
                        onClick={() => void select(source)}
                      >
                        {source.thumbnail && (
                          <img
                            src={source.thumbnail}
                            alt=""
                            className="h-10 w-16 shrink-0 rounded-md bg-black/5 object-contain"
                          />
                        )}
                        <span className="min-w-0 flex-1" title={source.name}>
                          <span className="block truncate text-sm">{source.name}</span>
                          <span className="block text-xs text-muted">
                            {kind === 'screen' ? '屏幕' : '窗口'}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </section>
              )
            )
          })
        )}
      </div>
      <footer className="flex shrink-0 justify-between border-t border-separator pt-2">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button variant="ghost" disabled={loading || selecting} onClick={() => void refresh()}>
          刷新
        </Button>
      </footer>
    </div>
  )
}
