import { PlaybackAction as Button } from './PlaybackAction'
import type { CSSProperties } from 'react'
import './preview-transport.css'
import { Slider } from '@presentation/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@presentation/components/ui/popover'
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerLow,
  SpeakerX
} from '@presentation/components/ui/icons'

export type PreviewTransportState = {
  currentTime: number
  duration: number
  isPlaying: boolean
  volume: number
  disabled: boolean
  onSeek: (time: number) => void
  onTogglePlayback: () => void
  onSkipBack: () => void
  onSkipForward: () => void
  onVolumeChange: (value: number) => void
}

/**
 * 将时间转换为易读的播放位置，非法或负数统一显示零。
 * @param seconds 时间秒数。
 * @returns 分钟和秒；长视频包含小时。
 */
function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(value / 3600),
    minutes = Math.floor(value / 60) % 60,
    rest = String(value % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/**
 * 在普通和全屏预览中共用播放、时间轴定位、音量及全屏操作。
 * @param props 已投影到编辑时间轴的播放状态、控制回调和全屏状态。
 * @returns 可键盘操作的预览控制条；定位只改变播放时间，不改项目历史。
 */
export function PreviewTransport({
  fullscreen = false,
  switchingFullscreen = false,
  onToggleFullscreen,
  ...state
}: PreviewTransportState & {
  fullscreen?: boolean
  switchingFullscreen?: boolean
  onToggleFullscreen: () => void
}) {
  const duration = Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0
  const time = Math.max(
    0,
    Math.min(duration, Number.isFinite(state.currentTime) ? state.currentTime : 0)
  )
  const volumeIcon =
    state.volume <= 0.001 ? (
      <SpeakerX className="size-3.5" />
    ) : state.volume < 0.5 ? (
      <SpeakerLow className="size-3.5" />
    ) : (
      <SpeakerHigh className="size-3.5" />
    )
  return (
    <div
      data-preview-transport={fullscreen ? 'fullscreen' : 'inline'}
      className={`flex min-w-0 flex-col gap-1 ${fullscreen ? 'w-full rounded-xl bg-black/80 px-5 py-3 text-white [&_button]:text-white [&_button:hover]:bg-white/15' : 'w-full py-1'}`}
    >
      <div className="flex items-center justify-center gap-1.5">
        <span className="min-w-10 text-xs tabular-nums" aria-label="当前播放位置">
          {formatTime(time)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          title="跳到上一位置"
          aria-label="跳到上一位置"
          disabled={state.disabled}
          onClick={state.onSkipBack}
        >
          <SkipBack className="size-3.5" weight="fill" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={state.isPlaying ? '暂停' : '播放'}
          aria-label={
            fullscreen
              ? state.isPlaying
                ? '暂停全屏预览'
                : '播放全屏预览'
              : state.isPlaying
                ? '暂停'
                : '播放'
          }
          disabled={state.disabled}
          onClick={state.onTogglePlayback}
          className={fullscreen ? 'bg-white/15 text-white' : 'bg-foreground/10'}
        >
          {state.isPlaying ? (
            <Pause className="size-3.5" weight="fill" />
          ) : (
            <Play className="size-3.5" weight="fill" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="跳到下一位置"
          aria-label="跳到下一位置"
          disabled={state.disabled}
          onClick={state.onSkipForward}
        >
          <SkipForward className="size-3.5" weight="fill" />
        </Button>
        <span className="min-w-10 text-xs tabular-nums opacity-65" aria-label="预览总时长">
          {formatTime(duration)}
        </span>
        {fullscreen ? (
          <div className="ml-1 flex items-center gap-2" aria-label="预览音量控制">
            {volumeIcon}
            <input
              aria-label="预览音量"
              className="w-20 accent-emerald-500"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.volume}
              onChange={(event) => state.onVolumeChange(Number(event.target.value))}
            />
          </div>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="预览音量" title="预览音量">
                {volumeIcon}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              sideOffset={10}
              aria-label="预览音量"
              className="flex w-14 flex-col items-center gap-3 p-3"
            >
              <span className="text-xs tabular-nums">{Math.round(state.volume * 100)}%</span>
              <Slider
                aria-label="预览音量"
                orientation="vertical"
                min={0}
                max={1}
                step={0.01}
                value={[state.volume]}
                onValueChange={([value]) => state.onVolumeChange(value)}
                className="h-28"
              />
            </PopoverContent>
          </Popover>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={fullscreen ? '退出全屏预览' : '全屏预览'}
          title={fullscreen ? '退出全屏预览（Esc）' : '全屏预览'}
          disabled={state.disabled || switchingFullscreen}
          onClick={onToggleFullscreen}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              d={
                fullscreen
                  ? 'M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6'
                  : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'
              }
            />
          </svg>
        </Button>
      </div>
      <input
        type="range"
        aria-label={fullscreen ? '全屏播放进度' : '播放进度'}
        aria-valuetext={`${formatTime(time)} / ${formatTime(duration)}`}
        min={0}
        max={Math.max(0.01, duration)}
        step={0.01}
        value={time}
        disabled={state.disabled || duration <= 0}
        onChange={(event) => state.onSeek(Number(event.target.value))}
        className="preview-seekbar w-full cursor-pointer disabled:cursor-default"
        style={
          { '--preview-progress': `${duration ? (time / duration) * 100 : 0}%` } as CSSProperties
        }
      />
    </div>
  )
}
