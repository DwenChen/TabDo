<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { tutorialChapters } from './tutorialChapters'
defineProps<{ compact?: boolean }>()
const router = useRouter()
const selected = ref(tutorialChapters[0].id)
const query = ref('')
const article = ref<HTMLElement>()
const chapters = computed(() =>
  tutorialChapters.filter((chapter) =>
    JSON.stringify(chapter).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
  )
)
const current = computed(() => tutorialChapters.find((chapter) => chapter.id === selected.value)!)
const position = computed(() => tutorialChapters.indexOf(current.value))
/**
 * 切换本地章节并把正文滚动到开头，阅读不调用宿主或改写设置。
 * @param id 目录中选取的章节标识。
 * @returns 无返回值；不存在的章节保持当前阅读位置。
 */
function choose(id: string): void {
  if (!tutorialChapters.some((chapter) => chapter.id === id)) return
  selected.value = id
  // 只调整教程自己的滚动容器，保持设置窗口与其他页面的位置。
  article.value?.scrollTo({ top: 0 })
}
</script>
<template>
  <div v-if="compact" class="usage-guide-entry">
    <h3>使用引导</h3>
    <p>12 章本地图文教程，按步骤学习常用工具，也可搜索需要的操作。断网可阅读。</p>
    <button class="primary" @click="router.push({ name: 'UsageGuide' })">阅读本地图文教程</button>
  </div>
  <main v-else class="usage-guide" aria-label="本地图文教程">
    <header class="guide-header">
      <div>
        <h1>本地图文教程</h1>
        <p>随应用提供 · 离线可读 · 按需查阅</p>
      </div>
      <button @click="router.push({ name: 'About' })">返回关于</button>
    </header>
    <div class="guide-body">
      <nav aria-label="教程章节" class="guide-nav">
        <label for="tutorial-search">查找操作</label>
        <input
          id="tutorial-search"
          v-model="query"
          type="search"
          placeholder="如：收藏、录屏、备份"
        />
        <p v-if="!chapters.length" role="status">没有匹配章节，请换个关键词。</p>
        <button
          v-for="chapter in chapters"
          :key="chapter.id"
          :aria-current="selected === chapter.id ? 'page' : undefined"
          @click="choose(chapter.id)"
        >
          <span>{{ String(tutorialChapters.indexOf(chapter) + 1).padStart(2, '0') }}</span
          >{{ chapter.title }}
        </button>
        <small>插图为操作示意，控件外观随主题变化。</small>
      </nav>
      <article
        ref="article"
        tabindex="0"
        class="guide-article"
        :aria-labelledby="'chapter-' + current.id"
      >
        <p class="chapter-count">第 {{ position + 1 }} / {{ tutorialChapters.length }} 章</p>
        <h2 :id="'chapter-' + current.id">{{ current.title }}</h2>
        <p class="intro">{{ current.intro }}</p>
        <figure>
          <img
            :key="current.id"
            :src="'./tutorial/' + current.id + '.svg'"
            :alt="current.figure"
            width="760"
            height="340"
          />
          <figcaption>{{ current.figure }}（操作示意）</figcaption>
        </figure>
        <section>
          <h3>开始前</h3>
          <p>{{ current.prepare }}</p>
        </section>
        <section>
          <h3>跟着做</h3>
          <ol>
            <li v-for="step in current.steps" :key="step">{{ step }}</li>
          </ol>
        </section>
        <section class="result">
          <h3>应看到的结果</h3>
          <p>{{ current.result }}</p>
        </section>
        <section>
          <h3>遇到问题</h3>
          <dl>
            <template v-for="item in current.problems" :key="item.question"
              ><dt>{{ item.question }}</dt>
              <dd>{{ item.answer }}</dd></template
            >
          </dl>
        </section>
        <footer class="chapter-controls">
          <button :disabled="position === 0" @click="choose(tutorialChapters[position - 1].id)">
            上一章
          </button>
          <span>{{ position + 1 }} / {{ tutorialChapters.length }}</span>
          <button
            :disabled="position === tutorialChapters.length - 1"
            @click="choose(tutorialChapters[position + 1].id)"
          >
            下一章
          </button>
        </footer>
      </article>
    </div>
  </main>
</template>
<style scoped>
.usage-guide {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-color);
  overflow: hidden;
}
.guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--divider-color);
}
h1 {
  font-size: 20px;
  margin: 0;
}
h2 {
  font-size: 24px;
  margin: 0 0 12px;
}
h3 {
  font-size: 15px;
}
.guide-header p {
  font-size: 12px;
  margin: 5px 0 0;
  color: var(--text-secondary);
}
.guide-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.guide-nav {
  flex: 0 0 190px;
  box-sizing: border-box;
  overflow: auto;
  padding: 16px 12px;
  border-right: 1px solid var(--divider-color);
}
.guide-nav label {
  display: block;
  font-size: 12px;
  margin-bottom: 6px;
  color: var(--text-secondary);
}
input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  margin-bottom: 12px;
  font: inherit;
  border: 1px solid var(--divider-color);
  border-radius: 6px;
  color: var(--text-color);
  background: var(--card-bg);
}
button {
  font: inherit;
  color: var(--text-color);
  background: var(--card-bg);
  border: 1px solid var(--divider-color);
  border-radius: 7px;
  padding: 8px 12px;
  cursor: pointer;
}
.guide-nav button {
  display: flex;
  gap: 9px;
  width: 100%;
  text-align: left;
  border-color: transparent;
  background: transparent;
  margin: 2px 0;
  padding: 9px 6px;
}
.guide-nav button span {
  color: var(--text-secondary);
  font-size: 12px;
}
.guide-nav button[aria-current='page'] {
  color: var(--primary-color);
  background: var(--hover-bg);
  border-color: var(--primary-color);
}
.guide-nav small {
  display: block;
  line-height: 1.8;
  margin: 18px 6px;
  color: var(--text-secondary);
}
.guide-article {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 20px 28px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.chapter-count {
  color: var(--primary-color);
  font-size: 12px;
  margin: 0 0 5px;
}
.intro,
figcaption,
.usage-guide-entry p {
  color: var(--text-secondary);
}
figure {
  margin: 20px 0;
}
img {
  width: 100%;
  height: auto;
  display: block;
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  background: #f4f7f6;
}
figcaption {
  font-size: 12px;
  margin-top: 6px;
}
section {
  margin: 22px 0;
}
section h3 {
  margin-bottom: 8px;
}
section p {
  margin: 0;
}
ol {
  padding-left: 24px;
}
li {
  padding-left: 4px;
  margin: 10px 0;
}
.result {
  border-left: 3px solid var(--primary-color);
  padding: 4px 16px;
}
dt {
  font-weight: 600;
  margin-top: 13px;
}
dd {
  color: var(--text-secondary);
  margin: 4px 0 0;
}
.chapter-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 0;
  border-top: 1px solid var(--divider-color);
}
.chapter-controls span {
  color: var(--text-secondary);
  font-size: 12px;
}
.primary {
  background: var(--primary-color);
  color: white;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button:focus-visible,
input:focus-visible,
article:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 650px) {
  .guide-header {
    padding: 12px;
  }
  .guide-nav {
    flex-basis: 145px;
    padding: 10px 6px;
  }
  .guide-article {
    padding: 16px;
  }
  h2 {
    font-size: 21px;
  }
}
</style>
