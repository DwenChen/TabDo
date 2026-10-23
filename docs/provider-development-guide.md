# Provider 开发指南

TabDo 使用 Provider 契约统一提供翻译与 OCR 能力。宿主负责目录、启用状态、默认选择和调用调度；实现可以来自内置能力或符合 `session-v1` 的第三方插件。先阅读 [插件规范](plugin-development.md)，内置资源配置见 [识别与翻译](builtin-providers.md)。

## 输入与输出

类型定义以 `src/shared/providerShared.ts` 为准。

| 类型          | 输入                   | 输出                             |
| ------------- | ---------------------- | -------------------------------- |
| `translation` | `{ text, from?, to? }` | `{ text, detectedFrom? }`        |
| `ocr`         | `{ image, lang? }`     | `{ text, blocks?, confidence? }` |

OCR 的 `image` 是本地路径、data URI 或 HTTP(S) URL，实际支持范围由实现决定。翻译输入是文本，没有 `image` 字段。OCR 行框使用提交图像中的像素坐标，左上为原点；每块包含 `text`、`left`、`top`、`right`、`bottom`。无法提供坐标时返回文本，不生成虚假行框。

AI 模型连接由独立配置管理；AI 翻译或识别适配可以作为内置 Provider 消费该配置。

## 声明与注册

在插件清单中声明稳定的插件标识、入口、preload、图标、生命周期和 Provider：

```json
{
  "name": "example-provider",
  "title": "翻译示例",
  "version": "1.0.0",
  "main": "index.html",
  "preload": "preload.js",
  "logo": "logo.png",
  "lifecycle": "session-v1",
  "features": [{ "code": "settings", "cmds": ["翻译配置"] }],
  "providers": {
    "custom-translation": {
      "type": "translation",
      "label": "自定义翻译"
    }
  }
}
```

`providers` 的 key 是插件内的声明身份，`type` 是能力类型。一个插件可以声明多个相同类型的渠道，但 key 必须不同。插件 Provider 的全局身份为 `plugin:<插件名>:<声明key>`，不得占用 `builtin-` 前缀。

preload 使用 `tabdo.registerProvider(key, handler)` 注册实现，key 必须与清单一致。handler 返回匹配契约的 Promise。网络请求、模型、Worker 和子进程登记到生命周期；用户确认的计算使用有限任务，并在结束后完整清理。参数和资源只属于当前调用，不依赖页面长期保活。

文档示例位于 [provider-example](examples/provider-example/README.md)；示例返回模拟结果，需要替换实现并补齐资源后才能作为正式插件交付。

## 消费能力

```js
const channels = await tabdo.providers.getProviders('translation')
const preferred = await tabdo.providers.getDefaultProvider('translation')
const translated = await tabdo.providers.invokeProvider('translation', { text: 'Hello', to: 'zh' })

const textResult = await tabdo.translate('Hello', { from: 'en', to: 'zh' })
const imageResult = await tabdo.ocr('/path/to/image.png', { lang: 'eng' })
```

便捷 API 的 options 支持 `providerId`。未指定时，宿主优先选用仍存在且已启用的默认渠道，再选择该类型首个已启用渠道；没有启用项时返回错误，不调用已停用渠道。显式 `providerId` 直接指定目标，不经过默认选择；调用方应根据用户启用和选择状态决定是否传入，宿主校验目标是否存在及类型是否匹配。调用方处理异常，并在请求替换或退出后拒绝迟到结果。

## 运行链与验收

宿主按声明查找实现。内置原生能力在按次工作进程中运行；插件 Provider 按需装载，注册就绪后调用，隐藏页面以引用计数管理，并发调用的最后一项结束后释放。不要恢复旧预加载、跟随宿主启动或退出保活设置。

至少验证声明与注册匹配、禁用与默认切换、异常和超时、并发调用、取消、最后一次调用后的资源归零以及用户配置保留。通过隔离数据的源码 Electron 验证真实调用链，相关单测为 `providerManager`、`providerConsumption`，源码回归见 `third-party-lifecycle` 和 `builtin-providers`。真实模型测试与识别精度分别记录，执行方法见 [内置能力验证](builtin-providers.md#验证入口)。
