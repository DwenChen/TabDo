<script setup lang="ts">
import { onMounted, ref } from 'vue'
const busy = ref(false)
const message = ref('')
/** 发起完整备份或恢复，原生对话框负责最终确认。
 * @param action 备份操作。
 * @returns 操作完成后的 Promise。
 */
async function run(action: 'export' | 'restore'): Promise<void> {
  busy.value = true
  message.value = ''
  try {
    await window.tabdo.internal.backupRun(action)
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  const result = await window.tabdo.internal.backupResult()
  if (result)
    message.value = result.success
      ? `操作完成：${result.file}${result.rollback ? '；旧数据保存在 ' + result.rollback : ''}`
      : `操作失败：${result.error}`
})
</script>
<template>
  <main class="backup-panel">
    <h2>数据备份与迁移</h2>
    <p>将完整的本地环境保存为一个 .ztbackup 文件，随时恢复或迁移到另一台电脑。</p>
    <div class="backup-card">
      <h3>完整数据备份</h3>
      <p>
        包括所有设置与配置、提供商密钥、已安装插件、插件数据库与附件、插件专属数据、剪贴板历史和本地会话。缓存与运行日志不参与迁移。
      </p>
      <button :disabled="busy" @click="run('export')">导出完整备份</button>
    </div>
    <div class="backup-card">
      <h3>从备份恢复</h3>
      <p>
        恢复前检查文件清单与 SHA-256 校验和。恢复后自动重启，旧数据保留在数据目录旁的 .rollback
        目录。
      </p>
      <button :disabled="busy" @click="run('restore')">选择备份并恢复</button>
    </div>
    <p>
      备份与恢复将在应用退出后执行，完成后自动重启。备份包含私密数据，请存放在可信位置。跨系统迁移后请检查本地路径与原生插件。
    </p>
    <p v-if="message" role="status">{{ message }}</p>
  </main>
</template>
<style scoped>
.backup-panel {
  padding: 28px;
  overflow: auto;
  height: 100%;
  box-sizing: border-box;
  color: var(--text-color);
}
p {
  line-height: 1.8;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.backup-card {
  padding: 20px;
  margin: 20px 0;
  border: 1px solid var(--divider-color);
  border-radius: 12px;
}
button {
  padding: 10px 18px;
  border: 0;
  border-radius: 8px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
</style>
