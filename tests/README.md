# 测试与证据

完整文件清单由 [测试索引](../docs/generated/PROJECT_INDEX.md)生成；历史故障场景、分组命令、人工验收边界见 [regressions/README.md](regressions/README.md)。

- `main/`：宿主服务、系统能力、插件、数据隔离和运行时单测。
- `renderer/`：纯渲染器逻辑单测。
- `scripts/`：归档、预览资源、维护和发布元数据脚本单测。
- `e2e/`：源码 Electron 流程，用临时数据与旧数据目录启动，复用 Electron Chromium。
- `regressions/suites.json`：多个历史问题可引用同一个测试文件，执行时去重。

`pnpm test [文件]` 和 `pnpm test:e2e [文件]` 自动留存 `.artifacts/runs/<时间-类型>/output.log` 与 `result.json`，失败也归档；当前 E2E 截图/trace 输出到 `test-results/playwright/`，结束后另存到本轮运行目录的 `playwright/`，防止下一轮覆盖。本机原始证据和用户数据不提交。记录“通过”必须同时说明本轮命令、适用平台和退出结果；未执行或跳过不能当作通过。
