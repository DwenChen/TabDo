import { lazy, Suspense } from 'react'
const Editor = lazy(() => import('./components/video-editor/EditorWindow'))
const Hud = lazy(() => import('./components/launch/HudWindow'))
const Sources = lazy(() =>
  import('./components/launch/SourceSelector').then((m) => ({ default: m.SourceSelector }))
)
const Countdown = lazy(() =>
  import('./components/countdown/CountdownOverlay').then((m) => ({ default: m.CountdownOverlay }))
)
const Picker = lazy(() => import('./components/capture-picker/CapturePicker'))
/**
 * 选择当前演示会话的正文或有界录制覆盖层。
 * @returns 本地演示页面。
 */
export default function App() {
  const type = new URLSearchParams(location.search).get('windowType')
  document.documentElement.dataset.windowType = type || 'editor'
  if (type === 'hud-overlay') document.documentElement.classList.add('hud-overlay-window')
  return (
    <Suspense fallback={<p>正在加载演示组件…</p>}>
      {type === 'hud-overlay' ? (
        <Hud />
      ) : type === 'source-selector' ? (
        <Sources />
      ) : type === 'countdown' ? (
        <Countdown />
      ) : type === 'capture-picker' ? (
        <Picker />
      ) : (
        <Editor />
      )}
    </Suspense>
  )
}
