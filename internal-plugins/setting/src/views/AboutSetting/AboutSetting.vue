<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import UsageGuide from '@/views/UsageGuide/UsageGuide.vue'
import { useToast } from '@/components'
import { GITHUB_REPOSITORY_URL } from '@shared/updateSource'
const version = ref(''),
  automatic = ref(true),
  checking = ref(false)
const { info, error } = useToast()
const route = useRoute()
/** 打开项目或致谢链接。
 * @param url 目标地址。
 * @returns 无返回值。
 */
function open(url: string): void {
  window.tabdo.shellOpenExternal(url)
}
/** 从本仓库检查更新。
 * @returns 检查结束的 Promise。
 */
async function check(): Promise<void> {
  checking.value = true
  try {
    const result = await window.tabdo.internal.updaterCheckUpdate()
    if (result.error) error(result.error)
    else if (!result.hasUpdate) info('当前已是最新版本')
  } catch (cause) {
    error(String(cause))
  } finally {
    checking.value = false
  }
}
/** 保存自动更新偏好。
 * @returns 保存完成的 Promise。
 */
async function save(): Promise<void> {
  const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
  await window.tabdo.internal.dbPut('settings-general', {
    ...settings,
    autoCheckUpdate: automatic.value
  })
  await window.tabdo.internal.updaterSetAutoCheck(automatic.value)
}
onMounted(async () => {
  version.value = await window.tabdo.internal.getAppVersion()
  automatic.value =
    (await window.tabdo.internal.dbGet('settings-general'))?.autoCheckUpdate !== false
  if (route.query.guide === '1') {
    await nextTick()
    document.querySelector('#usage-guide-entry')?.scrollIntoView({ block: 'start' })
  }
})
</script>
<template>
  <main class="about-panel">
    <div class="edition">TABDO</div>
    <h1>TabDo</h1>
    <p>v{{ version }}</p>
    <p>围绕超级面板与插件工作流精简的本地工具箱。所有数据由你备份、保管和迁移。</p>
    <section id="usage-guide-entry"><UsageGuide compact /></section>
    <section>
      <h3>本版项目</h3>
      <p>DwenChen / TabDo</p>
      <button @click="open(GITHUB_REPOSITORY_URL)">访问本仓库</button>
      <button @click="open(GITHUB_REPOSITORY_URL + '/issues')">反馈问题</button>
    </section>
    <section>
      <h3>更新</h3>
      <p>更新来源：DwenChen/TabDo 的 GitHub Releases</p>
      <label><input v-model="automatic" type="checkbox" @change="save" /> 自动检查更新</label>
      <p>
        <button :disabled="checking" @click="check">{{ checking ? '检查中…' : '检查更新' }}</button>
      </p>
    </section>
    <section>
      <h3>致谢</h3>
      <p>本项目基于 ZToolsCenter/ZTools，感谢原作者 Zing 与社区贡献者提供的基础功能。</p>
      <button @click="open('https://github.com/ZToolsCenter/ZTools')">原项目</button>
      <p>
        感谢原插件开发项目与插件市场提供的设计基础，TabDo 插件按新的生命周期规范独立开发与维护。
      </p>
      <button @click="open('https://github.com/ZToolsCenter/ZTools-plugins')">原插件市场</button>
      <button @click="open('https://github.com/ZToolsCenter/ztools-plugin-cli')">
        原插件开发项目
      </button>
      <p>保留原项目 MIT 许可证与版权声明。</p>
    </section>
  </main>
</template>
<style scoped>
.about-panel {
  padding: 32px;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  color: var(--text-color);
}
.edition {
  letter-spacing: 0.2em;
  color: var(--primary-color);
  font-size: 12px;
}
p {
  line-height: 1.8;
  color: var(--text-secondary);
}
section {
  padding: 12px 0;
  border-top: 1px solid var(--divider-color);
  margin-top: 24px;
}
button {
  padding: 9px 14px;
  border: 1px solid var(--divider-color);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--text-color);
  cursor: pointer;
}
</style>
