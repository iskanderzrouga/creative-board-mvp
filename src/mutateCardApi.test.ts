/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from '../api/workspace/mutate-card'
import { createSeedState } from './board'

const ORIGINAL_ENV = { ...process.env }

describe('workspace mutate-card API', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      REMOTE_WORKSPACE_ID: 'primary',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('creates a card in workspace_state before post-create mutations need it', async () => {
    const seed = createSeedState()
    const portfolio = seed.portfolios[0]!
    const updatedAt = '2026-05-25T04:00:00.000Z'
    let patchedState: unknown = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ email: 'naomi@bluebrands.co' }), { status: 200 })
      }

      if (url.includes('/rest/v1/workspace_access?')) {
        return new Response(
          JSON.stringify([
            {
              email: 'naomi@bluebrands.co',
              role_mode: 'manager',
              editor_name: null,
              scope_mode: 'selected-portfolios',
              scope_assignments: [{ portfolioId: portfolio.id, brandNames: [] }],
            },
          ]),
          { status: 200 },
        )
      }

      if (url.includes('/rest/v1/workspace_state?select=state')) {
        return new Response(JSON.stringify([{ state: seed, updated_at: updatedAt }]), { status: 200 })
      }

      if (url.includes('/rest/v1/workspace_state?workspace_id=') && init?.method === 'PATCH') {
        patchedState = JSON.parse(String(init.body)).state
        return new Response(
          JSON.stringify([{ updated_at: '2026-05-25T04:00:02.000Z' }]),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify({ error: 'unexpected fetch', url }), { status: 500 })
    })

    const response = await handler(
      new Request('https://app.example/api/workspace/mutate-card', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          portfolioId: portfolio.id,
          input: {
            brand: portfolio.brands[0]!.name,
            product: portfolio.brands[0]!.products[0],
            taskTypeId: seed.settings.taskLibrary[0]!.id,
            title: 'Durable create coverage card',
            angle: 'Persistence',
            sourceCardId: null,
          },
          actor: 'Naomi',
          createdAt: '2026-05-25T04:00:01.000Z',
        }),
      }),
    ) as Response

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      success: boolean
      card?: { id: string; title: string }
      state?: typeof seed
    }

    expect(payload.success).toBe(true)
    expect(payload.card?.title).toBe('Durable create coverage card')
    expect(payload.state?.portfolios[0]?.cards.some((card) => card.id === payload.card?.id)).toBe(true)
    expect(patchedState).not.toBeNull()
    expect(
      (patchedState as typeof seed).portfolios[0]?.cards.some(
        (card) => card.title === 'Durable create coverage card',
      ),
    ).toBe(true)
  })
})
