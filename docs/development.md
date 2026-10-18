# 开发、预览与发布

## 无本地构建的预览

需要 Node.js 22+ 和 pnpm 9。首次准备仅安装 JavaScript 依赖与下载预编译 Electron，不编译原生模块：

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm --dir internal-plugins/setting install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm preview:local
```

也可在已准备的工作区双击 `Preview.cmd`。预览使用 Electron 原运行时、上游原生模块和插件预加载模块；Vite 按需提供 Vue 源码，主进程 TypeScript 在加载时转换到内存，不生成 `out`、`dist` 或安装包。

主界面为 `127.0.0.1:5174`，设置插件为 `127.0.0.1:15177`，均只绑定回环地址。数据放在 `_preview-data`。窗口退出后源码服务器保持运行，以支持备份后的自动重启；在终端按 Ctrl+C 结束预览。源码加载器只用于开发，不随发布版运行。

## 验证

```powershell
pnpm typecheck
pnpm typecheck:setting
pnpm test
pnpm test:e2e
```

端到端测试直接启动源码 Electron，复用预编译运行时并自动启动源码服务器，不执行本地构建和应用打包。所有测试使用临时数据根目录。截图为插件 WebContentsView 的可见区域，输出到 `test-results/playwright`。

## 云端发布

更新 `package.json` 与 `changelog.md`，提交到 `main`，创建版本标签并推送：

```powershell
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

`release.yml` 执行类型检查和单元测试，然后仅在 GitHub 托管的 Windows x64 运行器上构建。成功后发布 Windows 安装包、免安装 ZIP 和标准更新元数据 `latest.yml`。

Windows 归档采用标准压缩，避免 ZIP 极限压缩的多轮扫描拖慢发布。包体积通过功能裁剪、排除开发文件、移除其他平台原生资源及多余语言包控制。

不依赖上游服务器、发布同步密钥或上游签名证书。本版不执行 macOS 构建，也不发布 macOS 产物。后续如需要 Windows 代码签名，应由本仓库维护者配置自己的证书与流程。
