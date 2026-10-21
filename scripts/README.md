# 脚本职责与稳定入口

| 分类           | 入口                                                                                                        | 作用                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 自动维护       | `project-maintenance.cjs`                                                                                   | 根临时材料归档、全量测试/变更/Bug 索引生成与校验、提交前记录检查  |
| 测试           | `run-tests.cjs`、`test-regressions.cjs`                                                                     | 自动留存测试输出和真实退出码；按历史故障分组执行                  |
| 源码预览       | `preview-local.cjs`、`preview-main.cjs`、`source-loader.cjs`、`preview-renderer.mjs`、`preview-preload.cjs` | 加载源码和预编译运行时；源码 E2E 复用稳定入口                     |
| 免安装预览     | `sync-portable-preview.cjs`、`verify-portable-preview.cjs`                                                  | 只切换程序资源、保留数据；只读核验完整产物                        |
| 显式重置       | `reset-portable-preview.cjs`                                                                                | 用户授权后备份并重置预览数据，不改程序                            |
| 原生构建       | `build-tools-screenshot.cjs`                                                                                | 固定来源版本的截图模块重现，构建中间文件进入 `.artifacts/native/` |
| 定位与性能     | `compare-windows-scanner.cjs`、`diagnose-windows-scanner-paths.cjs`、`measure-lmdb-memory.mjs`              | 专项目标的诊断，不应作为默认全量检查                              |
| 版本与发布支持 | `version-utils.mjs`、`update-metadata.mjs`、`updater.mjs`                                                   | 版本解析、云端制品更新元数据；仅有当前用户授权才能发布            |

不要在根目录新增 `_fix*.cjs` 等一次性脚本。临时诊断进入 `.artifacts/`，可复用的工具进入本目录并补 JSDoc、对应测试与维护条目。不得将凭据写入脚本、日志或变更记录。
