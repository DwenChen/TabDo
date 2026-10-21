<script setup>
import { onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import { syncPluginHeightToContent } from '@/utils/pluginHeight'
import {
  normalizeWebQuickOpenConfig,
  validateSearchTemplate,
  imageSearchEngines
} from '@shared/webQuickOpen'
const props = defineProps({ action: { type: Object, required: true } })
const config = ref(normalizeWebQuickOpenConfig(window.tabdo.dbStorage.getItem('web-quick-open')))
const tab = ref('text'),
  query = ref(''),
  message = ref(''),
  busy = ref(false)
let disposed = false
let previousWidth = 0
/**
 * 按实际网站行数收紧窗口，不以视口高度参与测量。
 * @returns {void} 无返回值。
 */
function syncHeight() {
  void nextTick(() => {
    if (!disposed)
      syncPluginHeightToContent(document.querySelector('.quick-open'), {
        minHeight: 220,
        maxHeight: 520
      })
  })
}
/**
 * 仅宽度变化时重新测量，避免高度回调循环。
 * @returns {void} 无返回值。
 */
function resize() {
  if (innerWidth !== previousWidth) {
    previousWidth = innerWidth
    syncHeight()
  }
}
/**
 * 校验并保存网站配置，只更新工具自己的配置项。
 * @returns {boolean} 是否保存成功。
 */
function save() {
  try {
    for (const site of config.value.sites) {
      if (!site.name.trim()) throw new Error('请填写网站名称')
      validateSearchTemplate(site.url)
    }
    window.tabdo.dbStorage.setItem('web-quick-open', JSON.parse(JSON.stringify(config.value)))
    message.value = '已保存'
    return true
  } catch (error) {
    message.value = error.message
    return false
  }
}
/**
 * 添加一个可填写的网址模板。
 * @returns {void} 无返回值。
 */
function addSite() {
  if (config.value.sites.length >= 30) return
  config.value.sites.push({ id: crypto.randomUUID(), name: '', url: '', enabled: true })
}
/**
 * 调整网站在二级选择菜单里的显示顺序。
 * @param {number} index 网站当前位置。
 * @param {number} step 移动方向。
 * @returns {void} 无返回值。
 */
function move(index, step) {
  const target = index + step
  if (target < 0 || target >= config.value.sites.length) return
  const [site] = config.value.sites.splice(index, 1)
  config.value.sites.splice(target, 0, site)
}
/**
 * 完整登记选择网站、上传及打开浏览器的操作链，隐藏后不复活旧页面。
 * @param {'text'|'image'} kind 搜索类型。
 * @param {string} input 用户明确选中的文字或图片。
 * @returns {Promise<void>} 搜索结束后的 Promise。
 */
async function launch(kind, input) {
  if (busy.value || !input) return
  if (!save()) return
  busy.value = true
  const request = {
    id: crypto.randomUUID(),
    kind,
    config: JSON.parse(JSON.stringify(config.value)),
    ...(kind === 'text' ? { text: input } : { image: input })
  }
  try {
    await window.toolsLifecycle.runTask(async (task) => {
      // 先登记完整操作，再隐藏窗口，以便菜单与上传仍有明确的任务归属。
      await window.tabdo.hideMainWindow()
      try {
        return await window.toolsQuickOpen.launch(request, task.signal)
      } catch (error) {
        window.tabdo.showNotification?.(`网页快开：${error.message}`)
        return { failed: true }
      }
    }, 100000)
  } catch (error) {
    if (!disposed) message.value = error.message
    window.tabdo.showNotification?.(`网页快开：${error.message}`)
  } finally {
    if (!disposed) busy.value = false
  }
}
/**
 * 从文件选择器接收用户主动提供的图片。
 * @param {Event} event 图片选择事件。
 * @returns {void} 无返回值。
 */
function chooseImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    void launch('image', window.toolsProvider.readImage(window.toolsProvider.filePath(file)))
  } catch (error) {
    message.value = error.message
  }
}
/**
 * 处理匹配指令；管理入口保持显示，匹配输入直接进入网站选择。
 * @returns {void} 无返回值。
 */
function enter() {
  const action = props.action
  if (action.code === 'web-search-text') {
    query.value = typeof action.payload === 'string' ? action.payload : ''
    if (query.value) void launch('text', query.value)
  } else if (action.code === 'web-search-image') {
    try {
      const image =
        action.type === 'files'
          ? window.toolsProvider.readImage(action.payload?.[0]?.path)
          : typeof action.payload === 'string'
            ? action.payload
            : ''
      if (image) void launch('image', image)
    } catch (error) {
      message.value = error.message
    }
  }
}
/**
 * 清空当前页面的临时输入引用，上传任务由自己的作用域收尾。
 * @returns {void} 无返回值。
 */
