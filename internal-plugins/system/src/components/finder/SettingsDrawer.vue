<script setup>
import { nextTick, ref, watch } from 'vue'
import FinderIcon from './FinderIcon.vue'
const props = defineProps({
  open: Boolean,
  categories: { type: Array, default: () => [] },
  matchPathEnabled: Boolean
})
const emit = defineEmits([
  'close',
  'addCategory',
  'updateCategory',
  'removeCategory',
  'setCategoryEnabled',
  'setMatchPathEnabled',
  'reorderCategories',
  'resetCategoryOrder'
])
const label = ref('')
const drawer = ref(null)
const rule = ref('')
const editingCategoryId = ref()
const isAdding = ref(false)
const draggedIndex = ref(null)
const dragOverIndex = ref(null)
const dropPosition = ref(null)
watch(
  () => props.open,
  () => {
    resetDraft()
    resetDragState()
    if (props.open) void nextTick(() => drawer.value?.focus())
  }
)
/**
 * 提交有效的自定义分类名称与规则。
 * @returns 无返回值。
 */
function submitCategory() {
  const trimmedLabel = label.value.trim()
  const trimmedRule = rule.value.trim()
  if (!trimmedLabel || !trimmedRule) return
  const categoryInput = {
    label: trimmedLabel,
    rule: trimmedRule
  }
  if (editingCategoryId.value) {
    emit('updateCategory', editingCategoryId.value, categoryInput)
  } else {
    emit('addCategory', categoryInput)
  }
  resetDraft()
}
/**
 * 准备新增分类表单。
 * @returns 无返回值。
 */
function startAddCategory() {
  editingCategoryId.value = undefined
  isAdding.value = true
  label.value = ''
  rule.value = ''
  resetDragState()
}
/**
 * 将指定自定义分类带入编辑表单。
 * @param category 目标分类。
 * @returns 无返回值。
 */
function editCategory(category) {
  if (category.kind !== 'custom') return
  isAdding.value = false
  editingCategoryId.value = category.id
  label.value = category.label
  rule.value = category.rule
  resetDragState()
}
/**
 * 请求删除自定义分类，内置分类由父层保护。
 * @param category 目标分类。
 * @returns 无返回值。
 */
function removeCategory(category) {
  if (editingCategoryId.value === category.id) resetDraft()
  emit('removeCategory', category)
}
/**
 * 清空本次分类编辑状态。
 * @returns 无返回值。
 */
function resetDraft() {
  editingCategoryId.value = undefined
  isAdding.value = false
  label.value = ''
  rule.value = ''
}
/**
 * 关闭设置并清理临时编辑状态。
 * @returns 无返回值。
 */
function closeDrawer() {
  resetDraft()
  resetDragState()
  emit('close')
}
/**
 * 显示分类来源。
 * @param category 目标分类。
 * @returns 处理后的数值或状态。
 */
function categoryTypeLabel(category) {
  return category.kind === 'custom' ? '自定义' : '内置'
}
/**
 * 发布分类的启用状态。
 * @param category 目标分类。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function handleCategoryEnabledChange(category, event) {
  const enabled = readChecked(event)
  emit('setCategoryEnabled', category.id, enabled)
}
/**
 * 发布同时匹配路径的开关。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function handleMatchPathEnabledChange(event) {
  emit('setMatchPathEnabled', readChecked(event))
}
/**
 * 安全读取原生复选框状态。
 * @param event 当前原生事件。
 * @returns 处理后的数值或状态。
 */
