import { SettingsSections, SettingsCategory } from '../SettingsSections'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SettingsRow } from '../SettingsRow'
import { Switch } from '@presentation/components/ui/switch'
import { supportsHudCaptureProtection } from '@presentation/lib/hudCaptureProtection'
import { Button } from '@presentation/components/ui/button'
import { toast } from '@presentation/components/ui/toast'
export const DashboardSettingsContext = createContext<ReactNode>(null)
/**
 * 集中提供演示编辑器的偏好、录制与文件设置。
 * @param props 文件导入操作。
 * @returns 无重复权限分类的主页设置。
 */
export function DashboardSettings({ onImportFile }: { onImportFile: () => Promise<void> }) {
  const settingsContent = useContext(DashboardSettingsContext)
  const [directory, setDirectory] = useState('')
  const [recordings, setRecordings] = useState('')
  const [hideHud, setHideHud] = useState(true)
  const [captureSupported, setCaptureSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  /**
   * 执行设置操作并在结束时释放忙碌状态。
   * @param action 当前设置操作。
   * @returns 操作及错误提示完成后的 Promise。
   */
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let active = true
    void Promise.all([
      window.electronAPI.getRecordingsDirectory(),
      window.electronAPI.getHudOverlayCaptureProtection(),
      window.electronAPI.getPlatform()
    ])
      .then(([directory, protection, platform]) => {
        if (!active) return
        if (directory.success) setRecordings(directory.path)
        if (protection.success) setHideHud(protection.enabled)
        setCaptureSupported(supportsHudCaptureProtection(platform))
      })
      .catch((error) => toast.error(String(error)))
    return () => {
      active = false
    }
  }, [])
  return (
    <section aria-label="编辑器设置" className="dashboard-settings max-w-2xl py-10">
      <h1 className="mb-8 text-lg font-semibold">设置</h1>
      <SettingsSections categories={['general', 'motion', 'recording', 'files']}>
        <SettingsCategory category={['general', 'motion', 'advanced']}>
          {settingsContent}
        </SettingsCategory>
        <SettingsCategory category="files">
          <SettingsRow title="导入视频或项目">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void run(onImportFile)}
            >
              打开文件
            </Button>
          </SettingsRow>
        </SettingsCategory>
        <SettingsCategory category="recording">
          <SettingsRow
            title="录制保存目录"
            description={
              <span className="block truncate" title={recordings}>
                {recordings}
              </span>
            }
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await window.electronAPI.chooseRecordingsDirectory()
                  if (result.canceled) return
                  if (!result.success || !result.path) throw Error('无法更改录制目录')
                  setRecordings(result.path)
                })
              }
            >
              更改目录
            </Button>
          </SettingsRow>
          {captureSupported && (
            <SettingsRow
              title="录制时隐藏控制条"
              description="仅在录制期间生效，避免控制条出现在视频中。"
            >
              <Switch
                aria-label="录制时隐藏控制条"
                checked={hideHud}
                disabled={busy}
                onCheckedChange={(enabled) =>
                  void run(async () => {
                    const result = await window.electronAPI.setHudOverlayCaptureProtection(enabled)
                    if (!result.success) throw Error('无法更新捕获保护')
                    setHideHud(result.enabled)
                  })
                }
              />
            </SettingsRow>
          )}
        </SettingsCategory>

        <SettingsCategory category="files">
          <SettingsRow
            title="项目保存目录"
            description={directory || '所有项目及编辑改动始终自动保存。'}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const result = await window.electronAPI.getProjectsDirectory()
                  if (!result.success || !result.path) throw Error('无法打开项目目录')
                  setDirectory(result.path)
                  await window.electronAPI.revealInFolder(result.path)
                } catch (e) {
                  toast.error(String(e))
                }
              }}
            >
              打开目录
            </Button>
          </SettingsRow>
        </SettingsCategory>
      </SettingsSections>
    </section>
  )
}
