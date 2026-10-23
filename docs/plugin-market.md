# TabDo 插件市场维护规范

[TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 独立管理插件源码、图标、索引及发布包。应用主仓库管理宿主和 SDK，市场仓库管理插件发行，两者分别计数版本。原市场资料作为适配参考，未适配插件不自动收录。

## 读取与缓存

应用读取市场仓库 `main/index.json`，使用独立的 `tabdo-market-*` 缓存键。请求失败时仅回退该市场的缓存；不得读取原市场缓存、向原下载服务查询地址或恢复旧账号、评论与付费入口。问题讨论和源码提交使用市场仓库 Issues 与 PR。

索引请求有超时和大小上限，并合并在途请求。GitHub 索引和资源的可访问性取决于用户网络环境，失败状态需要明确展示。

## 索引协议

```json
{
  "schemaVersion": 1,
  "plugins": [
    {
      "name": "hello-tabdo",
      "title": "会话示例",
      "version": "1.0.0",
      "lifecycle": "session-v1",
      "platform": ["win32"],
      "downloadUrl": "https://github.com/DwenChen/TabDo-plugins/releases/download/v1.0.0/hello-tabdo-1.0.0.zpx"
    }
  ]
}
```

索引名称和版本必须与包内清单一致，下载地址使用 HTTPS，并明确平台与生命周期声明。发行包使用标准 ZPX。目录字段和验证逻辑以市场仓库当前协议为准。

## 收录与发布

提交插件源码、完整许可、清单、图标、变更说明及实际回归证据。按 [插件开发规范](plugin-development.md)实现 `session-v1`，验证退出清理、必要任务、异步迟到、并发 Provider 和持久数据保留。

市场 CI 负责清单及索引一致性、生命周期声明、文件完整性与打包校验，再维护可安装的发布包和索引。宿主也校验索引与实际包清单，不能仅凭目录声明信任任意包。

首版市场提供会话协议示例，用于演示资源释放和持久化。已有社区插件需逐项适配、测试与审阅；示例可运行不代表全部旧插件兼容。插件 preload 属于可信代码，收录审查不等同于权限沙箱或完整安全审计。
