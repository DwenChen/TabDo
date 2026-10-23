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
pnpm test main/mediaOperations.test.ts
pnpm test:regressions --list
pnpm test:regressions media-note-interaction --list
pnpm test:e2e tests/e2e/media-batch.spec.ts
```

选择与修改相关的单元和流程验证；发行候选执行完整单元测试及受影响的 E2E。类型检查分别使用 `pnpm typecheck` 与 `pnpm typecheck:setting`。

## 隔离与截图

E2E 直接加载 `scripts/preview-main.cjs` 源码，自动准备回环服务器及临时 Electron 实例，数据与旧数据目录均显式隔离。测试不读写真实 `~/.tabdo`，不为 E2E 打包应用，也不安装额外 Chromium。

界面验证从真实宿主启动工具或插件，等待结果、文件行等稳定正文后直接捕获插件 WebContentsView。默认截取可见区域，不与宿主截图拼接。设备、多屏、DPI、声音或最终材质观感的边界单独记录。

## 结果归档

`pnpm test` 和 `pnpm test:e2e` 将输出、参数、时间和真实退出码写入 `.artifacts/runs/<时间-类型>/`。失败同样归档。当前截图和 trace 位于 `test-results/playwright/`，结束后另存到当次运行目录的 `playwright/`。

原始证据和用户数据不提交。维护条目记录实际命令、平台、结果及未执行项；跳过或仅列入分组不能视为通过。新增回归场景同步 `suites.json` 与相应 Bug 台账。
