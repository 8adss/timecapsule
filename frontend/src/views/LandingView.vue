<template>
  <div class="landing">
    <!-- 顶栏：字标 + 锚点导航 + 语言切换 + 进入应用 -->
    <header class="topbar">
      <div class="wrap topbar-inner">
        <router-link to="/" class="brand-script">TimeCapsule</router-link>
        <nav class="topnav">
          <a href="#features">{{ t('landing.navFeatures') }}</a>
          <a href="#data">{{ t('landing.navData') }}</a>
          <a :href="repoUrl" target="_blank" rel="noopener noreferrer">{{ t('landing.navSource') }}</a>
        </nav>
        <div class="lang">
          <button
            v-for="item in SUPPORTED_LOCALES"
            :key="item.value"
            :class="['lang-btn', { active: item.value === currentLocale }]"
            @click="changeLocale(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
        <router-link to="/app/tasks" class="btn btn-primary">{{ t('landing.enter') }}</router-link>
      </div>
    </header>

    <!-- 主视觉 -->
    <section class="hero">
      <div class="wrap hero-inner">
        <p class="eyebrow">{{ t('landing.eyebrow') }}</p>
        <h1 class="hero-title">
          {{ t('landing.heroLine1') }}<br />
          <span class="accent">{{ t('landing.heroLine2') }}</span>
        </h1>
        <p class="hero-sub">{{ t('landing.heroSub') }}</p>
        <div class="hero-actions">
          <router-link to="/app/tasks" class="btn btn-primary btn-lg">{{ t('landing.start') }}</router-link>
          <a :href="repoUrl" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-lg">
            {{ t('landing.viewSource') }}
          </a>
        </div>
        <p class="hero-note">{{ t('landing.heroNote') }}</p>
      </div>
    </section>

    <!-- 功能 -->
    <section id="features" class="section">
      <div class="wrap">
        <h2 class="section-title">{{ t('landing.featuresTitle') }}</h2>
        <p class="section-sub">{{ t('landing.featuresSub') }}</p>

        <div class="cards">
          <article v-for="item in features" :key="item.icon" class="card">
            <span class="card-icon">
              <NavIcon :name="item.icon" />
            </span>
            <h3 class="card-title">{{ t(item.titleKey) }}</h3>
            <p class="card-desc">{{ t(item.descKey) }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- 数据说明：这是本应用与多数同类产品最大的不同，单独讲清楚 -->
    <section id="data" class="section section-alt">
      <div class="wrap data-inner">
        <div class="data-copy">
          <h2 class="section-title">{{ t('landing.dataTitle') }}</h2>
          <p class="section-sub">{{ t('landing.dataSub') }}</p>
          <ul class="data-list">
            <li v-for="n in 4" :key="n">{{ t(`landing.dataPoint${n}`) }}</li>
          </ul>
        </div>
        <aside class="data-aside">
          <div class="data-note">
            <div class="data-note-title">{{ t('landing.dataNoteTitle') }}</div>
            <p>{{ t('landing.dataNote') }}</p>
          </div>
        </aside>
      </div>
    </section>

    <!-- 结尾 -->
    <section class="section cta-section">
      <div class="wrap cta-inner">
        <h2 class="cta-title">{{ t('landing.ctaTitle') }}</h2>
        <router-link to="/app/tasks" class="btn btn-primary btn-lg">{{ t('landing.start') }}</router-link>
      </div>
    </section>

    <footer class="footer">
      <div class="wrap footer-inner">
        <span class="footer-brand">TimeCapsule</span>
        <span class="footer-sep">·</span>
        <span>{{ t('landing.footerDesc') }}</span>
        <span class="footer-spacer" />
        <a :href="repoUrl" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NavIcon from '../components/NavIcon.vue'
import { SUPPORTED_LOCALES, getLocale, setLocale } from '../i18n'

const { t } = useI18n()

/**
 * 仓库地址。落地页顶栏与页脚的「源码」链接都指向它。
 * 集中成一个常量，避免散落在模板里改漏。
 */
const repoUrl = 'https://github.com/8adss/timecapsule'

const currentLocale = ref(getLocale())

const changeLocale = (value) => {
  setLocale(value)
  currentLocale.value = value
}

/**
 * 功能卡片。
 *
 * 只存 i18n 的键，不存文案：数组在组件初始化时就固定了，
 * 存中文的话切换语言时这三张卡片不会跟着变。
 */
const features = [
  { icon: 'capsule', titleKey: 'landing.featureCapsuleTitle', descKey: 'landing.featureCapsuleDesc' },
  { icon: 'task', titleKey: 'landing.featureTaskTitle', descKey: 'landing.featureTaskDesc' },
  { icon: 'achievement', titleKey: 'landing.featureAchievementTitle', descKey: 'landing.featureAchievementDesc' }
]
</script>

<style scoped>
/*
  落地页刻意不复用应用外壳，也不引入组件库：
  官网是给第一次来的人看的，加载越轻越好。
*/
.landing {
  min-height: 100vh;
  background: var(--mt-bg);
  color: var(--mt-text);
}

.wrap {
  max-width: 1060px;
  margin: 0 auto;
  padding: 0 28px;
}

/* ---------- 顶栏 ---------- */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(250, 247, 243, 0.86);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--mt-border-soft);
}
.topbar-inner {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  height: 62px;
}
.brand-script {
  font-family: "Ink Free", "Segoe Print", "Bradley Hand ITC", "Segoe Script", cursive;
  font-size: 21px;
  letter-spacing: 0.4px;
  color: var(--mt-text);
  text-decoration: none;
  white-space: nowrap;
}
.topnav {
  display: flex;
  gap: var(--sp-5);
  margin-left: auto;
}
.topnav a {
  font-size: var(--fs-base);
  color: var(--mt-text-sub);
  text-decoration: none;
  transition: color var(--dur) var(--ease);
}
.topnav a:hover {
  color: var(--mt-text);
}

