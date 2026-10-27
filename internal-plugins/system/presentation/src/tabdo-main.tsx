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
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider><I18nProvider><App /></I18nProvider></ThemeProvider>
)
