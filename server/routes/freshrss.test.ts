import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { EventEmitter } from 'events'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { getFeeds } from '../db.js'

vi.mock('../fetcher.js', () => ({
  fetchAllFeeds: vi.fn(),
  fetchSingleFeed: vi.fn(),
  discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: null, title: null }),
  summarizeArticle: vi.fn(),
  streamSummarizeArticle: vi.fn(),
  translateArticle: vi.fn(),
  streamTranslateArticle: vi.fn(),
  fetchProgress: new EventEmitter(),
  getFeedState: vi.fn(),
}))

vi.mock('../anthropic.js', () => ({
  anthropic: { messages: { stream: vi.fn(), create: vi.fn() } },
}))

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('FreshRSS settings routes', () => {
  let app: FastifyInstance
  const json = { 'content-type': 'application/json' }

  beforeEach(async () => {
    setupTestDb()
    vi.restoreAllMocks()
    app = await buildApp()
  })

  it('stores FreshRSS settings and syncs feeds on demand', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      api_version: 4,
      auth: 1,
      groups: [{ id: 31, title: 'Imported' }],
      feeds_groups: [{ group_id: 31, feed_ids: '41' }],
      feeds: [{
        id: 41,
        title: 'Imported Feed',
        url: 'https://imported.example/feed.xml',
        site_url: 'https://imported.example',
        is_spark: 0,
        last_updated_on_time: 0,
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const settingsRes = await app.inject({
      method: 'PATCH',
      url: '/api/settings/freshrss',
      headers: json,
      payload: {
        enabled: true,
        endpointUrl: 'http://freshrss.test/api/fever.php',
      },
    })
    expect(settingsRes.statusCode).toBe(200)
    expect(settingsRes.json().enabled).toBe(true)

    const keyRes = await app.inject({
      method: 'POST',
      url: '/api/settings/freshrss/api-key',
      headers: json,
      payload: { apiKey: '0123456789abcdef0123456789abcdef' },
    })
    expect(keyRes.statusCode).toBe(200)
    expect(keyRes.json().apiKeyConfigured).toBe(true)

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/settings/freshrss/sync',
    })
    expect(syncRes.statusCode).toBe(200)
    expect(syncRes.json().createdFeeds).toBe(1)
    expect(getFeeds().some(feed => feed.name === 'Imported Feed')).toBe(true)
  })
})
