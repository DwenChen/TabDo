# 项目与测试索引

> 由 `pnpm maintain` 自动生成；职责与规则见 [维护必读](../maintenance.md)。

## 稳定目录

- `src/`：Electron 宿主、预加载和主渲染器。
- `internal-plugins/`：随包设置与工具插件。
- `resources/`：运行时脚本、原生二进制与许可。
- `scripts/`：开发、维护、预览、验证及发布辅助入口。
- `tests/`：单测、源码 Electron E2E、回归集。
- `docs/`：架构、规范、变更与问题记录。
- `build/`：安装器与云端打包钩子。
- `.local/`：本机活跃预览和数据，不提交。
- `.artifacts/`：本机测试证据、历史材料和回退备份，不提交。

## 自动化测试文件

共 125 个文件；文件数不等于用例数，通过状态以每轮变更记录为准。

### tests/main（89）

- [tests/main/aiChatEventBatcher.test.ts](../../tests/main/aiChatEventBatcher.test.ts)
- [tests/main/aiChatTransport.test.ts](../../tests/main/aiChatTransport.test.ts)
- [tests/main/aiProtocol/adapters.test.ts](../../tests/main/aiProtocol/adapters.test.ts)
- [tests/main/aiProtocol/converters.test.ts](../../tests/main/aiProtocol/converters.test.ts)
- [tests/main/aiProviderService.test.ts](../../tests/main/aiProviderService.test.ts)
- [tests/main/aiRequestStatusTracker.test.ts](../../tests/main/aiRequestStatusTracker.test.ts)
- [tests/main/appWatcher.test.ts](../../tests/main/appWatcher.test.ts)
- [tests/main/appsCacheRefresh.test.ts](../../tests/main/appsCacheRefresh.test.ts)
- [tests/main/asyncPool.test.ts](../../tests/main/asyncPool.test.ts)
- [tests/main/backupArchive.test.ts](../../tests/main/backupArchive.test.ts)
- [tests/main/builtinProviderService.test.ts](../../tests/main/builtinProviderService.test.ts)
- [tests/main/clipboardCategory.test.ts](../../tests/main/clipboardCategory.test.ts)
- [tests/main/clipboardSelectionState.test.ts](../../tests/main/clipboardSelectionState.test.ts)
- [tests/main/clipboardShutdown.test.ts](../../tests/main/clipboardShutdown.test.ts)
- [tests/main/clipboardTypeDetection.test.ts](../../tests/main/clipboardTypeDetection.test.ts)
- [tests/main/clipboardWriteContentApi.test.ts](../../tests/main/clipboardWriteContentApi.test.ts)
- [tests/main/commandContextShared.test.ts](../../tests/main/commandContextShared.test.ts)
- [tests/main/commandMatchers.test.ts](../../tests/main/commandMatchers.test.ts)
- [tests/main/common.test.ts](../../tests/main/common.test.ts)
- [tests/main/consolePipeGuard.test.ts](../../tests/main/consolePipeGuard.test.ts)
- [tests/main/dataLocation.test.ts](../../tests/main/dataLocation.test.ts)
- [tests/main/databasePluginIsolation.test.ts](../../tests/main/databasePluginIsolation.test.ts)
- [tests/main/detachedWindowUpgrade.test.ts](../../tests/main/detachedWindowUpgrade.test.ts)
- [tests/main/dndManager.test.ts](../../tests/main/dndManager.test.ts)
- [tests/main/doubleTapManager.test.ts](../../tests/main/doubleTapManager.test.ts)
- [tests/main/electronUpdater.test.ts](../../tests/main/electronUpdater.test.ts)
- [tests/main/everythingBridge.test.ts](../../tests/main/everythingBridge.test.ts)
- [tests/main/floatingPointer.test.ts](../../tests/main/floatingPointer.test.ts)
- [tests/main/githubReleaseCatalog.test.ts](../../tests/main/githubReleaseCatalog.test.ts)
- [tests/main/httpRequestResources.test.ts](../../tests/main/httpRequestResources.test.ts)
- [tests/main/iconProtocol.test.ts](../../tests/main/iconProtocol.test.ts)
- [tests/main/iconUtils.test.ts](../../tests/main/iconUtils.test.ts)
- [tests/main/internalPluginDefaults.test.ts](../../tests/main/internalPluginDefaults.test.ts)
- [tests/main/internalPlugins.test.ts](../../tests/main/internalPlugins.test.ts)
- [tests/main/lensBrowserUpload.test.ts](../../tests/main/lensBrowserUpload.test.ts)
- [tests/main/lmdbUtils.test.ts](../../tests/main/lmdbUtils.test.ts)
- [tests/main/localEditionDefaults.test.ts](../../tests/main/localEditionDefaults.test.ts)
- [tests/main/localMarket.test.ts](../../tests/main/localMarket.test.ts)
- [tests/main/localSearchQuery.test.ts](../../tests/main/localSearchQuery.test.ts)
- [tests/main/macInstallCompatibility.test.ts](../../tests/main/macInstallCompatibility.test.ts)
- [tests/main/mediaOperations.test.ts](../../tests/main/mediaOperations.test.ts)
- [tests/main/modelAssets.test.ts](../../tests/main/modelAssets.test.ts)
- [tests/main/pluginCleanupWorker.test.ts](../../tests/main/pluginCleanupWorker.test.ts)
- [tests/main/pluginDataPath.test.ts](../../tests/main/pluginDataPath.test.ts)
- [tests/main/pluginDevProjectPackaging.test.ts](../../tests/main/pluginDevProjectPackaging.test.ts)
- [tests/main/pluginDevelopmentRegistry.test.ts](../../tests/main/pluginDevelopmentRegistry.test.ts)
- [tests/main/pluginDialogGetPath.test.ts](../../tests/main/pluginDialogGetPath.test.ts)
- [tests/main/pluginFeatureRuntimeNamespace.test.ts](../../tests/main/pluginFeatureRuntimeNamespace.test.ts)
- [tests/main/pluginInstaller.test.ts](../../tests/main/pluginInstaller.test.ts)
- [tests/main/pluginLaunchVisibility.test.ts](../../tests/main/pluginLaunchVisibility.test.ts)
- [tests/main/pluginMarketLatest.test.ts](../../tests/main/pluginMarketLatest.test.ts)
- [tests/main/pluginPreloadInternalApi.test.ts](../../tests/main/pluginPreloadInternalApi.test.ts)
- [tests/main/pluginRemovalCleanup.test.ts](../../tests/main/pluginRemovalCleanup.test.ts)
- [tests/main/pluginRuntimeNamespace.test.ts](../../tests/main/pluginRuntimeNamespace.test.ts)
- [tests/main/pluginRuntimeResources.test.ts](../../tests/main/pluginRuntimeResources.test.ts)
- [tests/main/pluginStorage.test.ts](../../tests/main/pluginStorage.test.ts)
- [tests/main/pluginUpgradeFlow.test.ts](../../tests/main/pluginUpgradeFlow.test.ts)
- [tests/main/pluginUserPreload.test.ts](../../tests/main/pluginUserPreload.test.ts)
- [tests/main/pluginVersion.test.ts](../../tests/main/pluginVersion.test.ts)
- [tests/main/providerConsumption.test.ts](../../tests/main/providerConsumption.test.ts)
- [tests/main/providerManager.test.ts](../../tests/main/providerManager.test.ts)
- [tests/main/providerShared.test.ts](../../tests/main/providerShared.test.ts)
- [tests/main/proxySessionReuse.test.ts](../../tests/main/proxySessionReuse.test.ts)
- [tests/main/recorderLayout.test.ts](../../tests/main/recorderLayout.test.ts)
- [tests/main/runtimeCompatibility.test.ts](../../tests/main/runtimeCompatibility.test.ts)
- [tests/main/screenCaptureResult.test.ts](../../tests/main/screenCaptureResult.test.ts)
- [tests/main/settingsOptimizedShortcutFallback.test.ts](../../tests/main/settingsOptimizedShortcutFallback.test.ts)
- [tests/main/startupDataMigrations.test.ts](../../tests/main/startupDataMigrations.test.ts)
- [tests/main/superPanelClipboardTrigger.test.ts](../../tests/main/superPanelClipboardTrigger.test.ts)
- [tests/main/systemPaths.test.ts](../../tests/main/systemPaths.test.ts)
- [tests/main/systemPluginOpenFolderRegex.test.ts](../../tests/main/systemPluginOpenFolderRegex.test.ts)
- [tests/main/tabdoProfileCompatibility.test.ts](../../tests/main/tabdoProfileCompatibility.test.ts)
- [tests/main/terminalLauncher.test.ts](../../tests/main/terminalLauncher.test.ts)
- [tests/main/toolsFiles.test.ts](../../tests/main/toolsFiles.test.ts)
- [tests/main/toolsHostLifecycle.test.ts](../../tests/main/toolsHostLifecycle.test.ts)
- [tests/main/toolsLifecycle.test.ts](../../tests/main/toolsLifecycle.test.ts)
- [tests/main/toolsRenameRules.test.ts](../../tests/main/toolsRenameRules.test.ts)
- [tests/main/updateSource.test.ts](../../tests/main/updateSource.test.ts)
- [tests/main/updaterWindow.test.ts](../../tests/main/updaterWindow.test.ts)
- [tests/main/uwpCache.test.ts](../../tests/main/uwpCache.test.ts)
- [tests/main/webQuickOpen.test.ts](../../tests/main/webQuickOpen.test.ts)
- [tests/main/windowManagerMacActivation.test.ts](../../tests/main/windowManagerMacActivation.test.ts)
- [tests/main/windowsExplorerCommands.test.ts](../../tests/main/windowsExplorerCommands.test.ts)
- [tests/main/windowsInstallCompatibility.test.ts](../../tests/main/windowsInstallCompatibility.test.ts)
- [tests/main/windowsLauncherWorkingDirectory.test.ts](../../tests/main/windowsLauncherWorkingDirectory.test.ts)
- [tests/main/windowsScanner.test.ts](../../tests/main/windowsScanner.test.ts)
- [tests/main/windowsScannerFlat.test.ts](../../tests/main/windowsScannerFlat.test.ts)
- [tests/main/windowsShortcutScannerRunner.test.ts](../../tests/main/windowsShortcutScannerRunner.test.ts)
- [tests/main/zpxArchive.test.ts](../../tests/main/zpxArchive.test.ts)