function readChecked(event) {
  return event.target instanceof HTMLInputElement && event.target.checked
}
/**
 * 记录分类排序拖动起点。
 * @param index 当前分类序号。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onDragStart(index, event) {
  if (editingCategoryId.value !== undefined || isAdding.value) {
    event.preventDefault()
    return
  }
  draggedIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}
/**
 * 确定分类插入位置。
 * @param index 当前分类序号。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onDragOver(index, event) {
  if (draggedIndex.value === null) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  const currentTarget = event.currentTarget
  if (currentTarget) {
    const rect = currentTarget.getBoundingClientRect()
    const offsetY = event.clientY - rect.top
    const isBelow = offsetY > rect.height / 2
    dragOverIndex.value = index
    dropPosition.value = isBelow ? 'below' : 'above'
  }
}
/**
 * 指针离开时撤销当前插入标记。
 * @param index 当前分类序号。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onDragLeave(index, event) {
  if (dragOverIndex.value === index) {
    const related = event.relatedTarget
    const current = event.currentTarget
    if (!current || !related || !current.contains(related)) {
      dragOverIndex.value = null
      dropPosition.value = null
    }
  }
}
/**
 * 发布分类顺序变化并清理拖动状态。
 * @param targetIndex 目标插入序号。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onDrop(targetIndex, event) {
  event.preventDefault()
  const from = draggedIndex.value
  if (from === null) return
  let to = targetIndex
  if (dropPosition.value === 'below' && from < targetIndex) {
    to = targetIndex
  } else if (dropPosition.value === 'below' && from > targetIndex) {
    to = targetIndex + 1
  } else if (dropPosition.value === 'above' && from < targetIndex) {
    to = targetIndex - 1
  } else if (dropPosition.value === 'above' && from > targetIndex) {
    to = targetIndex
  }
  const clampedTo = Math.max(0, Math.min(props.categories.length - 1, to))
  if (from !== clampedTo) {
    emit('reorderCategories', from, clampedTo)
  }
  resetDragState()
}
/**
 * 结束分类拖动。
 * @returns 无返回值。
 */
function onDragEnd() {
  resetDragState()
}
/**
 * 清空分类拖动标记。
 * @returns 无返回值。
 */
function resetDragState() {
  draggedIndex.value = null
  dragOverIndex.value = null
  dropPosition.value = null
}
</script>

