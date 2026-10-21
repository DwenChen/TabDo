# TabDo 独立插件市场

市场仓库为 [DwenChen/TabDo-plugins](https://github.com/DwenChen/TabDo-plugins)，由 DwenChen 独立管理。参考原市场的插件目录、图标、索引和 CI 管理方式，不接入原在线服务，也不自动同步未适配的旧插件。

应用从该仓库 `main/index.json` 读取只读索引，并使用单独的 `tabdo-market-*` 缓存。网络失败只回退当前市场缓存，不展示旧市场缓存。评论、账号和付费服务没有被替换成虚假接口；讨论与提交使用仓库 Issues/PR。GitHub 内容访问受用户网络环境影响。

索引结构：

```json
{
  "schemaVersion": 1,
  "plugins": [{
    "name": "hello-tabdo",
    "title": "会话示例",
    "version": "1.0.0",
    "lifecycle": "session-v1",
    "platform": ["win32"],
    "downloadUrl": "https://github.com/DwenChen/TabDo-plugins/releases/download/v1.0.0/hello-tabdo-1.0.0.zpx"
  }]
}
```

所有插件需遵守 [开发规范](plugin-development.md)。仓库负责验证索引名称、版本、HTTPS 地址、平台与生命周期声明、文件完整性，以及生成标准 ZPX。应用不向上游市场查询下载地址或更新，不允许通过旧市场缓存恢复上游入口。

首次收录仅包含协议示例。它用于展示资源清理和持久化，不宣称既有社区插件均已兼容。开发者需要逐项移植、测试并提交审查后再加入索引。
