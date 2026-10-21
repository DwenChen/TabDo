<script setup>
import { computed, ref } from 'vue'
import RecorderIcon from './RecorderIcon.vue'
const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue', 'close'])
const emojiTarget = ref('')
const colorTarget = ref(''),
  pickerError = ref('')
/**
 * 关闭最内层选择器，未打开选择器时才关闭设置。
 * @returns {void} 无返回值。
 */
function closePicker() {
  if (emojiTarget.value) emojiTarget.value = ''
  else if (colorTarget.value) colorTarget.value = ''
  else emit('close')
}
/**
 * 登记屏幕取色与完整配置写入，前台退出后不再回填旧设置页。
 * @returns {Promise<void>} 取色和配置保存完成后的 Promise。
 */
async function pickScreenColor() {
  const key = colorTarget.value
  pickerError.value = ''
  try {
    await window.toolsLifecycle.runTask(async (task) => {
      let color
      await window.tabdo.screenColorPick((result) => {
        color = result.hex
      })
      if (!color || task.signal.aborted) return
      const preferences = window.tabdo.dbStorage.getItem('recorder-preferences') || {}
      window.tabdo.dbStorage.setItem('recorder-preferences', { ...preferences, [key]: color })
      if (!window.toolsLifecycle.signal.aborted) {
        update(key, color)
        colorTarget.value = ''
      }
    }, 120000)
  } catch (error) {
    if (!window.toolsLifecycle.signal.aborted) pickerError.value = error.message
  }
}
const keyboardStyles = [
  ['default', '简约键帽'],
  ['apple-wireless', '苹果键盘'],
  ['claymorphism', '立体键帽'],
  ['mechanical', '机械键盘'],
  ['rgb', 'RGB 键盘']
]
const positions = [
  ['left-top', '左上'],
  ['top', '上'],
  ['right-top', '右上'],
  ['left', '左'],
  ['center', '中'],
  ['right', '右'],
  ['left-bottom', '左下'],
  ['bottom', '下'],
  ['right-bottom', '右下']
]
const locations = [
  ['videos', '视频目录'],
  ['downloads', '下载目录'],
  ['desktop', '桌面'],
  ['documents', '文档目录']
]
const location = computed(
  () =>
    locations.find(
      ([key]) => window.tabdo.getPath(key) === props.modelValue.outputDirectory
    )?.[0] || (props.modelValue.outputDirectory ? 'custom' : 'videos')
)
const emojis =
  '😎 🤣 😀 😁 😂 🥰 😍 🤔 😅 😆 😋 😜 😝 🤩 🥳 😺 🐱 🐶 🐰 🐼 🐻 🐸 🐵 🌈 ⭐ 🌟 ✨ 🎉 🎈 ❤️ 💚 💙 💜 🔥 💡 📌 🚀 🎯 👍 👆 👇 👉 👏 🙌 🤝 ✌️ 👌 👋'.split(
    ' '
  )
/**
 * 发布选项快照，由入口统一持久化到工具命名空间。
 * @param {string} key 设置键。
 * @param {unknown} value 设置值。
 * @returns {void} 无返回值。
 */