function dispose() {
  disposed = true
  query.value = ''
  message.value = ''
  window.removeEventListener('resize', resize)
}
window.toolsLifecycle.addCleanup(dispose)
watch([() => config.value.sites.length, tab, message], syncHeight)
onMounted(() => {
  window.addEventListener('resize', resize)
  resize()
  enter()
})
onUnmounted(dispose)
</script>
<template>
  <main class="quick-open">
    <form class="search-row" @submit.prevent="launch('text', query)">
      <input v-model="query" aria-label="搜索文字" placeholder="输入文字，在启用的网站中搜索" />
      <button class="primary" :disabled="busy || !query.trim()">文本搜索</button>
      <label class="image-button"
        >以图搜图<input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          @change="chooseImage"
      /></label>
    </form>
    <nav aria-label="网页快开设置">
      <button :class="{ active: tab === 'text' }" @click="tab = 'text'">文字网站</button
      ><button :class="{ active: tab === 'image' }" @click="tab = 'image'">识图引擎</button
      ><button class="save" @click="save">保存设置</button>
    </nav>
    <section v-if="tab === 'text'" class="sites">
      <div class="hint">
        勾选启用的网站；启用多个时，搜索前选择一个。网址用 {query} 代表搜索文字。
      </div>
      <article v-for="(site, index) in config.sites" :key="site.id" class="site">
        <input v-model="site.enabled" type="checkbox" :aria-label="`启用${site.name || '网站'}`" />
        <div class="fields">
          <input v-model="site.name" aria-label="网站名称" placeholder="网站名称" /><input
            v-model="site.url"
            aria-label="搜索网址"
            placeholder="https://example.com/search?q={query}"
          />
        </div>
        <div class="site-actions">
          <button :disabled="index === 0" aria-label="上移网站" @click="move(index, -1)">↑</button
          ><button
            :disabled="index === config.sites.length - 1"
            aria-label="下移网站"
            @click="move(index, 1)"
          >
            ↓</button
          ><button aria-label="删除网站" @click="config.sites.splice(index, 1)">×</button>
        </div>
      </article>
      <button class="add" @click="addSite">＋ 添加网站</button>
    </section>
    <section v-else class="engines">
      <div class="hint">执行时将选中的图片上传至所选引擎，在默认浏览器打开识图结果。</div>
      <label v-for="engine in imageSearchEngines" :key="engine.id"
        ><input v-model="config.imageEngines" type="checkbox" :value="engine.id" />{{
          engine.name
        }}</label
      >
    </section>
    <div v-if="message" class="message" role="status">{{ message }}</div>
  </main>
</template>
<style scoped>
.quick-open {
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  gap: 10px;
  font: var(--tool-font);
  color: var(--text-primary);
}
input,
button,
.image-button {
  font: inherit;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-surface);
  color: inherit;
  min-height: 32px;
  padding: 4px 9px;
}
button,
.image-button {
  cursor: pointer;
  white-space: nowrap;
}
button:hover,
.image-button:hover {
  background: var(--bg-hover);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
input:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}
.search-row {
  display: flex;
  gap: 6px;
}
.search-row > input {
  min-width: 0;
  flex: 1;
}
.primary,
.primary:hover {
  background: var(--primary-color);
  color: white;
  border-color: transparent;
}
.image-button input {
  display: none;
}
nav {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}
nav button {
  border: 0;
}
.active {
  color: var(--primary-color);
  background: var(--bg-accent-light);
}
.save {
  margin-left: auto;
}
.sites,
.engines {
  overflow: auto;
  min-height: 0;
  flex: 1;
  max-height: 340px;
}
.hint {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 10px;
}
.site {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
}
.fields {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.fields input {
  width: 100%;
  min-width: 0;
}
.site-actions {
  display: flex;
  gap: 3px;
}
.site-actions button {
  padding: 2px 6px;
  min-height: 28px;
}
.add {
  width: 100%;
  color: var(--primary-color);
}
input[type='checkbox'] {
  min-height: 0;
  width: 14px;
  height: 14px;
  accent-color: var(--primary-color);
}
.engines > label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 8px;
}
.message {
  flex: none;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .fields {
    grid-template-columns: 1fr;
  }
  .site-actions {
    flex-direction: column;
  }
  .search-row {
    flex-wrap: wrap;
  }
  .search-row > input {
    flex-basis: 100%;
  }
}
</style>
