import { session } from 'electron'

/**
 * 代理配置接口
 */
export interface ProxyConfig {
  enabled: boolean
  url: string
  proxyRules?: string
}

/**
 * 代理管理器
 * 统一管理所有 session 的代理配置
 */
class ProxyManager {
  private currentConfig: ProxyConfig = { enabled: false, url: '' }
  private applied = new WeakMap<Electron.Session, { key: string; promise: Promise<void> }>()

  /**
   * 设置代理配置
   * @param config 代理配置
   */
  public setProxyConfig(config: { enabled: boolean; url: string }): void {
    this.currentConfig = {
      enabled: config.enabled,
      url: config.url,
      proxyRules: this.parseProxyRules(config.url)
    }
  }

  /**
   * 获取当前代理配置
   */
  public getProxyConfig(): ProxyConfig {
    return { ...this.currentConfig }
  }

  /**
   * 按配置变化应用 Session 代理，合并重复请求并保持配置切换顺序。
   * @param sess Electron session
   * @param name session 名称（用于日志）
   * @returns 代理应用完成后的 Promise。
   * @throws Electron 拒绝代理设置时抛出，下一次调用可重试。
   */
  public async applyProxyToSession(sess: Electron.Session, name?: string): Promise<void> {
    const config: Electron.ProxyConfig =
      this.currentConfig.enabled && this.currentConfig.proxyRules
        ? {
            proxyRules: this.currentConfig.proxyRules,
            proxyBypassRules: 'localhost,127.0.0.1,::1,<local>'
          }
        : { mode: 'system' }
    const key = JSON.stringify(config)
    const previous = this.applied.get(sess)
    if (previous?.key === key) return previous.promise
    // 新 Session 默认使用系统代理，无自定义配置时不重复启动代理重配置链。
    if (!previous && !this.currentConfig.enabled) {
      this.applied.set(sess, { key, promise: Promise.resolve() })
      return
    }
    // 前一次失败不能阻塞新配置；同一 Session 的实际写入按调用顺序完成。
    const promise = (previous?.promise ?? Promise.resolve())
      .catch(() => {})
      .then(() => sess.setProxy(config))
    const entry = { key, promise }
    this.applied.set(sess, entry)
    try {
      await promise
      if (name) console.log(`[Proxy] ${name} 代理已更新`)
    } catch (error) {
      if (this.applied.get(sess) === entry) this.applied.delete(sess)
      throw error
    }
  }

  /**
   * 应用代理配置到默认 session 并清理缓存
   */
  public async applyProxyToDefaultSession(): Promise<void> {
    // 只有在启用自定义代理时才清理缓存
    if (this.currentConfig.enabled && this.currentConfig.proxyRules) {
      console.log('[Proxy] 清理 HTTP 缓存...')
      await session.defaultSession.clearCache()
      console.log('[Proxy] HTTP 缓存已清理')
    }

    // 应用代理
    await this.applyProxyToSession(session.defaultSession, '主程序')

    // 验证代理配置是否生效
    if (this.currentConfig.enabled && this.currentConfig.proxyRules) {
      // 测试外部地址（应该走自定义代理）
      const externalProxy = await session.defaultSession.resolveProxy('https://github.com')
      console.log('[Proxy] 外部地址代理解析:', externalProxy)

      // 测试本地地址（应该不走代理）
      const localhostProxy = await session.defaultSession.resolveProxy('http://localhost:5174')
      console.log('[Proxy] localhost:5174 代理解析:', localhostProxy)

      const loopbackProxy = await session.defaultSession.resolveProxy('http://127.0.0.1:5174')
      console.log('[Proxy] 127.0.0.1:5174 代理解析:', loopbackProxy)
    } else {
      // 测试系统代理是否生效
      const externalProxy = await session.defaultSession.resolveProxy('https://github.com')
      console.log('[Proxy] 使用系统代理，外部地址代理解析:', externalProxy)
    }
  }

  /**
   * 解析代理 URL 并转换为 Electron 的 proxyRules 格式
   * @param url 代理 URL
   * @returns proxyRules 字符串
   */
  private parseProxyRules(url: string): string {
    if (!url) return ''

    try {
      const proxyUrl = new URL(url)
      const protocol = proxyUrl.protocol.replace(':', '')
      const host = proxyUrl.hostname
      const port = proxyUrl.port || (protocol === 'https' ? '443' : '80')

      // 根据协议类型构建 proxyRules
      if (protocol === 'socks5' || protocol === 'socks4') {
        // SOCKS 代理格式：socks5://host:port
        return `${protocol}://${host}:${port}`
      } else if (protocol === 'http' || protocol === 'https') {
        // HTTP/HTTPS 代理格式：host:port（Electron 会自动处理）
        return `${host}:${port}`
      }

      // 其他情况返回原始 URL
      return url
    } catch (error) {
      console.warn('[Proxy] 解析代理 URL 失败，使用原始格式:', error)
      return url
    }
  }
}

export default new ProxyManager()
