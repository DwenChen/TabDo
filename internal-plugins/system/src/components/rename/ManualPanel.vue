<!-- 界面复用 batch-rename，来源与 MIT 许可见 public/LICENSE.batch-rename。 -->
<script setup lang="ts">
defineProps<{ modelValue: string; names: string[] }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  apply: [text: string]
}>()
</script>

<template>
  <section class="manual-panel" aria-label="手动编辑设置">
    <textarea
      :value="modelValue"
      aria-label="批量编辑文件名"
      placeholder="在这里输入或粘贴多行文本，每行一个完整文件名（含扩展名）"
      spellcheck="false"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>
    <div class="manual-actions">
      <span>按完整列表顺序应用，共 {{ names.length }} 项；也可直接编辑下方单行。</span>
      <button
        type="button"
        :disabled="!names.length"
        @click="emit('update:modelValue', names.join('\n'))"
      >
        载入当前名称
      </button>
      <button
        type="button"
        :disabled="!names.length || !modelValue.trim()"
        @click="emit('apply', modelValue)"
      >
        应用到预览
      </button>
    </div>
  </section>
</template>

<style scoped>
.manual-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  height: 100%;
}
.manual-panel textarea {
  width: 100%;
  min-height: 0;
  margin: 0;
  padding: 8px 10px;
  resize: none;
  border: 1px solid var(--border-input);
  border-radius: 8px;
  color: var(--text);
  background: var(--surface-subdued);
  font: inherit;
  line-height: 1.5;
}
.manual-panel textarea:focus {
  outline: 2px solid var(--focus-ring);
  border-color: var(--primary);
}
.manual-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.manual-actions span {
  flex: 1;
  color: var(--muted);
  font-size: 11px;
}
.manual-actions button {
  flex: none;
  padding: 5px 10px;
  color: var(--primary);
  background: var(--surface-subdued);
  font-size: 12px;
}
</style>