### tests/renderer（5）

- [tests/renderer/commandSearchResources.test.ts](../../tests/renderer/commandSearchResources.test.ts)
- [tests/renderer/commandUtils.test.ts](../../tests/renderer/commandUtils.test.ts)
- [tests/renderer/recommendationPins.test.ts](../../tests/renderer/recommendationPins.test.ts)
- [tests/renderer/settingsSubInputResources.test.ts](../../tests/renderer/settingsSubInputResources.test.ts)
- [tests/renderer/toolFeatureGroups.test.ts](../../tests/renderer/toolFeatureGroups.test.ts)

### tests/scripts（4）

- [tests/scripts/mediaRuntimeDependencies.test.ts](../../tests/scripts/mediaRuntimeDependencies.test.ts)
- [tests/scripts/portablePreviewResources.test.ts](../../tests/scripts/portablePreviewResources.test.ts)
- [tests/scripts/projectMaintenance.test.ts](../../tests/scripts/projectMaintenance.test.ts)
- [tests/scripts/updateMetadata.test.ts](../../tests/scripts/updateMetadata.test.ts)

### tests/e2e（27）

- [tests/e2e/builtin-models.spec.ts](../../tests/e2e/builtin-models.spec.ts)
- [tests/e2e/builtin-providers.spec.ts](../../tests/e2e/builtin-providers.spec.ts)
- [tests/e2e/console-pipe.spec.ts](../../tests/e2e/console-pipe.spec.ts)
- [tests/e2e/floating-pointer.spec.ts](../../tests/e2e/floating-pointer.spec.ts)
- [tests/e2e/lens-browser-upload.spec.ts](../../tests/e2e/lens-browser-upload.spec.ts)
- [tests/e2e/local-edition.spec.ts](../../tests/e2e/local-edition.spec.ts)
- [tests/e2e/media-batch.spec.ts](../../tests/e2e/media-batch.spec.ts)
- [tests/e2e/native-shutdown.spec.ts](../../tests/e2e/native-shutdown.spec.ts)
- [tests/e2e/overlay-surfaces.spec.ts](../../tests/e2e/overlay-surfaces.spec.ts)
- [tests/e2e/performance-budget.spec.ts](../../tests/e2e/performance-budget.spec.ts)
- [tests/e2e/plugin-cleanup-tray.spec.ts](../../tests/e2e/plugin-cleanup-tray.spec.ts)
- [tests/e2e/plugin-host-regressions.spec.ts](../../tests/e2e/plugin-host-regressions.spec.ts)
- [tests/e2e/recorder-overlay.spec.ts](../../tests/e2e/recorder-overlay.spec.ts)
- [tests/e2e/settings-cleanup.spec.ts](../../tests/e2e/settings-cleanup.spec.ts)
- [tests/e2e/settings-window-stability.spec.ts](../../tests/e2e/settings-window-stability.spec.ts)
- [tests/e2e/super-panel-selection.spec.ts](../../tests/e2e/super-panel-selection.spec.ts)
- [tests/e2e/tabdo-market.spec.ts](../../tests/e2e/tabdo-market.spec.ts)
- [tests/e2e/third-party-lifecycle.spec.ts](../../tests/e2e/third-party-lifecycle.spec.ts)
- [tests/e2e/tools-catalog.spec.ts](../../tests/e2e/tools-catalog.spec.ts)
- [tests/e2e/tools-clipboard.spec.ts](../../tests/e2e/tools-clipboard.spec.ts)
- [tests/e2e/tools-copy-commands.spec.ts](../../tests/e2e/tools-copy-commands.spec.ts)
- [tests/e2e/tools-expanded.spec.ts](../../tests/e2e/tools-expanded.spec.ts)
- [tests/e2e/tools-folder-break.spec.ts](../../tests/e2e/tools-folder-break.spec.ts)
- [tests/e2e/tools-lifecycle.spec.ts](../../tests/e2e/tools-lifecycle.spec.ts)
- [tests/e2e/tools-polish.spec.ts](../../tests/e2e/tools-polish.spec.ts)
- [tests/e2e/tools-recorder-web.spec.ts](../../tests/e2e/tools-recorder-web.spec.ts)
- [tests/e2e/tools-screenshot.spec.ts](../../tests/e2e/tools-screenshot.spec.ts)

