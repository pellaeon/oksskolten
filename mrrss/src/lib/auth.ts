const STORAGE_KEY = 'mrrss_auth_token'

export function getAuthToken(): string | null {
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setAuthToken(token: string | null): void {
  if (token) {
    window.localStorage.setItem(STORAGE_KEY, token)
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}
