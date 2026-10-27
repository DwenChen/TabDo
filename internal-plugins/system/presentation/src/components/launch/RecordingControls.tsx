import { House, MinusIcon, PauseIcon, PlayIcon, XIcon } from '@presentation/components/ui/icons'
import { RecordingMicIcon } from '@presentation/components/ui/recording-icons'
import { useScopedT } from '@presentation/contexts/I18nContext'
import { Button, Separator, Tooltip } from '@heroui/react'
import styles from './LaunchWindow.module.css'

interface RecordingControlsProps {
  onHome: () => void
  paused: boolean
  microphoneEnabled: boolean
  elapsed: number
  onPauseResume: () => void
  onStopRecording: () => void
  onHideHud: () => void
  onCancelRecording: () => void
  formatTime: (seconds: number) => string
}
/**
 * 显示录制进度、设备状态和暂停、停止等操作。
 * @param props 当前录制状态及控制方法。
 * @returns 录制中的控制条内容。
 */
export function RecordingControls({
  onHome,
  paused,
  microphoneEnabled,
  elapsed,
  onPauseResume,
  onStopRecording,
  onHideHud,
  onCancelRecording,
  formatTime
}: RecordingControlsProps) {
  const t = useScopedT('launch')
  const actionClass = `size-9 min-w-9 rounded-full ${styles.electronNoDrag}`
  return (
    <div role="group" aria-label="录制控制" className="flex items-center gap-2">
      <Button
        isIconOnly
        variant="ghost"
        className={actionClass}
        aria-label="演示编辑器"
        onPress={onHome}
      >
        <House weight="fill" className="size-4" />
      </Button>
      <div
        className="flex items-center gap-3 px-2"
        role="status"
        aria-label={paused ? t('recording.paused') : t('recording.rec')}
      >
        <span
          className={`size-2 rounded-full ${paused ? 'bg-warning' : `bg-danger ${styles.recDotBlink}`}`}
        />
        <span className="min-w-14 text-sm font-medium tabular-nums text-foreground">
          {formatTime(elapsed)}
        </span>
        {paused && <span className="text-xs text-muted-foreground">{t('recording.paused')}</span>}
      </div>
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          isDisabled
          className={actionClass}
          aria-label={microphoneEnabled ? '麦克风已开启' : '麦克风已关闭'}
        >
          <RecordingMicIcon disabled={!microphoneEnabled} className="size-4" />
        </Button>
        <Tooltip.Content>{t('recording.micToggleDisabledTip')}</Tooltip.Content>
      </Tooltip>
      <Separator orientation="vertical" className="mx-1 h-5 self-center" />
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          className={actionClass}
          onPress={onPauseResume}
          aria-label={paused ? t('recording.resume') : t('recording.pause')}
        >
          {paused ? (
            <PlayIcon weight="fill" className="size-4" />
          ) : (
            <PauseIcon weight="fill" className="size-4" />
          )}
        </Button>
        <Tooltip.Content>{paused ? t('recording.resume') : t('recording.pause')}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Button
          isIconOnly
          variant="danger"
          className={actionClass}
          onPress={onStopRecording}
          aria-label={t('recording.stop')}
        >
          <span className="size-3 rounded-[3px] bg-current" />
        </Button>
        <Tooltip.Content>{t('recording.stop')}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          className={actionClass}
          onPress={onHideHud}
          aria-label={t('recording.hideHud')}
        >
          <MinusIcon className="size-4" />
        </Button>
        <Tooltip.Content>{t('recording.hideHud')}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          className={actionClass}
          onPress={onCancelRecording}
          aria-label={t('recording.cancel')}
        >
          <XIcon className="size-4" />
        </Button>
        <Tooltip.Content>{t('recording.cancel')}</Tooltip.Content>
      </Tooltip>
    </div>
  )
}
