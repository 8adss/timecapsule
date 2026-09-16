<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('capsule.title') }}</h1>
        <p class="page-desc">{{ t('capsule.desc') }}</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" @click="openCreate">{{ t('capsule.create') }}</el-button>
      </div>
    </div>

    <el-empty v-if="!loading && capsules.length === 0" :description="t('capsule.empty')" />

    <el-card v-for="c in capsules" :key="c.id" class="capsule-card" shadow="never">
      <template #header>
        <div class="capsule-head">
          <span class="time">{{ t('capsule.opensAt', { time: formatDateTime(c.toDate) }) }}</span>
          <div class="tags">
            <el-tag v-if="c.status === 0" type="warning">
              {{ countdown(c.toDate).expired
                ? t('capsule.dueWaiting')
                : t('capsule.sealedWith', { text: countdownText(c.toDate) }) }}
            </el-tag>
            <el-tag v-else type="success">{{ t('capsule.opened') }}</el-tag>
            <el-tag v-if="!c.taskId" type="info" effect="plain">{{ t('capsule.standalone') }}</el-tag>
          </div>
        </div>
      </template>

      <!-- 未开启：不展示正文，保持"封存"的仪式感 -->
      <div v-if="c.status === 0" class="sealed">
        <div class="lock">🔒</div>
        <p class="sealed-text">{{ t('capsule.sealedText') }}</p>
      </div>
      <p v-else class="capsule-content">{{ c.content }}</p>

      <template #footer>
        <el-button v-if="c.status === 0" type="primary" @click="doOpen(c)">
          {{ t('capsule.open') }}
        </el-button>
        <!--
          已开启的胶囊原本还有一个「继续与过去的你对话」按钮，跳转到 /chat。

          该页面依赖后端 AI，第一版已从路由下架，所以按钮一并移除。
          如果只是把按钮留着、让它跳到未注册的路径，后果比报错更糟：
          vue-router 对未匹配 location 并**不会中止导航**，matched 为空时
          <router-view> 什么都不渲染——用户会看到侧边栏还在、内容区整片空白，
          刷新也恢复不了（另外静态托管下还会因 SPA fallback 缺失直接 404）。

          二期接回 /chat 时，把这个按钮与它的跳转函数一并恢复即可。
        -->
      </template>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="t('capsule.create')" width="560px">
      <el-form label-width="100px">
        <el-form-item :label="t('capsule.toDateLabel')" required>
          <el-date-picker
            v-model="form.toDate"
            type="datetime"
            :placeholder="t('capsule.toDatePlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('capsule.taskLabel')">
          <el-select
            v-model="form.taskId"
            clearable
            :placeholder="t('capsule.taskPlaceholder')"
            style="width: 100%"
          >
            <el-option v-for="item in tasks" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('capsule.contentLabel')" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="5"
            maxlength="5000"
            show-word-limit
            :placeholder="t('capsule.contentPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('capsule.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">
          {{ t('capsule.submit') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
// ElMessage / ElMessageBox 由 unplugin-auto-import 自动引入，见 vite.config.js
import { createCapsule, listCapsules, openCapsule } from '../api/capsule'
import { listTasks } from '../api/task'
import { countdown, daysFromNow, formatDateTime, toDateTimeString } from '../utils/date'

const { t } = useI18n()

const capsules = ref([])
const tasks = ref([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const form = reactive({ toDate: null, taskId: null, content: '' })

/**
 * 倒计时文案。
 *
 * `countdown()` 只返回 { expired, unit, value } 这样的结构化数据——
 * 工具层不该知道界面用哪种语言，拼好的中文句子也没法翻译。
 */
const countdownText = (target) => {
  const { expired, unit, value } = countdown(target)
  if (expired) return t('countdown.expired')
  if (unit === null) return '—'
  if (unit === 'soon') return t('countdown.soon')
  return t(`countdown.${unit}`, { n: value })
}

const load = async () => {
  loading.value = true
  try {
    capsules.value = await listCapsules()
    tasks.value = await listTasks()
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.toDate = daysFromNow(30)
  form.taskId = null
  form.content = ''
  dialogVisible.value = true
}

const doCreate = async () => {
  if (!form.toDate) {
    ElMessage.warning(t('capsule.errToDate'))
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning(t('capsule.errContent'))
    return
  }
  if (form.toDate.getTime() <= Date.now()) {
    ElMessage.warning(t('capsule.errFuture'))
    return
  }

  submitting.value = true
  try {
    await createCapsule({
      taskId: form.taskId,
      toDate: toDateTimeString(form.toDate),
      content: form.content.trim()
    })
    ElMessage.success(t('capsule.msgCreated'))
    dialogVisible.value = false
    await load()
  } catch (e) {
    /* 已提示 */
  } finally {
    submitting.value = false
  }
}

const doOpen = async (capsule) => {
  // 还没到开启时间时给一次确认，避免误点破坏"封存"的语义
  if (!countdown(capsule.toDate).expired) {
    try {
      await ElMessageBox.confirm(
        t('capsule.earlyConfirm', { time: formatDateTime(capsule.toDate) }),
        t('capsule.earlyTitle'),
        { type: 'warning', confirmButtonText: t('capsule.earlyOk'), cancelButtonText: t('capsule.earlyCancel') }
      )
    } catch {
      return
    }
  }

  try {
    await openCapsule(capsule.id)
    ElMessage.success(t('capsule.msgOpened'))
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(load)
</script>

<style scoped>
.capsule-card {
  margin-bottom: var(--sp-4);
}
.capsule-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.time {
  font-size: 14px;
  color: var(--mt-text-sub);
}
.tags {
  display: flex;
  gap: 8px;
}
.capsule-content {
  margin: 0;
  color: var(--mt-text);
  line-height: 1.9;
  white-space: pre-wrap;
}
.sealed {
  text-align: center;
  padding: var(--sp-6) 0;
  border-radius: var(--radius);
  background: var(--mt-surface-alt);
}
.lock {
  font-size: 22px;
  margin-bottom: var(--sp-2);
  opacity: 0.7;
}
.sealed-text {
  margin: 0;
  color: var(--mt-text-muted);
  font-size: var(--fs-sm);
}
</style>
