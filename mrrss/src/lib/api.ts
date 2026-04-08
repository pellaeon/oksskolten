import type { ArticleDetail, ArticleListItem, Category, FeedWithCounts } from '../../../shared/types'
import { getAuthToken } from './auth'

export interface AuthMethods {
  setup_required: boolean
  password: { enabled: boolean }
}

export interface SessionUser {
  email: string
}

export interface FeedResponse {
  feeds: FeedWithCounts[]
  bookmark_count: number
  like_count: number
  clip_feed_id: number | null
}

export interface StatsResponse {
  total_articles: number
  unread_articles: number
  read_articles: number
  bookmarked_articles: number
  liked_articles: number
}

export interface ArticlesResponse {
  articles: ArticleListItem[]
  total: number
  has_more: boolean
  total_all?: number
  total_without_floor?: number
}

export interface ArticleQuery {
  feed_id?: number
  category_id?: number
  unread?: boolean
  bookmarked?: boolean
  liked?: boolean
  read?: boolean
  limit?: number
  offset?: number
  no_floor?: boolean
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`

    try {
      const data = await response.json() as { error?: string }
      if (data.error) message = data.error
    } catch {
      // keep HTTP status text
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export function getAuthMethods() {
  return request<AuthMethods>('/api/auth/methods')
}

export function getSession() {
  return request<SessionUser>('/api/me')
}

export function login(email: string, password: string) {
  return request<{ ok: true; token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function setup(email: string, password: string) {
  return request<{ ok: true; token: string }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function logout() {
  return request<{ ok: true }>('/api/logout', { method: 'POST' })
}

export function getFeeds() {
  return request<FeedResponse>('/api/feeds')
}

export function getCategories() {
  return request<{ categories: Category[] }>('/api/categories')
}

export function getStats() {
  return request<StatsResponse>('/api/stats')
}

export function getArticles(query: ArticleQuery) {
  const params = new URLSearchParams()

  if (query.feed_id != null) params.set('feed_id', String(query.feed_id))
  if (query.category_id != null) params.set('category_id', String(query.category_id))
  if (query.unread) params.set('unread', '1')
  if (query.bookmarked) params.set('bookmarked', '1')
  if (query.liked) params.set('liked', '1')
  if (query.read) params.set('read', '1')
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.offset != null) params.set('offset', String(query.offset))
  if (query.no_floor) params.set('no_floor', '1')

  return request<ArticlesResponse>(`/api/articles?${params.toString()}`)
}

export function getArticleByUrl(url: string) {
  return request<ArticleDetail>(`/api/articles/by-url?url=${encodeURIComponent(url)}`)
}

export function recordRead(articleId: number) {
  return request<{ seen_at: string | null; read_at: string | null }>(`/api/articles/${articleId}/read`, {
    method: 'POST',
  })
}

export function setSeen(articleId: number, seen: boolean) {
  return request<{ seen_at: string | null; read_at: string | null }>(`/api/articles/${articleId}/seen`, {
    method: 'PATCH',
    body: JSON.stringify({ seen }),
  })
}

export function setBookmarked(articleId: number, bookmarked: boolean) {
  return request<{ bookmarked_at: string | null }>(`/api/articles/${articleId}/bookmark`, {
    method: 'PATCH',
    body: JSON.stringify({ bookmarked }),
  })
}

export function setLiked(articleId: number, liked: boolean) {
  return request<{ liked_at: string | null }>(`/api/articles/${articleId}/like`, {
    method: 'PATCH',
    body: JSON.stringify({ liked }),
  })
}
