# 开发、预览与发布

本项目每轮改动必须遵守 [维护必读](maintenance.md)，目录、历史故障和测试入口见 [文档索引](README.md)。

第三方插件按 [新开发规范](plugin-development.md) 实现，独立索引在 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 管理。

涉及内置“工具”插件的开发，必须先阅读 [工具子组件开发原则](tools-development.md)。

## 无本地构建的预览

需要 Node.js 22+ 和 pnpm 9。首次准备仅安装 JavaScript 依赖与下载预编译 Electron，不编译原生模块：

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm --dir internal-plugins/setting install --ignore-workspace --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm preview:local
```

也可在已准备的工作区双击 `Preview.cmd`。预览使用 Electron 原运行时、上游原生模块和插件预加载模块；Vite 按需提供 Vue 源码，主进程 TypeScript 在加载时转换到内存，不生成 `out`、`dist` 或安装包。

主界面为 `127.0.0.1:5174`，设置插件为 `127.0.0.1:15177`，工具插件为 `127.0.0.1:15178`，均只绑定回环地址。源码预览数据在 `.local/source-preview-data`，旧数据隔离在 `.local/source-preview-legacy`。窗口退出后源码服务器保持运行，以支持备份后的自动重启；在终端按 Ctrl+C 结束预览。源码加载器只用于开发，不随发布版运行。

最新免安装预览位于 `.local/portable-preview/`，通过根目录 `PreviewPortable.cmd` 启动。同步执行 `pnpm preview:sync`，随后 `pnpm test:preview:resources`；默认不改配置和已安装插件。重置需要用户明确授权，完整备份后才执行 `pnpm preview:reset --confirm-reset`。

## 验证

```powershell
pnpm typecheck
pnpm typecheck:setting
pnpm test
pnpm test:e2e
```

端到端测试直接启动源码 Electron，复用预编译运行时并自动启动源码服务器，不执行本地构建和应用打包。所有测试使用临时数据根目录。截图为插件 WebContentsView 的可见区域，输出到 `test-results/playwright`。

`settings-window-stability.spec.ts` 通过真实窗口事件验证：并发打开设置不重复装配、保留当前设置页面、原生菜单失焦不隐藏窗口、X 关闭后延迟焦点通知不重开，以及过期的异步启动结果不重新弹出窗口。右上角菜单提供插件分离、开发者工具与结束运行；主搜索专属功能继续保持裁剪。

工具、剪贴板、中键、截图、插件加载/分离与免安装预览曾出现的问题，统一收录在[历史故障回归集](../tests/regressions/README.md)。先用 `pnpm test:regressions --list` 查看，再按 `clipboard`、`panel`、`host`、`screenshot`、`preview` 分组执行；小范围修复不默认运行全部回归。成品资源同步后可独立运行 `pnpm test:preview:resources` 只读核验，人工交互与配置/插件保留按清单逐项验收。

## 云端发布

仅在当前用户明确授权本次 push、云端构建和 release 时执行，详细检查顺序见 [维护必读](maintenance.md)。历史发布和自动归档不会延续授权。

更新 `package.json` 与 `changelog.md`，提交到 `main`，创建版本标签并推送：

```powershell
git push origin main
$version = node -p "require('./package.json').version"
$tag = "v$version"
git tag -a $tag -m "Release $tag"
git push origin $tag
```

`release.yml` 执行类型检查和单元测试，然后仅在 GitHub 托管的 Windows x64 运行器上构建。成功后发布 Windows 安装包、免安装 ZIP 和标准更新元数据 `latest.yml`。

Windows 归档采用标准压缩，避免 ZIP 极限压缩的多轮扫描拖慢发布。包体积通过功能裁剪、排除开发文件、移除其他平台原生资源及多余语言包控制。

不依赖上游服务器、发布同步密钥或上游签名证书。本版不执行 macOS 构建，也不发布 macOS 产物。后续如需要 Windows 代码签名，应由本仓库维护者配置自己的证书与流程。