<template>
  <Transition name="settings-panel" appear>
    <div v-if="open" class="settings-layer">
      <div class="settings-backdrop" @click="closeDrawer"></div>
      <section
        ref="drawer"
        class="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="文件搜索设置"
        tabindex="-1"
        @keydown.esc.stop="closeDrawer"
      >
        <header class="settings-header">
          <div>
            <h2>文件搜索设置</h2>
          </div>
          <button
            type="button"
            class="drawer-close"
            aria-label="关闭文件搜索设置"
            @click="closeDrawer"
          >
            ×
          </button>
        </header>

        <section class="settings-section">
          <slot name="connection"></slot>
          <section class="settings-card search-settings">
            <div>
              <h3>匹配路径</h3>
              <p>启用后，普通关键字会同时匹配路径和文件名，可以快速过滤同名文件。</p>
              <p>
                如 <code>config.json .codex user</code> 可以快速搜出
                <code>**/User/**/.codex/**/config.json </code>文件
              </p>
            </div>
            <label class="settings-switch">
              <input
                type="checkbox"
                :checked="matchPathEnabled"
                @change="handleMatchPathEnabledChange"
              />
              <span class="switch-track"></span>
              <span>同时搜索路径</span>
            </label>
          </section>

          <section class="settings-card category-settings">
            <div class="category-section-header">
              <div>
                <h3>分组管理</h3>
                <p>关闭后，该分组不会显示在左侧分组栏。内置分组不支持删除。</p>
              </div>
              <button
                type="button"
                class="category-reset-order-btn"
                title="恢复默认排序"
                aria-label="恢复默认排序"
                @click="emit('resetCategoryOrder')"
              >
                <FinderIcon name="reset" :size="16" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>

            <div class="category-list">
              <div class="category-list-header">
                <span class="category-handle-col"></span>
                <span>启用</span>
                <span>名称</span>
                <span>规则</span>
                <span>类型</span>
                <span>操作</span>
              </div>

              <template v-for="(category, index) in categories" :key="category.id">
                <form
                  v-if="editingCategoryId === category.id"
                  class="category-row category-edit-row"
                  @submit.prevent="submitCategory"
                >
                  <span class="category-drag-handle disabled">
                    <FinderIcon
                      name="grip"
                      class="category-drag-icon"
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                  <label class="category-switch" title="启用该分组">
                    <input
                      type="checkbox"
                      :checked="category.enabled"
                      @change="handleCategoryEnabledChange(category, $event)"
                    />
                    <span class="switch-track"></span>
                  </label>
                  <input v-model="label" class="category-inline-input" autocomplete="off" />
                  <input v-model="rule" class="category-inline-input" autocomplete="off" />
                  <span class="category-type">自定义</span>
                  <span class="category-edit-actions">
                    <button type="submit">保存</button>
                    <button type="button" @click="resetDraft">取消</button>
                  </span>
                </form>

                <div
                  v-else
                  class="category-row"
                  :class="{
                    disabled: !category.enabled,
                    'is-dragging': draggedIndex === index,
                    'drag-over-top':
                      dragOverIndex === index && dropPosition === 'above' && draggedIndex !== index,
                    'drag-over-bottom':
                      dragOverIndex === index && dropPosition === 'below' && draggedIndex !== index
                  }"
                  :draggable="editingCategoryId === undefined && !isAdding"
                  @dragstart="onDragStart(index, $event)"
                  @dragover="onDragOver(index, $event)"
                  @dragleave="onDragLeave(index, $event)"
                  @drop="onDrop(index, $event)"
                  @dragend="onDragEnd"
                >
                  <span class="category-drag-handle" title="拖动调整顺序" aria-label="拖动调整顺序">
                    <FinderIcon
                      name="grip"
                      class="category-drag-icon"
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                  <label class="category-switch" title="启用该分组">
                    <input
                      type="checkbox"
                      :checked="category.enabled"
                      @change="handleCategoryEnabledChange(category, $event)"
                    />
                    <span class="switch-track"></span>
                  </label>
                  <span class="category-name">{{ category.label }}</span>
                  <span class="category-rule" :title="category.rule || '全部'">{{
                    category.rule || '全部'
                  }}</span>
                  <span class="category-type">{{ categoryTypeLabel(category) }}</span>
                  <span class="category-actions">
                    <template v-if="category.kind === 'custom'">
                      <button type="button" @click="editCategory(category)">编辑</button>
                      <button type="button" class="danger-action" @click="removeCategory(category)">
                        删除
                      </button>
                    </template>
                    <span v-else class="built-in-note">内置</span>
                  </span>
                </div>
              </template>

              <form
                v-if="isAdding"
                class="category-row category-edit-row"
                @submit.prevent="submitCategory"
              >
                <span class="category-drag-handle disabled">
                  <span class="category-add-marker">＋</span>
                </span>
                <span></span>
                <input
                  v-model="label"
                  class="category-inline-input"
                  autocomplete="off"
                  placeholder="例如 日志"
                />
                <input
                  v-model="rule"
                  class="category-inline-input"
                  autocomplete="off"
                  placeholder="log;txt 或 path:C:\Windows"
                />
                <span class="category-type">自定义</span>
                <span class="category-edit-actions">
                  <button type="submit">添加</button>
                  <button type="button" @click="resetDraft">取消</button>
                </span>
              </form>

              <button
                v-else
                type="button"
                class="category-row category-add-trigger"
                @click="startAddCategory"
              >
                <span>＋ 添加自定义分组</span>
              </button>
            </div>
          </section>
        </section>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.settings-layer {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: grid;
  align-items: end;
}

.settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 35%);
}

.settings-drawer {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  position: relative;
  width: 100%;
  height: calc(100% - 48px);
  max-height: calc(100% - 48px);
  box-sizing: border-box;
  padding: 12px 0 0;
  font: var(--tool-font);
  outline: none;
  overflow: hidden;
  color: #f5f7fa;
  background: #2d2f32;
  border-top: 1px solid #55585c;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -16px 40px rgb(0 0 0 / 35%);
}

.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: background-color 0.28s ease;
}

.settings-panel-enter-active .settings-backdrop,
.settings-panel-leave-active .settings-backdrop {
  transition: opacity 0.28s ease;
}

.settings-panel-enter-active .settings-drawer {
  transition:
    transform 0.32s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.24s ease;
  will-change: transform, opacity;
}

.settings-panel-leave-active .settings-drawer {
  transition:
    transform 0.22s cubic-bezier(0.32, 0, 0.67, 0),
    opacity 0.14s ease 0.08s;
  will-change: transform, opacity;
}

.settings-panel-enter-from .settings-backdrop,
.settings-panel-leave-to .settings-backdrop {
  opacity: 0;
}

.settings-panel-enter-from .settings-drawer {
  opacity: 0;
  transform: translate3d(0, 100%, 0);
}

