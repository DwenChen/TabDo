import type { Router } from 'vue-router'

export interface PluginEnterEvent {
  code: string
  type: string
  payload: any
  option: any
}

export class TabDoCodeEvent<T = Record<string, any>> extends CustomEvent<any> {
  public pluginEnterParams: PluginEnterEvent
  public router: Router
  public params: T = {} as T

  private static PARAMS_SPLIT = '?'

  constructor(pluginEnterParams: PluginEnterEvent, router: Router) {
    super(pluginEnterParams.code.split(TabDoCodeEvent.PARAMS_SPLIT)[0])
    this.pluginEnterParams = pluginEnterParams
    this.router = router
    this.handleEventCode(pluginEnterParams)
  }

  public handleEventCode(data: PluginEnterEvent): void {
    const { code, payload, type } = data
    this.payloadParams(code)
    if (type === 'regex' && payload.toString().startsWith('#')) {
      this.payloadParams(payload.toString().substring(1))
    }
  }

  private payloadParams(code: string): void {
    const codes = code.split(TabDoCodeEvent.PARAMS_SPLIT)

    if (codes.length > 2) {
      throw Error(`code 错误 ${TabDoCodeEvent.PARAMS_SPLIT} 仅可出现 1 或 0 次`)
    }

    if (codes.length > 1) {
      if (codes.includes('.')) {
        throw Error(`code 错误 ${TabDoCodeEvent.PARAMS_SPLIT} 仅可以出现在.后面`)
      }
    }

    if (codes.length > 1 && codes[1].includes('=')) {
      const params = new URLSearchParams(codes[1])
      this.params = Array.from(params.entries()).reduce((acc, [key, value]) => {
        acc[key] = value as any
        return acc
      }, {} as any) as T
    } else {
      this.params = {
        [codes[1]]: true
      } as T
    }
  }

  public hasParamKey(key: string): boolean {
    return Object.keys(this.params as any).includes(key)
  }

  public getParamsKey(key: 'router' | string): any {
    return this.params[key] as any
  }
}

/**
 * 事件类型判断辅助函数
 * @param obj
 */
function isTabDoCodeEventDetail(obj: Event): obj is TabDoCodeEvent {
  return obj instanceof TabDoCodeEvent
}

/**
 * 派发事件
 * @param data 数据
 * @param router 路由
 */
export function dispatchTabDoCodeEvent(data: PluginEnterEvent, router: Router): void {
  const event = new TabDoCodeEvent(data, router)
  console.log('[code-event] dispatchTabDoCodeEvent', event)
  window.dispatchEvent(event)
}

/**
 * 添加监听 TabDo code 事件
 * @param type 事件类型
 * @param event 事件
 */
export function addTabDoCodeEventListener(type: string, event: (e: TabDoCodeEvent) => void): void {
  window.addEventListener(type, (e) => {
    if (isTabDoCodeEventDetail(e)) {
      event(e)
    }
  })
}

export interface InitBaseEventHandlerOptions {
  pluginHeight?: (() => number) | number
}

export function initTabDoBaseEventHandler(options: InitBaseEventHandlerOptions = {}): void {
  const height =
    typeof options.pluginHeight === 'function' ? options.pluginHeight() : options.pluginHeight
  if (height) {
    tabdo?.setExpendHeight(height)
  }

  addTabDoCodeEventListener('ui.router', (e) => {
    console.log('[code-event] ui.router 收到消息', e)
    e.router
      .replace({
        name: e.getParamsKey('router'),
        query: { ...e.params, t: Date.now() },
        state: {
          payload: e.pluginEnterParams.payload,
          type: e.pluginEnterParams.type
        }
      })
      .then(() => {})
    if (height) {
      tabdo.setExpendHeight(height)
    }
  })
}
