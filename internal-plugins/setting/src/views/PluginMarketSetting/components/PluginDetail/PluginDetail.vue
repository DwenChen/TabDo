<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PluginDetail as SharedPluginDetail } from '@/components'
import type { PluginUninstallOptions, TabId } from '@/components'
import type { PluginDownloadState } from '../types'
const props = defineProps<{
  plugin: any
  isLoading?: boolean
  downloadState?: PluginDownloadState
  isRunning?: boolean
  initialTab?: TabId
  targetCommentId?: number | null
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'open'): void
  (e: 'download'): void
  (e: 'upgrade'): void
  (e: 'uninstall', options: PluginUninstallOptions): void
  (e: 'kill'): void
  (e: 'open-folder'): void
  (e: 'package'): void
  (e: 'reload'): void
}>()

const comments = ref<Array<{ id: number; nickname: string; uid: string; content: string }>>([])
const page = ref(1)
const total = ref(0)
const message = ref('')
const showComments = ref(props.initialTab === 'comments')
/** 匿名读取插件评论。
 * @returns 读取完成后的 Promise。
 */
async function load(): Promise<void> {
  try {
    const result = await window.ztools.internal.fetchPluginMarketComments(
      props.plugin.name,
      page.value,
      20
    )
    if (!result.success) throw Error(result.error)
    comments.value = result.data?.items || []
    total.value = result.data?.page.total || 0
  } catch (error) {
    message.value = String(error)
  }
}
/** 切换详情标签。
 * @param tab 详情标签。
 * @returns 无返回值。
 */
function handleTabSwitch(tab: TabId): void {
  showComments.value = tab === 'comments'
  if (showComments.value) void load()
}
/** 按页查看评论。
 * @param delta 页数偏移。
 * @returns 无返回值。
 */
function turn(delta: number): void {
  page.value += delta
  void load()
}
onMounted(() => {
  if (showComments.value) void load()
})
</script>
<template>
  <SharedPluginDetail
    :plugin="plugin"
    :is-loading="isLoading"
    :download-state="downloadState"
    :is-running="isRunning"
    :show-comments="true"
    :show-commands="false"
    :show-data="false"
    :show-size="true"
    :show-download-count="true"
    :initial-tab="initialTab"
    @back="$emit('back')"
    @open="$emit('open')"
    @download="$emit('download')"
    @upgrade="$emit('upgrade')"
    @uninstall="$emit('uninstall', $event)"
    @kill="$emit('kill')"
    @open-folder="$emit('open-folder')"
    @package="$emit('package')"
    @reload="$emit('reload')"
    @tab-switch="handleTabSwitch"
  >
    <template #extra-tabs
      ><section v-if="showComments" class="comments-panel">
        <p>公共评论 · 只读浏览</p>
        <p v-if="message">{{ message }}</p>
        <article v-for="item in comments" :key="item.id">
          <strong>{{ item.nickname || item.uid }}</strong>
          <p>{{ item.content }}</p>
        </article>
        <button :disabled="page <= 1" @click="turn(-1)">上一页</button> {{ page }}
        <button :disabled="page * 20 >= total" @click="turn(1)">下一页</button>
      </section></template
    ></SharedPluginDetail
  >
</template>
<style scoped>
.comments-panel {
  padding: 20px;
}
article {
  padding: 12px;
  border-bottom: 1px solid var(--divider-color);
}
p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
