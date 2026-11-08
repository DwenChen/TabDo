import { useEffect, useState, type Dispatch, type SetStateAction, type ReactElement } from 'react'
import { Button } from '@presentation/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@presentation/components/ui/dialog'
import { ChoiceGroup, ChoiceItem } from '@presentation/components/ui/choice-group'
import { CropControl } from '../CropControl'
import type { CropRegion } from '../types'

/**
 * 在紧凑弹窗中编辑自由或固定比例裁剪，取消沿所属快照回滚。
 * @param props 素材、裁剪状态与完成取消操作。
 * @returns 裁剪预览、比例选择及底部操作。
 */
export function CropEditorDialog({
  open,
  videoElement,
  cropRegion,
  setCropRegion,
  onCancel,
  onDone
}: {
  open: boolean
  t: (key: string, fallback?: string) => string
  videoElement: HTMLVideoElement | null
  cropRegion: CropRegion
  setCropRegion: Dispatch<SetStateAction<CropRegion>>
  aspectRatio: string
  onCancel: () => void
  onDone: () => void
}): ReactElement {
  const [ratio, setRatio] = useState('free')
  const [drawMode, setDrawMode] = useState(false)
  useEffect(() => {
    // 每次打开从实际项目范围开始，撤销后不携带上次弹窗的比例约束。
    if (open) {
      setRatio('free')
      setDrawMode(false)
    }
  }, [open])
  /**
   * 以当前选区中心应用比例，保证新选区仍位于素材内。
   * @param value 自由、原始或标准画面比例。
   * @returns 无返回值。
   */
  const changeRatio = (value: string): void => {
    setRatio(value)
    if (value === 'free') return
    const source =
      videoElement?.videoWidth && videoElement.videoHeight
        ? videoElement.videoWidth / videoElement.videoHeight
        : 16 / 9
    const target =
      value === 'source' ? source : Number(value.split(':')[0]) / Number(value.split(':')[1])
    const normalized = target / source
    const width = Math.min(cropRegion.width, cropRegion.height * normalized)
    const height = width / normalized
    setCropRegion({
      x: Math.max(0, Math.min(1 - width, cropRegion.x + (cropRegion.width - width) / 2)),
      y: Math.max(0, Math.min(1 - height, cropRegion.y + (cropRegion.height - height) / 2)),
      width,
      height
    })
  }
  const source =
    videoElement?.videoWidth && videoElement.videoHeight
      ? videoElement.videoWidth / videoElement.videoHeight
      : 16 / 9
  const lockedRatio =
    ratio === 'free'
      ? undefined
      : ratio === 'source'
        ? source
        : Number(ratio.split(':')[0]) / Number(ratio.split(':')[1])
  /**
   * 恢复完整素材范围及自由比例，并退出重新框选状态。
   * @returns 无返回值；修改仅在完成时进入项目历史，取消仍可回滚。
   */
  function resetCrop(): void {
    setCropRegion({ x: 0, y: 0, width: 1, height: 1 })
    setRatio('free')
    setDrawMode(false)
  }
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onCancel()}>
      <DialogContent className="flex max-h-[90vh] w-[min(760px,92vw)] max-w-none flex-col gap-3 overflow-auto p-4">
        <DialogTitle className="text-base font-semibold">裁剪视频</DialogTitle>
        <p className="text-xs text-muted-foreground">
          拖动选区移动，拖动八个边角调整大小，也可重新框选。
        </p>
        <ChoiceGroup aria-label="裁剪比例" value={ratio} onValueChange={changeRatio} size="sm">
          {['free', 'source', '16:9', '4:3', '1:1', '9:16'].map((value) => (
            <ChoiceItem key={value} value={value}>
              {value === 'free' ? '自由' : value === 'source' ? '原始' : value}
            </ChoiceItem>
          ))}
        </ChoiceGroup>
        <CropControl
          videoElement={videoElement}
          cropRegion={cropRegion}
          onCropChange={setCropRegion}
          lockedRatio={lockedRatio}
          drawMode={drawMode}
          onDrawComplete={() => setDrawMode(false)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDrawMode(!drawMode)}
              aria-pressed={drawMode}
            >
              重新框选
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetCrop}
            >
              重置裁剪
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              取消
            </Button>
            <Button size="sm" onClick={onDone}>
              完成
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