## 历史回归分组

- `performance`：11 个单测文件、8 个源码 E2E 文件。
- `recorder-web`：6 个单测文件、6 个源码 E2E 文件。
- `tools-expanded`：5 个单测文件、3 个源码 E2E 文件。
- `clipboard`：4 个单测文件、1 个源码 E2E 文件。
- `panel`：2 个单测文件、2 个源码 E2E 文件。
- `host`：6 个单测文件、3 个源码 E2E 文件。
- `screenshot`：1 个单测文件、1 个源码 E2E 文件。
- `lifecycle`：2 个单测文件、2 个源码 E2E 文件。
- `maintenance`：2 个单测文件、0 个源码 E2E 文件。
- `release`：2 个单测文件、0 个源码 E2E 文件。
- `preview`：1 个单测文件、0 个源码 E2E 文件。
- `providers`：5 个单测文件、1 个源码 E2E 文件。
- `tools-polish`：1 个单测文件、2 个源码 E2E 文件。
- `tools-followup`：2 个单测文件、1 个源码 E2E 文件。
- `native-shutdown`：3 个单测文件、2 个源码 E2E 文件。
- `floating-pointer`：1 个单测文件、2 个源码 E2E 文件。
- `tools-commands`：2 个单测文件、3 个源码 E2E 文件。
- `panel-switch`：4 个单测文件、4 个源码 E2E 文件。
- `tools-visual`：0 个单测文件、4 个源码 E2E 文件。
- `tools-review`：5 个单测文件、6 个源码 E2E 文件。
- `media-tools`：4 个单测文件、4 个源码 E2E 文件。
- `recorder-reference`：6 个单测文件、5 个源码 E2E 文件。
- `clipboard-trigger`：3 个单测文件、0 个源码 E2E 文件。
- `settings-defaults`：6 个单测文件、7 个源码 E2E 文件。
- `tools-catalog`：6 个单测文件、4 个源码 E2E 文件。
- `overlay-surfaces`：0 个单测文件、1 个源码 E2E 文件。
- `tabdo-release`：9 个单测文件、6 个源码 E2E 文件。
