<script setup>
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'

// 先接收进入事件，再按指令加载正文；不创建未使用工具的实例，也不缓存已退出的视图。
const ClipboardApp = defineAsyncComponent(() => import('./ClipboardApp.vue'))
const ProviderTools = defineAsyncComponent(() => import('./components/ProviderTools.vue'))
const FileRenamer = defineAsyncComponent(() => import('./components/FileRenamer.vue'))
const BreakFolder = defineAsyncComponent(() => import('./components/BreakFolder.vue'))
const QrScanner = defineAsyncComponent(() => import('./components/QrScanner.vue'))
const FloatingLauncher = defineAsyncComponent(() => import('./components/FloatingLauncher.vue'))
const LocalSearch = defineAsyncComponent(() => import('./components/LocalSearch.vue'))
const ScreenRecorder = defineAsyncComponent(() => import('./components/ScreenRecorder.vue'))
const PresentationRecorder = defineAsyncComponent(
  () => import('./components/PresentationRecorder.vue')
)
const WebQuickOpen = defineAsyncComponent(() => import('./components/WebQuickOpen.vue'))
const MediaBatch = defineAsyncComponent(() => import('./components/MediaBatch.vue'))

const action = ref(null)
const revision = ref(0)
/**
 * 根据宿主指令选择子组件，重入时销毁旧组件的界面资源。
 * @param next 本次指令与输入。
 * @returns 无返回值。
 */
function enter(next) {
  if (window.toolsLifecycle.signal.aborted) return
  action.value = next
  revision.value++
}
onMounted(() => window.tabdo.onPluginEnter(enter))
onUnmounted(() => window.tabdo.onPluginEnter(null))
</script>
<template>
  <ClipboardApp v-if="action?.code === 'clipboard'" :key="revision" />
  <ProviderTools
    v-else-if="['recognize', 'latex-recognize'].includes(action?.code)"
    :key="revision"
    :action="action"
  />
  <FileRenamer v-else-if="action?.code === 'file-renamer'" :key="revision" :action="action" />
  <BreakFolder v-else-if="action?.code === 'folder-break'" :key="revision" :action="action" />
  <QrScanner v-else-if="action?.code === 'qrcode-scan'" :key="revision" :action="action" />
  <FloatingLauncher
    v-else-if="
      ['image-annotate', 'float-content', 'floating-relay', 'sticky-note'].includes(action?.code)
    "
    :key="revision"
    :action="action"
  />
  <LocalSearch v-else-if="action?.code === 'local-search'" :key="revision" :action="action" />
  <PresentationRecorder
    v-else-if="['presentation-recorder', 'presentation-editor'].includes(action?.code)"
    :key="revision"
    :action="action"
  />
  <ScreenRecorder
    v-else-if="
      ['screen-recorder', 'screen-recorder-region', 'screen-recorder-stop'].includes(action?.code)
    "
    :key="revision"
    :action="action"
  />
  <MediaBatch
    v-else-if="
      ['image-batch', 'image-batch-folder', 'image-manual-crop', 'image-merge'].includes(
        action?.code
      )
    "
    :key="revision"
    :action="action"
    media="image"
  />
  <MediaBatch
    v-else-if="action?.code === 'video-batch'"
    :key="revision"
    :action="action"
    media="video"
  />
  <WebQuickOpen
    v-else-if="['web-quick-open', 'web-search-text', 'web-search-image'].includes(action?.code)"
    :key="revision"
    :action="action"
  />
</template>
