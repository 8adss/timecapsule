<template>
  <div v-if="visible" class="demo-banner">
    <div class="demo-text">
      <span class="demo-title">{{ t('demo.title') }}</span>
      <span class="demo-desc">{{ t('demo.desc') }}</span>
    </div>
    <div class="demo-actions">
      <el-button size="small" @click="doDismiss">{{ t('demo.keep') }}</el-button>
      <el-button size="small" type="primary" @click="doClear">{{ t('demo.clear') }}</el-button>
    </div>
  </div>
</template>

<script setup>
/**
 * 示例内容横幅。
 *
 * 知识库页与分身页共用同一个组件：一次示例写入会同时放进这两页，
 * 分成两个组件迟早会出现「一处改了文案、另一处没改」。
 *
 * 它自己读状态、自己清空，通过 `cleared` 事件让所在页面重新加载列表——
 * 否则用户点完「清空示例」，表格里那几行还挂在那儿，得手动刷新。
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
// ElMessage / ElMessageBox 由 unplugin-auto-import 自动引入，见 vite.config.js
import { clearDemo, dismissDemo, getDemoState } from '../api/demo'

const emit = defineEmits(['cleared'])

const { t } = useI18n()

const state = ref({ active: false, dismissed: false, docCount: 0, personaCount: 0 })

/**
 * 两个条件都要满足才显示。
 * `active` 看的是「示例记录里还有几条活着」——用户自己把示例删掉之后，
 * 横幅就该跟着消失，不必再点一次「清空示例」。
 */
const visible = computed(() => state.value.active && !state.value.dismissed)

const load = async () => {
  try {
    state.value = await getDemoState()
  } catch (e) {
    // 读不到就当作没有示例：横幅是锦上添花，不该因为它让整页报错
  }
}

/** 只是不再提示，示例数据留着——用户可能想拿它给朋友演示 */
const doDismiss = async () => {
  try {
    await dismissDemo()
    state.value = { ...state.value, dismissed: true }
  } catch (e) {
    /* 已提示 */
  }
}

const doClear = async () => {
  try {
    await ElMessageBox.confirm(t('demo.clearConfirm'), t('demo.clearConfirmTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }

  try {
    await clearDemo()
    ElMessage.success(t('demo.cleared'))
    state.value = { ...state.value, active: false, docCount: 0, personaCount: 0 }
    emit('cleared')
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(load)
</script>

<style scoped>
.demo-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
  padding: var(--sp-3) var(--sp-4);
  margin-bottom: var(--sp-4);
  background: var(--mt-primary-wash);
  border: 1px solid var(--mt-border);
  border-radius: var(--radius);
}
.demo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.demo-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--mt-text);
}
.demo-desc {
  font-size: var(--fs-xs);
  line-height: var(--lh-base);
  color: var(--mt-text-sub);
}
.demo-actions {
  display: flex;
  gap: var(--sp-2);
  flex-shrink: 0;
}
</style>
