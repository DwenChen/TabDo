import type { ReactElement } from 'react'
import { SliderControl } from '../SliderControl'
import { Switch } from '@presentation/components/ui/switch'
import type { AudioRegion } from '../types'
import { Button } from '@presentation/components/ui/button'

type Props = {
  region: AudioRegion
  onChange: (patch: Partial<AudioRegion>) => void
}

/**
 * Edit an independent audio clip beside the video preview.
 * @param props 选中片段及其编辑回调；素材偏移沿用片段裁切与分割的自动结果。
 * @returns 音量、响度与仅滑条操作的淡入淡出设置。
 */
export function AudioClipInspector({
  region,
  onChange
}: Props): ReactElement {
  const durationMs = region.endMs - region.startMs
  return (
    <section aria-label="音频编辑" className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 px-5 py-3">
        <h3 className="inspector-panel-title">{region.label || '音频片段'}</h3>
        <Button variant="ghost" size="sm" aria-label="重置音频设置" onClick={() => onChange({ volume: 1, normalize: false, fadeInMs: 0, fadeOutMs: 0 })}>重置</Button>
      </header>
      <div className="flex-1 inspector-scroll custom-scrollbar space-y-4">
        <SliderControl
          label="音量"
          value={region.volume}
          min={0}
          max={1}
          step={0.01}
          onChange={(volume) => onChange({ volume })}
          formatValue={(value) => `${Math.round(value * 100)}%`}
        />
        <label className="flex items-center justify-between text-xs">
          响度归一化
          <Switch
            aria-label="响度归一化"
            checked={Boolean(region.normalize)}
            onCheckedChange={(normalize) => onChange({ normalize })}
          />
        </label>
        <SliderControl
          label="淡入"
          value={region.fadeInMs ?? 0}
          min={0}
          max={durationMs}
          step={100}
          onChange={(fadeInMs) => onChange({ fadeInMs })}
          formatValue={(value) => `${(value / 1000).toFixed(1)}秒`}
        />
        <SliderControl
          label="淡出"
          value={region.fadeOutMs ?? 0}
          min={0}
          max={durationMs}
          step={100}
          onChange={(fadeOutMs) => onChange({ fadeOutMs })}
          formatValue={(value) => `${(value / 1000).toFixed(1)}秒`}
        />
      </div>
    </section>
  )
}
