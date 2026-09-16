<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '68px' : '236px'" class="aside">
      <!-- 品牌区：展开时是手写体字标，收起时是带双下划线的字母标记。
           字标点击回到官网首页——侧边栏里总要有一个回得去的入口。 -->
      <div class="brand" :class="{ collapsed }">
        <router-link to="/" class="brand-text" :title="$t('nav.backHome')">
          <span v-if="collapsed" class="mark">TC</span>
          <span v-else class="script">TimeCapsule</span>
        </router-link>
        <button
          class="toggle"
          :title="collapsed ? $t('nav.expand') : $t('nav.collapse')"
          @click="toggleCollapsed"
        >
          <NavIcon :name="collapsed ? 'expand' : 'collapse'" />
        </button>
      </div>

      <!-- 导航：线性图标 + 文字；收起时只留图标 -->
      <nav class="nav" :class="{ collapsed }">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="active"
          exact-active-class="active"
          :title="collapsed ? $t(item.label) : ''"
        >
          <NavIcon :name="item.icon" />
          <span v-if="!collapsed" class="nav-label">{{ $t(item.label) }}</span>
        </router-link>
      </nav>

      <div class="user-box" :class="{ collapsed }">
        <el-avatar :size="30" :src="userStore.avatarUrl" class="avatar">
          {{ userStore.avatarText }}
        </el-avatar>
        <div v-if="!collapsed" class="user-info">
          <div class="user-name">{{ userStore.displayName }}</div>
          <div class="user-level">
            {{ $t('nav.levelAndStreak', { level: userStore.growthLevel, days: userStore.streakDays }) }}
          </div>
        </div>
      </div>
    </el-aside>

    <el-main class="main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, watch } from 'vue'
import NavIcon from '../components/NavIcon.vue'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()

const COLLAPSE_KEY = 'timecapsule.sidebarCollapsed'

// 导航项。标签存的是 i18n 的键而不是文案——路由表与这层配置在启动时就固定了，
// 写死中文的话切换语言不会生效。路径带 `/app` 前缀：`/` 留给官网落地页。
// 知识库已经接回来了（改造后它只依赖本地存储，不再需要 AI）。
// 仍未接回的是真正依赖 AI 的两个页面——我的分身 / 对话；
// 它们的图标（persona / chat）在 NavIcon 里早已备好，二期加一行即可。
const navItems = [
  { path: '/app/tasks', label: 'nav.tasks', icon: 'task' },
  { path: '/app/capsules', label: 'nav.capsules', icon: 'capsule' },
  { path: '/app/knowledge', label: 'nav.knowledge', icon: 'knowledge' },
  { path: '/app/profile', label: 'nav.profile', icon: 'achievement' },
  { path: '/app/settings', label: 'nav.settings', icon: 'settings' }
]

// 收起状态记在 localStorage，刷新后保持
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1')

const toggleCollapsed = () => {
  collapsed.value = !collapsed.value
}

watch(collapsed, (value) => {
  localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
})
</script>

<style scoped>
/* 应用外壳：整页不滚动，改为「内容区自己滚」——
   否则页面变长时侧边栏会被一起带着滑走，导航就不见了 */
.layout {
  height: 100vh;
  overflow: hidden;
}
.aside {
  height: 100vh;
  flex-shrink: 0;
  background: var(--mt-surface);
  border-right: 1px solid var(--mt-border-soft);
  display: flex;
  flex-direction: column;
  transition: width var(--dur) var(--ease);
  overflow: hidden;
}

/* ---------- 品牌区 ---------- */
.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: 26px 14px 18px 22px;
}
.brand.collapsed {
  flex-direction: column;
  gap: var(--sp-3);
  padding: 22px 0 14px;
}
.brand-text {
  min-width: 0;
  text-decoration: none;
}

/* 手写体字标：Ink Free 是 Windows 自带的马克笔风格字体，和参考稿最接近 */
.script {
  font-family: "Ink Free", "Segoe Print", "Bradley Hand ITC", "Segoe Script", cursive;
  font-size: 21px;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0.4px;
  color: var(--mt-text);
  white-space: nowrap;
}

/* 收起态的字母标记：双下划线，模仿参考稿里的 ABC 标记 */
.mark {
  display: inline-block;
  padding-bottom: 2px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1.2px;
  line-height: 1;
  color: var(--mt-primary-deep);
  border-bottom: 3px double currentColor;
}

.toggle {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--mt-border-soft);
  border-radius: var(--radius);
  background: transparent;
  color: var(--mt-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.toggle:hover {
  background: var(--mt-surface-alt);
  border-color: var(--mt-border);
  color: var(--mt-text);
}
.toggle :deep(.nav-icon) {
  width: 16px;
  height: 16px;
}

/* ---------- 导航 ---------- */
.nav {
  flex: 1;
  padding: var(--sp-1) var(--sp-3) var(--sp-3);
  overflow-y: auto;
}
.nav.collapsed {
  padding: var(--sp-1) 10px var(--sp-3);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  height: 44px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius);
  color: var(--mt-text-sub);
  text-decoration: none;
  font-size: var(--fs-base);
  white-space: nowrap;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.nav-item + .nav-item {
  margin-top: 2px;
}
.nav-item:hover {
  background: #faf7f2;
  color: var(--mt-text);
}

/* 选中态只用浅色底 + 加深文字，不上品牌色——这是参考稿最克制的处理 */
.nav-item.active {
  background: #f3efe9;
  color: var(--mt-text);
  font-weight: 500;
}

.nav.collapsed .nav-item {
  justify-content: center;
  gap: 0;
  padding: 0;
}
.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 底部用户 ---------- */
.user-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px 18px;
  border-top: 1px solid var(--mt-border-soft);
}
.user-box.collapsed {
  justify-content: center;
  padding: 14px 0 18px;
}
.avatar {
  background: var(--mt-primary-soft);
  color: var(--mt-primary-deep);
  font-weight: 500;
  font-size: 12px;
  flex-shrink: 0;
}
.user-info {
  overflow: hidden;
}
.user-name {
  font-size: var(--fs-base);
  color: var(--mt-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-level {
  margin-top: 2px;
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
  white-space: nowrap;
}

.main {
  height: 100vh;
  box-sizing: border-box;
  overflow-y: auto;
  background: var(--mt-bg);
  padding: 36px 44px 56px;
}
</style>