function update(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
/**
 * 使用原插件的系统目录下拉项及自定义目录选择。
 * @param {Event} event 下拉变更事件。
 * @returns {void} 无返回值。
 */
function chooseLocation(event) {
  const value = event.target.value
  if (value === 'choose') {
    const files = window.tabdo.showOpenDialog({ title: '存储位置', properties: ['openDirectory'] })
    if (files?.[0]) update('outputDirectory', files[0])
    event.target.value = location.value
  } else if (value !== 'custom') update('outputDirectory', window.tabdo.getPath(value))
}
/**
 * 恢复原插件的左右键效果默认值。
 * @param {string} type 颜色或表情。
 * @returns {void} 无返回值。
 */
function reset(type) {
  emit('update:modelValue', {
    ...props.modelValue,
    ...(type === 'color'
      ? { clickColor: '#ff6464', rightColor: '#6464ff' }
      : { clickEmoji: '😎', rightEmoji: '🤣' })
  })
}
/**
 * 为左右键选择独立的 Emoji，完成后关闭本次选择面板。
 * @param {string} value 用户选择的 Emoji。
 * @returns {void} 无返回值。
 */
function chooseEmoji(value) {
  update(emojiTarget.value, value)
  emojiTarget.value = ''
}
</script>
<template>
  <section
    class="recorder-settings"
    role="dialog"
    aria-modal="true"
    aria-label="录屏设置"
    tabindex="-1"
    @keydown.esc.stop="closePicker"
  >
    <button class="settings-close" aria-label="关闭设置" @click="emit('close')">
      <RecorderIcon name="close" />
    </button>
    <div class="settings-content">
      <h3>录屏存储</h3>
      <label class="storage"
        ><span>存储位置</span
        ><select :value="location" aria-label="存储位置" @change="chooseLocation">
          <option v-for="[key, label] in locations" :key="key" :value="key">{{ label }}</option>
          <option v-if="location === 'custom'" value="custom">
            {{ modelValue.outputDirectory }}
          </option>
          <option value="choose">选择文件夹…</option>
        </select></label
      >
      <h3>录制模式</h3>
      <select
        :value="modelValue.quality"
        aria-label="录制质量"
        @change="update('quality', $event.target.value)"
      >
        <option value="standard">标准（推荐 · 2K 30FPS · 稳定兼容）</option>
        <option value="high">高质量（4K 60FPS · 需硬件支持）</option>
      </select>
      <h3>鼠标效果</h3>
      <div class="click-effect-types" role="radiogroup" aria-label="鼠标效果类型">
        <div
          class="effect-card"
          :class="{ selected: modelValue.clickStyle === 'circle' }"
          role="radio"
          :aria-checked="modelValue.clickStyle === 'circle'"
          aria-label="圆形高亮"
          tabindex="0"
          @click="update('clickStyle', 'circle')"
          @keydown.enter="update('clickStyle', 'circle')"
          @keydown.space.prevent="update('clickStyle', 'circle')"
        >
          <label @click.stop
            ><button
              class="color-swatch"
              :style="{ backgroundColor: modelValue.clickColor }"
              aria-label="左键颜色"
              @click.stop="colorTarget = 'clickColor'"
            ></button
            ><span>左键单击</span></label
          >
          <label @click.stop
            ><button
              class="color-swatch"
              :style="{ backgroundColor: modelValue.rightColor }"
              aria-label="右键颜色"
              @click.stop="colorTarget = 'rightColor'"
            ></button
            ><span>右键单击</span></label
          >
          <button aria-label="恢复默认颜色" @click.stop="reset('color')">
            <RecorderIcon name="reset" /></button
          ><RecorderIcon
            v-if="modelValue.clickStyle === 'circle'"
            class="selected-mark"
            name="check"
          />
        </div>
        <div
          class="effect-card"
          :class="{ selected: modelValue.clickStyle === 'emoji' }"
          role="radio"
          :aria-checked="modelValue.clickStyle === 'emoji'"
          aria-label="Emoji 表情"
          tabindex="0"
          @click="update('clickStyle', 'emoji')"
          @keydown.enter="update('clickStyle', 'emoji')"
          @keydown.space.prevent="update('clickStyle', 'emoji')"
        >
          <div>
            <button
              class="emoji-button"
              aria-label="左键表情"
              @click.stop="emojiTarget = 'clickEmoji'"
            >
              {{ modelValue.clickEmoji }}</button
            ><span>左键单击</span>
          </div>
          <div>
            <button
              class="emoji-button"
              aria-label="右键表情"
              @click.stop="emojiTarget = 'rightEmoji'"
            >
              {{ modelValue.rightEmoji }}</button
            ><span>右键单击</span>
          </div>
          <button aria-label="恢复默认表情" @click.stop="reset('emoji')">
            <RecorderIcon name="reset" /></button
          ><RecorderIcon
            v-if="modelValue.clickStyle === 'emoji'"
            class="selected-mark"
            name="check"
          />
        </div>
      </div>
      <h3>键盘效果</h3>
      <div class="keyboard-types" role="radiogroup" aria-label="键盘效果样式">
        <button
          v-for="[key, label] in keyboardStyles"
          :key="key"
          :class="['keyboard-card', { selected: modelValue.keyStyle === key }]"
          role="radio"
          :aria-checked="modelValue.keyStyle === key"
          :aria-label="label"
          @click="update('keyStyle', key)"
        >
          <span :class="['keyboard-preview', 'keyboard-' + key]"><kbd>Shift</kbd><kbd>A</kbd></span
          ><RecorderIcon v-if="modelValue.keyStyle === key" class="selected-mark" name="check" />
        </button>
      </div>
      <div>
        <p>显示的按键位于视频位置</p>
        <div class="position-grid" role="radiogroup" aria-label="按键显示位置">
          <button
            v-for="[key, label] in positions"
            :key="key"
            role="radio"
            :aria-checked="modelValue.keyPosition === key"
            :class="{ selected: modelValue.keyPosition === key }"
            @click="update('keyPosition', key)"
          >
            {{ label }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="colorTarget" class="emoji-mask" @click.self="colorTarget = ''">
      <section role="dialog" aria-label="选择颜色">
        <header>
          <span>选择颜色</span
          ><button aria-label="关闭颜色选择" @click="colorTarget = ''">×</button>
        </header>
        <input
          class="color-editor"
          type="color"
          :value="modelValue[colorTarget]"
          aria-label="颜色值"
          @input="update(colorTarget, $event.target.value)"
        /><label
          >HEX<input
            :value="modelValue[colorTarget]"
            aria-label="十六进制颜色"
            maxlength="7"
            @change="
              /^#[0-9a-f]{6}$/i.test($event.target.value) &&
              update(colorTarget, $event.target.value)
            " /></label
        ><button class="pick-screen" @click="pickScreenColor">屏幕取色</button>
        <p v-if="pickerError" role="status">{{ pickerError }}</p>
      </section>
    </div>
    <div v-if="emojiTarget" class="emoji-mask" @click.self="emojiTarget = ''">
      <section role="dialog" aria-label="选择表情">
        <header>
          <span>选择表情</span
          ><button aria-label="关闭表情选择" @click="emojiTarget = ''">×</button>
        </header>
        <div class="emoji-grid">
          <button v-for="(emoji, index) in emojis" :key="index" @click="chooseEmoji(emoji)">
            {{ emoji }}
          </button>
        </div>
        <input
          :value="modelValue[emojiTarget]"
          aria-label="自定义表情"
          maxlength="16"
          @change="chooseEmoji($event.target.value)"
        />
      </section>
    </div>
  </section>
</template>
<style scoped>
.recorder-settings {
  width: min(400px, 94vw);
  height: 100%;
  position: relative;
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: -4px 0 20px #0002;
  font: var(--tool-font);
}
.settings-content {
  height: 100%;
  overflow: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-sizing: border-box;
}
h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
button,
input,
select {
  font: inherit;
  color: inherit;
  box-sizing: border-box;
}
button {
  cursor: pointer;
  border: 0;
  background: transparent;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
[role='radio']:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
select {
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}
.storage {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.storage > span,
p {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 8px;
}
.storage select {
  border: 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  padding-left: 0;
  background: transparent;
}
.settings-close {
  position: absolute;
  right: 9px;
  top: 9px;
  padding: 5px;
  z-index: 1;
  border-radius: 5px;
  background: var(--bg-elevated);
}
svg {
  width: 18px;
  height: 18px;
  display: block;
}
.click-effect-types,
.keyboard-types {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.effect-card {
  padding: 13px 18px;
  display: flex;
  align-items: center;
  gap: 30px;
  position: relative;
  border-radius: 6px;
  background: var(--bg-hover);
  cursor: pointer;
}
.selected {
  box-shadow: inset 0 0 0 2px var(--primary-color);
}
.effect-card > label,
.effect-card > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}
.effect-card > button {
  margin-left: auto;
  color: var(--text-secondary);
  padding: 4px;
}
.effect-card input[type='color'] {
  appearance: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  overflow: hidden;
  background: transparent;
  cursor: pointer;
}
input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}
input[type='color']::-webkit-color-swatch {
  border: 0;
  border-radius: 50%;
}
.effect-card .emoji-button {
  font-size: 27px;
  line-height: 30px;
  padding: 0;
}
.selected-mark {
  position: absolute;
  right: 6px;
  top: 6px;
  color: var(--primary-color);
  width: 16px;
  height: 16px;
}
.keyboard-card {
  padding: 12px;
  background: var(--bg-hover);
  border-radius: 6px;
  position: relative;
  display: flex;
  justify-content: center;
}
.keyboard-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px;
  border-radius: 5px;
}
kbd {
  font:
    16px Arial,
    sans-serif;
  min-width: 42px;
  height: 42px;
  padding: 0 14px;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: white;
  background: #212121;
}
.keyboard-default {
  background: #ffffff70;
}
.keyboard-apple-wireless {
  background: #d5d9dca0;
}
.keyboard-apple-wireless kbd {
  border-radius: 4px;
  background: #222;
  color: #ccc;
  box-shadow:
    inset 0 0 20px #333,
    0 2px 0 #111;
}
.keyboard-claymorphism kbd {
  border-radius: 11px;
  color: #111;
  background: #ebebeb;
  box-shadow:
    5px 5px 10px #0004,
    inset -5px -5px 10px #0003,
    inset 5px 5px 10px #fff6;
}
.keyboard-mechanical kbd {
  height: 52px;
  min-width: 52px;
  border: 6px outset #393939;
  background: linear-gradient(90deg, #232323, #4a4a4a);
  color: #ccc;
  box-shadow: 3px 5px 7px #0005;
}
.keyboard-rgb kbd {
  border: 3px solid transparent;
  border-bottom-width: 5px;
  background:
    linear-gradient(#111, #111) padding-box,
    conic-gradient(#ff6464, #64c864, #6464ff, #ff6464) border-box;
}
.position-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.position-grid button {
  padding: 8px;
  border: 1px solid var(--border-color);
}
.position-grid button[aria-checked='true'] {
  color: var(--primary-color);
  background: var(--bg-accent-light);
  box-shadow: none;
}
.emoji-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 14px;
  background: #0004;
}
.emoji-mask section {
  width: 100%;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.emoji-mask header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
}
.emoji-grid button {
  font-size: 22px;
  padding: 4px 0;
}
.emoji-mask input {
  margin-top: 10px;
  padding: 6px;
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 5px;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  padding: 0;
}
.color-editor {
  width: 100%;
  height: 80px;
  padding: 2px;
  margin-bottom: 12px;
}
.pick-screen {
  border: 1px solid var(--border-color);
  border-radius: 5px;
  margin-top: 10px;
  padding: 5px 10px;
}
</style>
