import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireJson } from '../auth.js'
import { parseOrBadRequest } from '../lib/validation.js'
import {
  clearFreshRssApiKey,
  getFreshRssSettingsState,
  setFreshRssApiKey,
  setFreshRssEnabled,
  setFreshRssEndpointUrl,
  syncFreshRssFeeds,
  verifyFreshRssConnection,
} from '../freshrss/sync.js'
import { normalizeFeverEndpoint } from '../freshrss/client.js'

const FreshRssSettingsBody = z.object({
  enabled: z.boolean().optional(),
  endpointUrl: z.string().optional(),
})

const FreshRssApiKeyBody = z.object({
  apiKey: z.string().optional(),
})

export async function freshRssRoutes(api: FastifyInstance): Promise<void> {
  api.get('/api/settings/freshrss', async (_request, reply) => {
    reply.send(getFreshRssSettingsState())
  })

  api.patch('/api/settings/freshrss', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(FreshRssSettingsBody, request.body, reply)
    if (!body) return
    if (body.enabled === undefined && body.endpointUrl === undefined) {
      reply.status(400).send({ error: 'No fields to update' })
      return
    }

    if (body.enabled !== undefined) {
      setFreshRssEnabled(body.enabled)
    }
    if (body.endpointUrl !== undefined) {
      const normalized = body.endpointUrl.trim() ? normalizeFeverEndpoint(body.endpointUrl) : ''
      setFreshRssEndpointUrl(normalized)
    }

    reply.send(getFreshRssSettingsState())
  })

  api.post('/api/settings/freshrss/api-key', { preHandler: [requireJson] }, async (request, reply) => {
    const body = parseOrBadRequest(FreshRssApiKeyBody, request.body, reply)
    if (!body) return

    if (!body.apiKey?.trim()) {
      clearFreshRssApiKey()
      reply.send(getFreshRssSettingsState())
      return
    }

    setFreshRssApiKey(body.apiKey.trim().toLowerCase())
    reply.send(getFreshRssSettingsState())
  })

  api.post('/api/settings/freshrss/verify', async (_request, reply) => {
    try {
      await verifyFreshRssConnection()
      reply.send({ ok: true })
    } catch (error) {
      reply.status(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  api.post('/api/settings/freshrss/sync', async (_request, reply) => {
    try {
      const result = await syncFreshRssFeeds()
      reply.send({ ok: true, ...result, settings: getFreshRssSettingsState() })
    } catch (error) {
      reply.status(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })
}
