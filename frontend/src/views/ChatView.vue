<template>
  <div class="page chat-page">
    <div class="chat-head">
      <div class="head-left">
        <h1 class="page-title">对话</h1>
        <p class="page-desc">{{ headHint }}</p>
      </div>
      <el-radio-group v-model="mode" @change="onModeChange">
        <el-radio-button value="capsule">过去的你</el-radio-button>
        <el-radio-button value="persona">何时的自己</el-radio-button>
      </el-radio-group>
    </div>

    <div class="chat-toolbar">
      <el-select
        v-model="targetId"
        :placeholder="mode === 'capsule' ? '选择一个已开启的时间胶囊' : '选择一个已就绪的分身'"
        style="width: 100%"
        :loading="loadingTargets"
        :disabled="targets.length === 0"
        @change="loadHistory"
      >
        <el-option
          v-for="item in targets"
          :key="item.id"
          :label="item.label"
          :value="item.id"
        />
      </el-select>
      <el-button v-if="mode === 'persona'" @click="$router.push('/personas')">管理分身</el-button>
      <el-button v-else @click="$router.push('/capsules')">去胶囊页</el-button>
    </div>

    <div ref="msgBox" v-loading="loadingHistory" class="msg-box">
      <!-- 没有任何可对话对象 -->
      <el-empty v-if="targets.length === 0" :description="emptyHint" />

      <template v-else>
        <div v-if="messages.length === 0" class="hint">
          {{ mode === 'capsule'
            ? '这是你和「过去的自己」的第一次对话，说点什么吧。'
            : `这是你和「${currentTargetLabel}」的第一次对话。TA 记得你写过的那些事，可以聊聊。` }}
        </div>

        <div v-for="m in messages" :key="m.id" :class="['msg-row', isUser(m) ? 'user' : 'ai']">
          <div class="bubble-wrap">
            <div class="bubble">{{ m.content }}</div>
            <div class="meta">
              <el-tag v-if="m.emotionTag" size="small" effect="plain">{{ m.emotionTag }}</el-tag>
              <span class="time">{{ formatDateTime(m.createdAt) }}</span>
            </div>
          </div>
        </div>

        <div v-if="sending" class="msg-row ai">
          <div class="bubble-wrap">
            <div class="bubble typing">
              {{ mode === 'capsule' ? '过去的你正在回想…' : '那时的你正在回想…' }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="chat-input">
      <el-input
        v-model="input"
        :placeholder="inputPlaceholder"
        :disabled="!targetId || sending"
        maxlength="2000"
        @keyup.enter="onEnter"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <el-button
        type="primary"
        :loading="sending"
        :disabled="!targetId || !input.trim()"
        @click="send"
      >
        发送
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { chatWithPastSelf, chatWithPersona, getChatHistory, getPersonaHistory } from '../api/chat'
import { listOpenedCapsules } from '../api/capsule'
import { listPersonas } from '../api/persona'
import { useUserStore } from '../stores/user'
import { formatDateTime } from '../utils/date'

const userStore = useUserStore()
const route = useRoute()

const mode = ref('capsule')
const targets = ref([])
const targetId = ref(null)
const messages = ref([])
const input = ref('')
const msgBox = ref(null)
const loadingTargets = ref(false)
const loadingHistory = ref(false)
const sending = ref(false)
const composing = ref(false)

const isUser = (message) => message.role === 'user'

const currentTargetLabel = computed(
  () => targets.value.find((t) => t.id === targetId.value)?.label || ''
)

const headHint = computed(() =>
  mode.value === 'capsule'
    ? '人设来自你封存的一枚时间胶囊 —— 与「写下那句话时的你」对话'
    : '人设来自知识库蒸馏出的分身 —— 与「某个时间点的你」对话'
)

const emptyHint = computed(() =>
  mode.value === 'capsule'
    ? '还没有已开启的胶囊。去「时间胶囊」页开启一枚吧'
    : '还没有生成好的分身。去「我的分身」页用知识库创建一个'
)

const inputPlaceholder = computed(() =>
  mode.value === 'capsule' ? '对过去的你说点什么…（Enter 发送）' : '和那时的自己聊聊…（Enter 发送）'
)

/** 按当前模式加载可选对话对象 */
const loadTargets = async () => {
  loadingTargets.value = true
  try {
    if (mode.value === 'capsule') {
      const capsules = await listOpenedCapsules(userStore.userId)
      targets.value = capsules.map((c) => ({
        id: c.id,
        label: `🕐 ${formatDateTime(c.openedAt)} · ${snippet(c.content)}`
      }))
    } else {
      const personas = await listPersonas(userStore.userId)
      targets.value = personas
        .filter((p) => p.status === 'READY')
        .map((p) => ({ id: p.id, label: `🪞 ${p.name}（${p.selfDate}）` }))
    }
  } finally {
    loadingTargets.value = false
  }
}

const snippet = (text) => {
  const flat = (text || '').replace(/\s+/g, ' ')
  return flat.length > 18 ? flat.slice(0, 18) + '…' : flat
}

const loadHistory = async () => {
  if (!targetId.value) {
    messages.value = []
    return
  }
  loadingHistory.value = true
  try {
    messages.value = mode.value === 'capsule'
      ? await getChatHistory(userStore.userId, targetId.value)
      : await getPersonaHistory(userStore.userId, targetId.value)
    scrollBottom()
  } finally {
    loadingHistory.value = false
  }
}

const onModeChange = async () => {
  targetId.value = null
  messages.value = []
  await loadTargets()
  if (targets.value.length > 0) {
    targetId.value = targets.value[0].id
    await loadHistory()
  }
}

const onEnter = () => {
  // 中文输入法选词时按 Enter 不应该发送
  if (composing.value) return
  send()
}

const send = async () => {
  const text = input.value.trim()
  if (!text || sending.value || !targetId.value) return

  const tempId = `tmp-${Date.now()}`
  sending.value = true
  input.value = ''
  messages.value.push({ id: tempId, role: 'user', content: text, createdAt: null })
  scrollBottom()

  try {
    const reply = mode.value === 'capsule'
      ? await chatWithPastSelf({ userId: userStore.userId, capsuleId: targetId.value, message: text })
      : await chatWithPersona({ userId: userStore.userId, personaId: targetId.value, message: text })
    messages.value.push(reply)
    scrollBottom()
  } catch (e) {
    // 失败时撤掉临时气泡、内容还给输入框，避免界面留下一条其实没发出去的消息
    messages.value = messages.value.filter((m) => m.id !== tempId)
    input.value = text
    ElMessage.warning('消息没有发送成功，已放回输入框')
  } finally {
    sending.value = false
  }
}

const scrollBottom = () => {
  setTimeout(() => {
    if (msgBox.value) {
      msgBox.value.scrollTop = msgBox.value.scrollHeight
    }
  }, 60)
}

onMounted(async () => {
  // 从胶囊页/分身页跳转过来时带着 mode 与目标 id
  if (route.query.mode === 'persona') {
    mode.value = 'persona'
  }
  await loadTargets()

  const fromPersona = Number(route.query.personaId)
  const fromCapsule = Number(route.query.capsuleId)

  if (mode.value === 'persona' && fromPersona && targets.value.some((t) => t.id === fromPersona)) {
    targetId.value = fromPersona
  } else if (mode.value === 'capsule' && fromCapsule && targets.value.some((t) => t.id === fromCapsule)) {
    targetId.value = fromCapsule
  } else if (targets.value.length > 0) {
    targetId.value = targets.value[0].id
  }

  if (targetId.value) {
    await loadHistory()
  }
})
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 92px);
}
.chat-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--sp-4);
  margin-bottom: var(--sp-4);
  flex-wrap: wrap;
}
.chat-toolbar {
  display: flex;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}