/* ---------- 语言切换 ---------- */
.lang {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius);
  background: var(--mt-surface-alt);
}
.lang-btn {
  padding: 4px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--mt-text-muted);
  font-size: var(--fs-xs);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.lang-btn:hover {
  color: var(--mt-text);
}
.lang-btn.active {
  background: var(--mt-surface);
  color: var(--mt-text);
  font-weight: 500;
}

/* ---------- 按钮 ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 18px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  font-size: var(--fs-base);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease),
    color var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.btn-lg {
  padding: 13px 26px;
  font-size: var(--fs-lg);
}
.btn-primary {
  background: var(--mt-primary);
  color: #fff;
  box-shadow: var(--shadow-hairline);
}
.btn-primary:hover {
  background: var(--mt-primary-deep);
  transform: translateY(-1px);
}
.btn-ghost {
  border-color: var(--mt-border);
  color: var(--mt-text-sub);
  background: transparent;
}
.btn-ghost:hover {
  border-color: var(--mt-primary);
  color: var(--mt-primary-deep);
}

/* ---------- 主视觉 ---------- */
.hero {
  padding: 92px 0 76px;
}
.hero-inner {
  max-width: 760px;
}
.eyebrow {
  margin: 0 0 var(--sp-4);
  font-size: var(--fs-sm);
  letter-spacing: 1.4px;
  color: var(--mt-primary-deep);
}
.hero-title {
  margin: 0;
  font-size: 46px;
  line-height: 1.28;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.hero-title .accent {
  color: var(--mt-primary);
}
.hero-sub {
  margin: var(--sp-5) 0 0;
  max-width: 560px;
  font-size: var(--fs-lg);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}
.hero-actions {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin-top: var(--sp-6);
}
.hero-note {
  margin: var(--sp-5) 0 0;
  font-size: var(--fs-sm);
  color: var(--mt-text-faint);
}

/* ---------- 通用分节 ---------- */
.section {
  padding: 76px 0;
}
.section-alt {
  background: var(--mt-surface);
  border-top: 1px solid var(--mt-border-soft);
  border-bottom: 1px solid var(--mt-border-soft);
}
.section-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.2px;
}
.section-sub {
  margin: var(--sp-3) 0 0;
  max-width: 560px;
  font-size: var(--fs-base);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}

/* ---------- 功能卡片 ---------- */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--sp-5);
  margin-top: var(--sp-6);
}
.card {
  padding: var(--sp-5);
  border: 1px solid var(--mt-border-soft);
  border-radius: var(--radius-lg);
  background: var(--mt-surface);
  box-shadow: var(--shadow-hairline);
}
.card-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: var(--sp-4);
  border-radius: var(--radius);
  background: var(--mt-primary-wash);
  color: var(--mt-primary-deep);
}
.card-icon :deep(.nav-icon) {
  width: 20px;
  height: 20px;
}
.card-title {
  margin: 0 0 var(--sp-2);
  font-size: var(--fs-lg);
  font-weight: 600;
}
.card-desc {
  margin: 0;
  font-size: var(--fs-base);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}

/* ---------- 数据说明 ---------- */
.data-inner {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--sp-7);
  align-items: start;
}
.data-list {
  margin: var(--sp-5) 0 0;
  padding: 0;
  list-style: none;
}
.data-list li {
  position: relative;
  padding-left: 22px;
  margin-bottom: 10px;
  font-size: var(--fs-base);
  line-height: var(--lh-base);
  color: var(--mt-text-sub);
}
.data-list li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mt-primary);
}
.data-note {
  padding: var(--sp-5);
  border: 1px solid var(--mt-border);
  border-left-width: 3px;
  border-radius: var(--radius);
  background: var(--mt-bg-soft);
}
.data-note-title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--mt-primary-deep);
}
.data-note p {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: var(--lh-loose);
  color: var(--mt-text-sub);
}

/* ---------- 结尾 ---------- */
.cta-section {
  padding: 88px 0;
}
.cta-inner {
  text-align: center;
}
.cta-title {
  margin: 0 0 var(--sp-5);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

/* ---------- 页脚 ---------- */
.footer {
  border-top: 1px solid var(--mt-border-soft);
  background: var(--mt-surface);
}
.footer-inner {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  height: 68px;
  font-size: var(--fs-sm);
  color: var(--mt-text-faint);
}
.footer-brand {
  font-weight: 600;
  color: var(--mt-text-sub);
}
.footer-spacer {
  flex: 1;
}
.footer-inner a {
  color: var(--mt-text-sub);
  text-decoration: none;
}
.footer-inner a:hover {
  color: var(--mt-primary-deep);
}

/* 窄屏：数据说明从两栏变一栏，主标题收小，锚点导航让位给语言切换与主按钮 */
@media (max-width: 860px) {
  .topnav {
    display: none;
  }
}
@media (max-width: 760px) {
  .hero {
    padding: 60px 0 52px;
  }
  .hero-title {
    font-size: 32px;
  }
  .data-inner {
    grid-template-columns: 1fr;
    gap: var(--sp-5);
  }
  .section {
    padding: 56px 0;
  }
}
</style>
