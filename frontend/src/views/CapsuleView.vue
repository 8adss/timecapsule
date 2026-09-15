<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">时间胶囊</h1>
        <p class="page-desc">未开启的胶囊内容会被隐藏，到点自动开启，也可以手动提前打开</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" @click="openCreate">封存新胶囊</el-button>
      </div>
    </div>

    <el-empty v-if="!loading && capsules.length === 0" description="还没有时间胶囊，去创建任务时封存一个吧" />

    <el-card v-for="c in capsules" :key="c.id" class="capsule-card" shadow="never">
      <template #header>
        <div class="capsule-head">
          <span class="time">🕐 开启时间：{{ formatDateTime(c.toDate) }}</span>
          <div class="tags">
            <el-tag v-if="c.status === 0" type="warning">
              {{ countdown(c.toDate).expired ? '已到期，等待自动开启' : '封存中 · ' + countdown(c.toDate).text }}
            </el-tag>
            <el-tag v-else type="success">已开启</el-tag>
            <el-tag v-if="!c.taskId" type="info" effect="plain">独立胶囊</el-tag>
          </div>
        </div>
      </template>

      <!-- 未开启：不展示正文，保持"封存"的仪式感 -->
      <div v-if="c.status === 0" class="sealed">
        <div class="lock">🔒</div>
        <p class="sealed-text">这封信还在时间里封存着，到开启时间才能读到。</p>
      </div>
      <p v-else class="capsule-content">{{ c.content }}</p>

      <template #footer>
        <el-button v-if="c.status === 0" type="primary" @click="doOpen(c)">开启胶囊</el-button>
        <el-button v-else type="primary" plain @click="goChat(c)">继续与过去的你对话</el-button>
      </template>
    </el-card>

    <el-dialog v-model="dialogVisible" title="封存新胶囊" width="560px">
      <el-form label-width="100px">
        <el-form-item label="开启时间" required>
          <el-date-picker
            v-model="form.toDate"
            type="datetime"
            placeholder="未来的某个时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="关联任务">
          <el-select v-model="form.taskId" clearable placeholder="可选，选择相关任务" style="width: 100%">
            <el-option v-for="t in tasks" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="给未来的话" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="5"
            maxlength="5000"
            show-word-limit
            placeholder="写给未来的自己"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">封存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCapsule, listCapsules, openCapsule } from '../api/capsule'
import { listTasks } from '../api/task'
import { useUserStore } from '../stores/user'
import { countdown, daysFromNow, formatDateTime, toDateTimeString } from '../utils/date'

const userStore = useUserStore()
const router = useRouter()

const capsules = ref([])
const tasks = ref([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const form = reactive({ toDate: null, taskId: null, content: '' })

const load = async () => {
  loading.value = true
  try {
    capsules.value = await listCapsules(userStore.userId)
    tasks.value = await listTasks(userStore.userId)
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
    ElMessage.warning('请选择开启时间')
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning('请写下给未来的话')
    return
  }
  if (form.toDate.getTime() <= Date.now()) {
    ElMessage.warning('开启时间需要晚于当前时间')
    return
  }

  submitting.value = true
  try {
    await createCapsule({
      userId: userStore.userId,
      taskId: form.taskId,
      toDate: toDateTimeString(form.toDate),
      content: form.content.trim()
    })
    ElMessage.success('胶囊已封存')
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
        `这枚胶囊要到 ${formatDateTime(capsule.toDate)} 才到期，确定现在提前打开吗？`,
        '提前开启',
        { type: 'warning', confirmButtonText: '提前打开', cancelButtonText: '再等等' }
      )
    } catch {
      return
    }
  }

  try {
    await openCapsule(capsule.id, userStore.userId)
    ElMessage.success('胶囊已开启，去听听过去的你说了什么')
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

const goChat = (capsule) => {
  router.push({ path: '/chat', query: { mode: 'capsule', capsuleId: capsule.id } })
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
