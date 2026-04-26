import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const authed = ref(false)
  const checked = ref(false)

  async function check() {
    try {
      const res = await fetch('/api/auth/check', { credentials: 'same-origin' })
      const data = await res.json()
      authed.value = !!data.authed
    } catch {
      authed.value = false
    }
    checked.value = true
  }

  async function login(password: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        authed.value = true
        return true
      }
    } catch {
      // handled by caller
    }
    return false
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // ignore network errors on logout
    }
    authed.value = false
  }

  return { authed, checked, check, login, logout }
})
