import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import {
  createFeed,
  getCategories,
  getFeeds,
  getSetting,
  insertArticle,
  markArticleLiked,
  upsertSetting,
} from '../db.js'
import { upsertFreshRssFeedMapping } from '../db/freshrss.js'
import { syncFreshRssFeeds, syncFreshRssSavedStateByLocalArticleId } from './sync.js'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('FreshRSS sync', () => {
  beforeEach(() => {
    setupTestDb()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('imports categories and feeds from FreshRSS Fever API', async () => {
    upsertSetting('integration.freshrss_enabled', 'on')
    upsertSetting('integration.freshrss_endpoint_url', 'http://freshrss.test/api/fever.php')
    upsertSetting('integration.freshrss_api_key', '0123456789abcdef0123456789abcdef')

    const fetchMock = vi.fn(async () => jsonResponse({
      api_version: 4,
      auth: 1,
      groups: [{ id: 11, title: 'Remote Category' }],
      feeds_groups: [{ group_id: 11, feed_ids: '21' }],
      feeds: [{
        id: 21,
        title: 'Remote Feed',
        url: 'https://example.com/feed.xml',
        site_url: 'https://example.com',
        is_spark: 0,
        last_updated_on_time: 0,
      }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncFreshRssFeeds()

    expect(result.createdCategories).toBe(1)
    expect(result.createdFeeds).toBe(1)
    expect(getCategories().map(category => category.name)).toContain('Remote Category')
    expect(getFeeds().some(feed => feed.name === 'Remote Feed' && feed.rss_url === 'https://example.com/feed.xml')).toBe(true)
    expect(getSetting('integration.freshrss_last_sync_at')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps liked articles to FreshRSS saved state and clears saved when no local star remains', async () => {
    upsertSetting('integration.freshrss_enabled', 'on')
    upsertSetting('integration.freshrss_endpoint_url', 'http://freshrss.test/api/fever.php')
    upsertSetting('integration.freshrss_api_key', '0123456789abcdef0123456789abcdef')

    const feed = createFeed({
      name: 'Mapped Feed',
      url: 'https://example.com',
      rss_url: 'https://example.com/feed.xml',
      type: 'rss',
    })
    upsertFreshRssFeedMapping(21, feed.id, null)

    const articleId = insertArticle({
      feed_id: feed.id,
      title: 'Article',
      url: 'https://example.com/post',
      published_at: '2025-01-01T00:00:00Z',
    })

    const requests: URL[] = []
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input))
      requests.push(url)

      if (url.searchParams.has('items')) {
        return jsonResponse({
          api_version: 4,
          auth: 1,
          items: [{
            id: 777,
            feed_id: 21,
            title: 'Article',
            url: 'https://example.com/post',
            is_saved: 0,
            is_read: 0,
            created_on_time: 1735689600,
          }],
        })
      }

      return jsonResponse({ api_version: 4, auth: 1 })
    })
    vi.stubGlobal('fetch', fetchMock)

    markArticleLiked(articleId, true)
    await syncFreshRssSavedStateByLocalArticleId(articleId)

    markArticleLiked(articleId, false)
    await syncFreshRssSavedStateByLocalArticleId(articleId)

    expect(requests.some(url => url.searchParams.get('mark') === 'item' && url.searchParams.get('as') === 'saved' && url.searchParams.get('id') === '777')).toBe(true)
    expect(requests.some(url => url.searchParams.get('mark') === 'item' && url.searchParams.get('as') === 'unsaved' && url.searchParams.get('id') === '777')).toBe(true)
  })
})
