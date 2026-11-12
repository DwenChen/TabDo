import {
  Eye,
  EyeSlash as EyeOff,
  VideoCamera as Video,
  VideoCameraSlash as VideoOff
} from '@presentation/components/ui/icons'
import { useScopedT } from '@presentation/contexts/I18nContext'
import { DropdownItem, HudPopover } from './PopoverScaffold'
import { useLaunchPopoverCoordinator } from './LaunchPopoverCoordinator'
import type { DeviceOption } from './launchPopoverTypes'
import type { ReactElement } from 'react'
import { Button } from '@presentation/components/ui/button'
import { ToggleButton } from '@heroui/react'
import styles from '../LaunchWindow.module.css'

const POPOVER_ID = 'webcam'

/**
 * 展示摄像头设备和预览，以居中的状态按钮切换悬浮预览。
 * @param props 当前摄像头状态及设备、预览回调。
 * @returns 摄像头选择弹层。
 */
export function WebcamPopover({
  trigger,
  disabled,
  webcamEnabled,
  onDisableWebcam,
  canToggleFloatingPreview,
  showFloatingWebcamPreview,
  onToggleFloatingPreview,
  showWebcamControls,
  setWebcamPreviewNode,
  videoDevices,
  webcamDeviceId,
  selectedVideoDeviceId,
  onSelectVideoDevice
}: {
  trigger: ReactElement
  disabled?: boolean
  webcamEnabled: boolean
  onDisableWebcam: () => void
  canToggleFloatingPreview: boolean
  showFloatingWebcamPreview: boolean
  onToggleFloatingPreview: () => void
  showWebcamControls: boolean
  setWebcamPreviewNode: (node: HTMLVideoElement | null) => void
  videoDevices: DeviceOption[]
  webcamDeviceId?: string
  selectedVideoDeviceId?: string
  onSelectVideoDevice: (deviceId: string) => void
}): ReactElement {
  const t = useScopedT('launch')
  const { isOpen, requestOpen, requestClose } = useLaunchPopoverCoordinator()
  const open = isOpen(POPOVER_ID)

  return (
    <HudPopover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          requestClose(POPOVER_ID)
          return
        }
        if (disabled) {
          return
        }
        requestOpen(POPOVER_ID)
      }}
      trigger={trigger}
      align="center"
    >
      <div className={styles.ddLabel}>{t('recording.webcam')}</div>
      {webcamEnabled && (
        <>
          <Button
            variant="destructive-soft"
            className="mb-2 w-full justify-center font-medium"
            onClick={() => {
              onDisableWebcam()
              requestClose(POPOVER_ID)
            }}
          >
            {t('recording.turnOffWebcam')}
          </Button>
          {canToggleFloatingPreview ? (
            <ToggleButton
              variant="ghost"
              className={`${styles.floatingPreviewToggle} relative w-full justify-center text-center font-medium`}
              isSelected={showFloatingWebcamPreview}
              onClick={onToggleFloatingPreview}
            >
              <span className="absolute left-3" aria-hidden="true">
                {showFloatingWebcamPreview ? <Eye size={16} /> : <EyeOff size={16} />}
              </span>
              <span>
                {showFloatingWebcamPreview
                  ? t('recording.floatingWebcamPreviewEnabled')
                  : t('recording.floatingWebcamPreviewDisabled')}
              </span>
            </ToggleButton>
          ) : null}
        </>
      )}
      {!webcamEnabled && (
        <div className="px-3 py-2 text-xs text-[var(--launch-text-muted)]">
          {t('recording.selectWebcamToEnable')}
        </div>
      )}
      {showWebcamControls && (
        <div className="flex justify-center px-3 py-2">
          <div className="h-24 w-24 overflow-hidden rounded-2xl bg-[var(--launch-hover)] ring-1 ring-[var(--launch-border-strong)]">
            <video
              ref={setWebcamPreviewNode}
              className="h-full w-full object-cover"
              muted
              playsInline
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
        </div>
      )}
      {videoDevices.map((device) => (
        <DropdownItem
          key={device.deviceId}
          icon={
            webcamEnabled &&
            (webcamDeviceId === device.deviceId || selectedVideoDeviceId === device.deviceId) ? (
              <Video size={16} />
            ) : (
              <VideoOff size={16} />
            )
          }
          selected={
            webcamEnabled &&
            (webcamDeviceId === device.deviceId || selectedVideoDeviceId === device.deviceId)
          }
          onClick={() => onSelectVideoDevice(device.deviceId)}
        >
          {device.label}
        </DropdownItem>
      ))}
      {videoDevices.length === 0 && (
        <div className="text-center text-xs text-[var(--launch-text-muted)] py-4">
          {t('recording.noWebcamsFound')}
        </div>
      )}
    </HudPopover>
  )
}