.settings-panel-leave-to .settings-drawer {
  opacity: 0.96;
  transform: translate3d(0, 105%, 0);
}

.settings-panel-enter-to .settings-drawer,
.settings-panel-leave-from .settings-drawer {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px 0 20px;
}

.settings-header h2 {
  margin: 0;
  font-size: 15px;
}

.drawer-close,
.category-group-toggle,
.category-actions button,
.category-edit-actions button,
.category-add-trigger {
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.drawer-close {
  width: 30px;
  height: 30px;
  background: transparent;
  border-radius: 6px;
  color: #cbd1d8;
  font-size: 24px;
  line-height: 1;
}

.drawer-close:focus,
.drawer-close:focus-visible,
.category-inline-input:focus,
.category-inline-input:focus-visible,
.category-group-toggle:focus,
.category-group-toggle:focus-visible,
.category-actions button:focus,
.category-actions button:focus-visible,
.category-edit-actions button:focus,
.category-edit-actions button:focus-visible,
.category-add-trigger:focus,
.category-add-trigger:focus-visible {
  outline: none;
  box-shadow: none;
}

.settings-section {
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 0 14px 14px;
}

.settings-section::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.settings-card {
  box-sizing: border-box;
  padding: 14px;
  background: #303234;
  border: 1px solid #47494c;
  border-radius: 8px;
}

.search-settings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.category-settings {
  display: grid;
  gap: 12px;
}

.category-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-card h3 {
  margin: 0;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
}

.settings-card p {
  margin: 4px 0 0;
  color: #aeb4bb;
  font-size: 12px;
}

.settings-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #cbd1d8;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.settings-switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.category-list {
  display: grid;
  border: 1px solid #3f4246;
  border-radius: 6px;
  overflow: hidden;
}

.category-list-header,
.category-row {
  display: grid;
  grid-template-columns: 20px 38px minmax(70px, 100px) minmax(80px, 1fr) 48px 86px;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
}

.category-list-header {
  color: #aeb4bb;
  background: #242629;
  font-size: 12px;
}

.category-reset-order-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #727982;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.category-reset-order-btn:hover {
  color: #cbd1d8;
  background: #3a3d42;
}

.category-reset-order-btn:focus,
.category-reset-order-btn:focus-visible {
  outline: none;
  color: #cbd1d8;
  background: #3a3d42;
}

.category-row {
  border-top: 1px solid #3f4246;
  background: #303234;
  font-size: 13px;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}

.category-row.is-dragging {
  opacity: 0.35;
  background: #25272a;
}

.category-row.drag-over-top {
  box-shadow: inset 0 2px 0 0 var(--primary-color);
}

.category-row.drag-over-bottom {
  box-shadow: inset 0 -2px 0 0 var(--primary-color);
}

.category-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 24px;
  color: #727982;
  cursor: grab;
  border-radius: 4px;
  user-select: none;
}

.category-drag-handle:hover {
  color: #cbd1d8;
  background: #3a3d42;
}

.category-drag-handle.disabled {
  opacity: 0.35;
  cursor: default;
}

.category-drag-handle.disabled:hover {
  color: #727982;
  background: transparent;
}

.category-drag-icon {
  display: block;
  pointer-events: none;
}

.category-row.disabled .category-name,
.category-row.disabled .category-rule,
.category-row.disabled .category-type {
  opacity: 0.5;
}

.category-switch {
  display: inline-flex;
  justify-self: start;
  cursor: pointer;
}

.category-switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  width: 32px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #6c7178;
  transition: background-color 0.15s ease;
}

.switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #f2f4f7;
  transition: transform 0.15s ease;
}

.settings-switch input:checked + .switch-track,
.category-switch input:checked + .switch-track {
  background: var(--primary-color);
}

.settings-switch input:checked + .switch-track::after,
.category-switch input:checked + .switch-track::after {
  transform: translateX(16px);
}

.category-name,
.category-rule {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-rule {
  color: #d7dce3;
  font-family: Consolas, 'Cascadia Mono', 'Microsoft YaHei Mono', monospace;
}

.category-inline-input {
  appearance: none;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  padding: 0 8px;
  color: #ffffff;
  background: #1f2022;
  border: 1px solid #55585c;
  border-radius: 5px;
  font-family: Consolas, 'Cascadia Mono', 'Microsoft YaHei Mono', monospace;
}

.category-inline-input:focus,
.category-inline-input:focus-visible {
  border-color: var(--primary-color);
}

.category-type,
.built-in-note {
  color: #aeb4bb;
  font-size: 12px;
}

.category-actions,
.category-edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}

