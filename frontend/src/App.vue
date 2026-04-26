<template>
  <main class="board-shell">
    <header class="board-topbar">
      <div class="board-brand">
        <span class="board-dot" />
        <div>
          <h1>{{ boardTitle }}</h1>
          <p>/{{ boardSlug }}</p>
        </div>
      </div>
      <div class="board-actions">
        <button class="text-btn" type="button" @click="copyBoardLink">复制链接</button>
        <button v-if="authStore.authed" class="text-btn danger" type="button" @click="authStore.logout()">退出管理</button>
        <button v-else class="text-btn" type="button" @click="loginOpen = true">管理</button>
      </div>
    </header>

    <section class="board-stage">
      <WhiteboardCanvas :board-slug="boardSlug" />
    </section>

    <div v-if="toast" class="app-toast">{{ toast }}</div>

    <div v-if="loginOpen" class="modal-scrim" @click.self="loginOpen = false">
      <form class="login-panel" @submit.prevent="login">
        <h2>管理白板</h2>
        <input
          v-model="password"
          type="password"
          placeholder="管理员密码"
          autocomplete="current-password"
          autofocus
        />
        <p v-if="loginError">{{ loginError }}</p>
        <div class="login-actions">
          <button type="button" class="text-btn" @click="loginOpen = false">取消</button>
          <button type="submit" class="text-btn primary">登录</button>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import WhiteboardCanvas from './components/WhiteboardCanvas.vue'
import { useAuthStore } from './stores/auth'

const authStore = useAuthStore()
const loginOpen = ref(false)
const password = ref('')
const loginError = ref('')
const toast = ref('')
const boardTitle = ref('Yophon Board')

const boardSlug = computed(() => {
  const path = window.location.pathname
  const match = path.match(/^\/b\/([^/]+)/)
  const slug = match ? decodeURIComponent(match[1]) : new URLSearchParams(window.location.search).get('board')
  return normalizeSlug(slug || 'main')
})

function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'main'
}

function showToast(message: string) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 1600)
}

async function loadBoard() {
  try {
    const res = await fetch(`/api/boards/${boardSlug.value}`)
    const board = await res.json()
    boardTitle.value = board.title || 'Yophon Board'
  } catch {
    boardTitle.value = 'Yophon Board'
  }
}

async function copyBoardLink() {
  const url = new URL(window.location.href)
  url.pathname = `/b/${boardSlug.value}`
  try {
    await navigator.clipboard.writeText(url.toString())
    showToast('链接已复制')
  } catch {
    showToast('复制失败')
  }
}

async function login() {
  loginError.value = ''
  const ok = await authStore.login(password.value)
  if (!ok) {
    loginError.value = '密码错误'
    return
  }
  password.value = ''
  loginOpen.value = false
}

onMounted(async () => {
  await authStore.check()
  await loadBoard()
})
</script>
