<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>

<script setup>
import { computed } from 'vue'

/**
 * 线性描边图标集（24×24 视窗 / 1.6 描边 / 圆角端点）。
 *
 * 为什么不直接用 @element-plus/icons-vue：那套图标以实心填充路径为主，
 * 视觉重量偏重，做不出参考稿里那种纤细统一的线性风格。
 *
 * 这些字符串全是静态常量，不含任何用户输入，所以 v-html 是安全的。
 *
 * 注意：`knowledge` / `persona` / `chat` 三个图标当前**没有被任何导航项引用**——
 * 它们对应的 AI 页面在第一版已从路由下架（见 router/index.js 的说明）。
 * 图标本身是纯静态 SVG，留着不占多少体积，二期接回 AI 时直接可用。
 */
const ICONS = {
  // 任务：清单 + 勾选
  task: `
    <path d="M9.6 6.5h10M9.6 12h10M9.6 17.5h10"/>
    <path d="M4.4 6.1l1.2 1.2 2.2-2.3"/>
    <path d="M4.4 11.6l1.2 1.2 2.2-2.3"/>
    <path d="M4.4 17.1l1.2 1.2 2.2-2.3"/>`,

  // 时间胶囊：时钟
  capsule: `
    <circle cx="12" cy="12" r="8.6"/>
    <path d="M12 7.2V12l3.2 2"/>`,

  // 知识库：文档（右上角折角，对应参考稿的「资料」）
  knowledge: `
    <path d="M13.8 3.6H7.6a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2V8.2z"/>
    <path d="M13.8 3.6v4.6h4.6"/>`,

  // 我的分身：单人轮廓
  persona: `
    <circle cx="12" cy="8.3" r="3.6"/>
    <path d="M4.9 20.1c0-3.7 3.2-6.1 7.1-6.1s7.1 2.4 7.1 6.1"/>`,

  // 对话：气泡（左下角带尾巴）
  chat: `
    <path d="M20.8 11.6c0 3.9-3.9 7.1-8.8 7.1-1 0-1.9-.13-2.8-.38L4.2 20.4l1.3-3.5c-1.2-1.3-1.9-2.9-1.9-4.7 0-3.9 3.9-7.1 8.8-7.1s8.4 3.2 8.4 7.1z"/>`,

  // 我的 / 成就：奖牌
  achievement: `
    <circle cx="12" cy="9" r="5.2"/>
    <path d="M8.6 13.4L7.2 20.5l4.8-2.4 4.8 2.4-1.4-7.1"/>`,

  // 设置：滑杆（比齿轮更细、更安静）
  settings: `
    <path d="M4 7.6h8.6M17.6 7.6H20"/>
    <circle cx="15.1" cy="7.6" r="2.3"/>
    <path d="M4 16.4h2.4M11.4 16.4H20"/>
    <circle cx="8.9" cy="16.4" r="2.3"/>`,

  // 侧边栏收起 / 展开
  collapse: `<path d="M13.6 6.8L8.4 12l5.2 5.2"/>`,
  expand: `<path d="M10.4 6.8L15.6 12l-5.2 5.2"/>`
}

const props = defineProps({
  name: { type: String, required: true }
})

const markup = computed(() => ICONS[props.name] || '')
</script>

<style scoped>
.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: block;
}
</style>
