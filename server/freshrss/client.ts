import { logger } from '../logger.js'

const log = logger.child('freshrss')

export interface FreshRssConfig {
  endpointUrl: string
  apiKey: string
}

export interface FreshRssFeed {
  id: number
  title: string
  url: string
  site_url: string
}

export interface FreshRssGroup {
  id: number
  title: string
}

export interface FreshRssFeedGroup {
  group_id: number
  feed_ids: string
}

export interface FreshRssItem {
  id: number
  feed_id: number
  title: string
  url: string
  is_saved: number
  is_read: number
  created_on_time: number
}

interface FreshRssEnvelope {
  api_version: number
  auth: number
  last_refreshed_on_time?: string
  feeds?: FreshRssFeed[]
  groups?: FreshRssGroup[]
  feeds_groups?: FreshRssFeedGroup[]
  items?: FreshRssItem[]
  unread_item_ids?: string
  saved_item_ids?: string
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeFeverEndpoint(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('FreshRSS endpoint URL is required')
  if (!isHttpUrl(trimmed)) throw new Error('FreshRSS endpoint URL must be http or https')

  const url = new URL(trimmed)
  if (!url.pathname.endsWith('/api/fever.php')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/fever.php`
  }
  url.searchParams.set('api', '')
  return url.toString()
}

export function normalizeComparableUrl(raw: string): string {
  try {
    return new URL(raw).href
  } catch {
    return raw
  }
}

export class FreshRssClient {
  private readonly endpointUrl: string

  private readonly apiKey: string

  constructor(config: FreshRssConfig) {
    this.endpointUrl = normalizeFeverEndpoint(config.endpointUrl)
    this.apiKey = config.apiKey.trim().toLowerCase()
    if (!/^[0-9a-f]{32}$/.test(this.apiKey)) {
      throw new Error('FreshRSS API key must be a 32-character hexadecimal Fever key')
    }
  }

  private buildUrl(query: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(this.endpointUrl)
    url.searchParams.set('api', '')
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, value === true ? '' : String(value))
    }
    return url.toString()
  }

  private async request(query: Record<string, string | number | boolean | undefined>): Promise<FreshRssEnvelope> {
    const body = new URLSearchParams({ api_key: this.apiKey })
    const response = await fetch(this.buildUrl(query), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      throw new Error(`FreshRSS request failed with ${response.status}`)
    }

    const json = await response.json() as FreshRssEnvelope
    if (json.auth !== 1) {
      throw new Error('FreshRSS authentication failed')
    }
    return json
  }

  async verify(): Promise<void> {
    await this.request({})
  }

  async getFeedsAndGroups(): Promise<{ feeds: FreshRssFeed[]; groups: FreshRssGroup[]; feedsGroups: FreshRssFeedGroup[] }> {
    const json = await this.request({ feeds: true, groups: true })
    return {
      feeds: json.feeds ?? [],
      groups: json.groups ?? [],
      feedsGroups: json.feeds_groups ?? [],
    }
  }

  async getItemsByFeed(feedId: number, maxId?: number): Promise<FreshRssItem[]> {
    const json = await this.request({
      items: true,
      feed_ids: String(feedId),
      ...(maxId != null ? { max_id: String(maxId) } : {}),
    })
    return json.items ?? []
  }

  async markItemRead(id: number, read: boolean): Promise<void> {
    await this.request({
      mark: 'item',
      as: read ? 'read' : 'unread',
      id,
    })
  }

  async markItemSaved(id: number, saved: boolean): Promise<void> {
    await this.request({
      mark: 'item',
      as: saved ? 'saved' : 'unsaved',
      id,
    })
  }

  async markFeedRead(feedId: number): Promise<void> {
    await this.request({
      mark: 'feed',
      as: 'read',
      id: feedId,
    })
  }

  async markGroupRead(groupId: number): Promise<void> {
    await this.request({
      mark: 'group',
      as: 'read',
      id: groupId,
    })
  }

  async findItemIdByFeedAndUrl(feedId: number, targetUrl: string, maxPages = 20): Promise<number | null> {
    const normalizedTarget = normalizeComparableUrl(targetUrl)
    let cursor: number | undefined = Number.MAX_SAFE_INTEGER

    for (let page = 0; page < maxPages; page++) {
      const items = await this.getItemsByFeed(feedId, cursor)
      if (items.length === 0) return null

      for (const item of items) {
        if (normalizeComparableUrl(item.url) === normalizedTarget) {
          return item.id
        }
      }

      const nextCursor = Math.min(...items.map(item => item.id))
      if (!Number.isFinite(nextCursor) || items.length < 50) return null
      if (cursor === nextCursor) return null
      cursor = nextCursor
    }

    log.warn({ feedId, targetUrl }, 'FreshRSS item lookup exceeded page limit')
    return null
  }
}
