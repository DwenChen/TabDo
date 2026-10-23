# Provider 文档示例

本目录演示 `providers` 声明与 `tabdo.registerProvider` 注册，采用 `session-v1` 清单。handler 返回模拟翻译和 OCR 结果，不连接实际服务；需要替换实现并补齐入口、图标及许可后才能交付插件。

## 文件与契约

- `plugin.json`：声明翻译与 OCR。声明 key 在此恰好等于 type，实际插件可用不同 key 注册多个同类渠道。
- `preload.js`：注册模拟 handler，展示输入和输出结构。

翻译输入为文本，OCR 输入为图片；契约、默认渠道和生命周期要求见 [Provider 开发指南](../../provider-development-guide.md)与[插件规范](../../plugin-development.md)。

## 接入流程

1. 在清单声明能力，在 preload 用相同 key 注册 handler。
2. 从设置添加本地开发插件，确认能力出现在“提供商”中。
3. 启用并选择默认渠道，由消费者调用 `tabdo.translate`、`tabdo.ocr` 或 `tabdo.providers.invokeProvider`。
4. 使用隔离数据验证错误、超时、并发及最后一次调用后的页面与子进程释放，并确认持久资料保留。

可安装的完整会话示例由 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins)维护。
