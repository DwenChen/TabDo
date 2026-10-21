import { createApp } from 'vue'
import './styles/global.css'
import './styles/utilities.css'
import App from './App.vue'

const app = createApp(App)
// 先登记再挂载，退出与首次异步加载交错时也会停止全部 Vue effect。
window.toolsLifecycle.addCleanup(() => app.unmount())
if (!window.toolsLifecycle.signal.aborted) app.mount('#app')
