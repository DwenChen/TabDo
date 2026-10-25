# TabDo 测试指南

测试按运行层组织，完整清单由 [项目与测试索引](../docs/generated/PROJECT_INDEX.md)生成；跨模块故障覆盖见 [回归分组](regressions/README.md)。

| 目录                      | 验证范围                                       |
| ------------------------- | ---------------------------------------------- |
| `main/`                   | 宿主服务、系统能力、插件、数据库、隔离与运行时 |
| `renderer/`               | 渲染器纯逻辑                                   |
| `scripts/`                | 归档、预览、维护与发布元数据                   |
| `e2e/`                    | 真实源码 Electron 用户流程                     |
| `regressions/suites.json` | 按历史故障编排测试，同一文件执行时去重         |

## 执行入口

```powershell
pnpm test
pnpm test tests/main/mediaOperations.test.ts
pnpm test:regressions --list
pnpm test:regressions media-note-interaction --list
pnpm test:regressions relay-feedback --list
pnpm test:e2e tests/e2e/media-batch.spec.ts
```

选择与修改相关的单元和流程验证；发行候选执行完整单元测试及受影响的 E2E。类型检查分别使用 `pnpm typecheck` 与 `pnpm typecheck:setting`。

## 隔离与截图

E2E 直接加载 `scripts/preview-main.cjs` 源码，自动准备回环服务器及临时 Electron 实例，数据与旧数据目录均显式隔离。测试不读写真实 `~/.tabdo`，不为 E2E 打包应用，也不安装额外 Chromium。

测试实例同时设置 `TABDO_DATA_ROOT` 与 `TABDO_LEGACY_USER_DATA_PATH`，专项同样使用源码入口和设置页服务 `TABDO_SETTING_DEV_SERVER_URL=http://127.0.0.1:15177`。多个依赖同一桌面或源码服务的专项按顺序运行，避免原生输入和端口互相干扰。

界面验证从真实宿主启动工具或插件，等待结果、文件行等稳定正文后直接捕获插件 WebContentsView。默认截取可见区域，不与宿主截图拼接。设备、多屏、DPI、声音或最终材质观感的边界单独记录。

## 结果归档

`pnpm test` 和 `pnpm test:e2e` 将输出、参数、时间和真实退出码写入 `.artifacts/runs/<时间-类型>/`。失败同样归档。当前截图和 trace 位于 `test-results/playwright/`，结束后另存到当次运行目录的 `playwright/`。

原始证据和用户数据不提交。维护条目记录实际命令、平台、结果及未执行项；跳过或仅列入分组不能视为通过。新增回归场景同步 `suites.json` 与相应 Bug 台账。

仓库文档审校与运行测试分开记录。修改本地教程时，使用 `local-tutorial` 源码 E2E 验证真实关于入口、全部章节与插图、搜索、离线阅读和重启后的资料保留；不把 Markdown 链接通过等同于应用页面通过。

push、云端构建和 Release 前必须审校并更新受影响文档，再执行 `pnpm docs:check` 与维护校验。`documentation` 回归组覆盖门禁的失效场景和实际教程页面；链接、清单或教程不一致时应阻止后续操作，人工审校仍须检查行为与语言。