.category-actions button,
.category-edit-actions button {
  height: auto;
  padding: 0;
  background: transparent;
  border-radius: 0;
  line-height: 1;
}

.category-actions button:hover,
.category-edit-actions button:hover,
.category-add-trigger:hover {
  color: #ffffff;
}

.category-actions .danger-action {
  color: #ffb4b4;
}

.category-edit-actions button:first-child {
  color: var(--primary-color-light);
}

.category-add-marker {
  color: #aeb4bb;
  font-size: 15px;
}

.category-add-trigger {
  width: 100%;
  color: #cbd1d8;
  background: #303234;
  text-align: left;
}

.category-add-trigger span {
  grid-column: 1 / -1;
}

@media (prefers-color-scheme: light) {
  .settings-backdrop {
    background: rgb(15 23 42 / 24%);
  }

  .settings-drawer {
    color: #1f2937;
    background: #ffffff;
    border-top-color: #d2d9e3;
    box-shadow: 0 -16px 40px rgb(15 23 42 / 16%);
  }

  .settings-header h2,
  .search-settings h3,
  .category-section-header h3 {
    color: #111827;
  }

  .search-settings p,
  .category-section-header p,
  .category-list-header,
  .category-group-arrow,
  .category-group-count,
  .category-type,
  .built-in-note,
  .category-add-marker {
    color: #667085;
  }

  .drawer-close {
    color: #4f5b6a;
  }

  .drawer-close:hover {
    background: #edf2f7;
  }

  .settings-card {
    background: #ffffff;
    border-color: #d6dde8;
  }

  .settings-switch {
    color: #4f5b6a;
  }

  .category-list {
    border-color: #d6dde8;
  }

  .category-list-header {
    background: #eef2f7;
  }

  .category-reset-order-btn {
    color: #9aa4b2;
    background: transparent;
    border: 0;
  }

  .category-reset-order-btn:hover {
    color: #374151;
    background: #e5e9f0;
  }

  .category-row.is-dragging {
    background: #f1f4f8;
  }

  .category-row,
  .category-add-trigger {
    color: #1f2937;
    background: #ffffff;
    border-top-color: #e4e9f1;
  }

  .category-drag-handle {
    color: #9aa4b2;
  }

  .category-drag-handle:hover {
    color: #374151;
    background: #e5e9f0;
  }

  .category-drag-handle.disabled:hover {
    color: #9aa4b2;
    background: transparent;
  }

  .switch-track {
    background: #b9c2ce;
  }

  .settings-switch input:checked + .switch-track,
  .category-switch input:checked + .switch-track {
    background: var(--primary-color);
  }

  .category-rule {
    color: #4f5b6a;
  }

  .category-inline-input {
    color: #111827;
    background: #f8fafc;
    border-color: #c8d0da;
  }

  .category-inline-input:focus,
  .category-inline-input:focus-visible {
    border-color: var(--primary-color);
  }

  .category-actions button:hover,
  .category-edit-actions button:hover,
  .category-add-trigger:hover {
    color: #111827;
  }

  .category-edit-actions button:first-child {
    color: var(--primary-color-text, var(--primary-color));
  }

  .category-actions .danger-action {
    color: #c24141;
  }
}

@media (max-width: 760px) {
  .category-row {
    grid-template-columns: 20px 34px minmax(0, 1fr) auto;
  }

  .category-list-header {
    display: none;
  }

  .category-row {
    gap: 6px;
    padding: 8px 10px;
  }
  .category-rule {
    grid-column: 3 / -1;
    grid-row: 2;
    overflow-wrap: anywhere;
  }
  .category-type {
    display: none;
  }
  .category-actions,
  .category-edit-actions {
    grid-column: 4;
    grid-row: 1;
  }
  .category-edit-row input:nth-of-type(2) {
    grid-column: 3 / -1;
  }
  .search-settings {
    flex-wrap: wrap;
    gap: 8px;
  }
}
.settings-drawer :is(button, input):focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
</style>
