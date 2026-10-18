const { ToolLifecycle } = require('./tool-lifecycle.cjs')

// 在页面加载前创建作用域，退出发生于 Vue 挂载前也可以及时完成清理。
const lifecycle = new ToolLifecycle()
window.toolsLifecycle = lifecycle
// 捕获本次会话，避免旧文档的卸载事件通过 window 引用清理后续新会话。
window.addEventListener('beforeunload', () => void lifecycle.dispose(), { once: true })