.msg-box {
  flex: 1;
  overflow-y: auto;
  background: var(--mt-surface);
  border: 1px solid var(--mt-border-soft);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
}
.hint {
  color: var(--mt-text-muted);
  font-size: var(--fs-sm);
  text-align: center;
  padding: var(--sp-6) 0;
}
.msg-row {
  display: flex;
  margin-bottom: var(--sp-4);
}
.msg-row.user {
  justify-content: flex-end;
}
.bubble-wrap {
  max-width: 72%;
}
.bubble {
  padding: 10px var(--sp-4);
  border-radius: 10px;
  line-height: var(--lh-base);
  font-size: var(--fs-base);
  white-space: pre-wrap;
  word-break: break-word;
}
/* 用户气泡白字压在奶茶棕上，这里用加深一档的棕保证对比度达标 */
.user .bubble {
  background: #8a6440;
  color: #fff;
  border-bottom-right-radius: 3px;
}
.ai .bubble {
  background: var(--mt-surface-alt);
  color: var(--mt-text);
  border: 1px solid var(--mt-border-soft);
  border-bottom-left-radius: 3px;
}
.typing {
  color: var(--mt-text-muted);
}
.meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 5px;
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}
.user .meta {
  justify-content: flex-end;
}
.chat-input {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}
</style>
