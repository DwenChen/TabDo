import { EventEmitter } from 'node:events'

// 只广播新复制的纯数据；订阅者关闭时解绑，不改变宿主采集器生命周期。
export const clipboardEvents = new EventEmitter()
