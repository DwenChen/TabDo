import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { I18nProvider } from './contexts/I18nContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import './tabdo.css'

// 嵌入页直接复用所属工具会话的桥接，独立录制覆盖层由专属 preload 安装。
if (window.parent !== window) window.electronAPI = window.parent.electronAPI
document.documentElement.lang = 'zh-CN'
const root = ReactDOM.createRoot(document.getElementById('root')!)
let disposed = false
/**
 * 撤下本页React树，使视频、音频及Pixi的清理先于iframe或原生窗口销毁执行。
 * @returns 无返回值；重复退出不再触发清理。
 */
function disposePresentationRenderer(): void {
  if (disposed) return
  disposed = true
  // 先运行组件清理，及时关闭解码器与GPU上下文，不依赖浏览器稍后的页面回收。
  root.unmount()
}
Object.assign(window, { disposePresentationRenderer })
window.addEventListener('pagehide', disposePresentationRenderer, { once: true })
root.render(
  <ThemeProvider>
    <I18nProvider>
      <App />
    </I18nProvider>
  </ThemeProvider>
)
