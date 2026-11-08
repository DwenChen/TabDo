<script setup>
import { onMounted, ref } from 'vue'
const props = defineProps({ action: { type: Object, required: true } })
const ready = ref(false),
  message = ref('正在准备演示录屏…'),
  revision = ref(0)
const editor = ref(null)

/**
 * 在正文被移除前卸载其React树，立即释放视频与GPU资源。
 * @returns 无返回值；尚未装载正文时无需处理。
 */
function releaseEditor() {
  editor.value?.contentWindow?.disposePresentationRenderer?.()
}

/**
 * 文件匹配载入编辑器；普通指令直接打开控制条，按前台交接挂载或卸载编辑正文。
 * @returns 初始化结束后的 Promise。
 */
async function initialize() {
  let stage = '启用临时常驻能力'
  try {
    await window.tabdo.enableTemporaryResident(true)
    stage = '加载演示服务'
    const files = props.action.type === 'files' ? props.action.payload : []
    const file = Array.isArray(files)
      ? files.find((entry) => /\.recordly$/i.test(entry.path || ''))?.path
      : undefined
    const runtime = await window.toolsPresentation.open(file)
    if (window.toolsLifecycle.signal.aborted) return
    window.toolsPresentation.onNavigate(runtime.prefix, (type) => {
      // 界面交给控制条时先释放旧编辑器，避免仅移除iframe而跳过组件清理。
      releaseEditor()
      ready.value = type === 'editor'
      if (ready.value) revision.value++
    })
    if (file) ready.value = true
    else {
      // 控制条失败时向用户展示错误，普通启动不装载任何编辑器正文。
      await window.electronAPI.showRecordingHud()
    }
  } catch (error) {
    message.value = `${stage}：${error.message || String(error)}`
    console.error('[演示录屏]', stage, error.stack || error)
  }
}
onMounted(initialize)
</script>
<template>
  <iframe
    v-if="ready"
    ref="editor"
    :key="revision"
    class="presentation-editor"
    src="./presentation.html?windowType=editor"
    title="演示编辑器"
    allow="camera; microphone; display-capture; fullscreen"
    allowfullscreen
  />
  <p v-else role="status">{{ message }}</p>
</template>
<style scoped>
.presentation-editor {
  width: 100%;
  height: 100vh;
  border: 0;
  display: block;
}
p {
  padding: 16px;
  color: var(--text-secondary);
}
</style>
