import { applyRenameRules } from '../utils/renameRules'

/**
 * 在工作线程中计算重命名预览，避免复杂规则阻塞界面。
 * @param data 含 files 与 workflow 的消息负载。
 * @returns 无返回值。
 */
self.onmessage = ({ data }) => self.postMessage(applyRenameRules(data.files, data.workflow))
