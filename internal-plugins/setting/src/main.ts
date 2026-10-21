import { createApp } from 'vue'
import App from './App.vue'
import './assets/styles'
import { router } from './router'
import { dispatchTabDoCodeEvent, initTabDoBaseEventHandler } from '@/events'
// 单独导入注册事件
import './events/allCodeEvent'

// 统一对 tabdo onPluginEnter 事件进行派发, 内部不要再对 tabdo.onPluginEnter 进行监听
tabdo.onPluginEnter((action) => {
  // 将 utools 事件派发根据不同的 code 进行派发出去
  console.log('[插件事件: onPluginEnter]', action)
  dispatchTabDoCodeEvent(action, router)
})

tabdo.onPluginOut(() => {
  if (router.currentRoute.value.name === 'GeneralSetting') {
    return
  }

  void router.replace({ name: 'GeneralSetting' }).catch((error) => {
    console.error('[插件事件: onPluginOut] 重置设置页路由失败', error)
  })
})

// 检测操作系统并添加类名到 html 元素
function detectOS(): void {
  if (window.tabdo.isWindows()) {
    document.documentElement.classList.add('os-windows')
  } else if (window.tabdo.isMacOS()) {
    document.documentElement.classList.add('os-mac')
  } else {
    document.documentElement.classList.add('os-linux')
  }
}

// 在应用初始化前检测操作系统
detectOS()

const app = createApp(App)
// 注册路由
app.use(router)

app.mount('#app')

// 注册 tabdo 关键字跳转事件
initTabDoBaseEventHandler()
