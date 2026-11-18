// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { draftToModel, type WorldDraft } from '../src/lib/ai/draft'
import { handleAi } from '../server/aiCore'
import { replay } from '../src/engine/history/replay'
import { advance, createRootBranch } from '../src/engine/history/branch'
import type { IncomingMessage, ServerResponse } from 'node:http'

const draft = (): WorldDraft => ({
  name: 'Peat & Oil',
  description: 'Two clans.',
  resources: [{ id: 'oil', name: 'Whale oil', color: '#aa9966', description: '' }],
  factions: [
    { id: 'iron', name: 'Ironhold', color: '#cc5555', description: '', initialStability: 60, traits: { aggression: 0.5, ambition: 0.5, caution: 0.5, mercantile: 0.5 } },
    { id: 'seal', name: 'Seal Coast', color: '#5588aa', description: '', initialStability: 60, traits: { aggression: 0.5, ambition: 0.5, caution: 0.5, mercantile: 0.5 } },
  ],
  locations: [
    { id: 'hold', name: 'Hold', region: 'North', description: '', ownerId: 'iron', population: 400, x: 200, y: 200, stock: [{ resourceId: 'oil', amount: 100 }] },
    { id: 'bay', name: 'Bay', region: 'South', description: '', ownerId: 'seal', population: 300, x: 700, y: 400, stock: [{ resourceId: 'oil', amount: 300 }] },
  ],
  routes: [{ id: 'r1', name: 'Oil run', fromId: 'bay', toId: 'hold', resourceId: 'oil', amount: 30, minRelation: -10 }],
  relations: [{ a: 'iron', b: 'seal', value: 10 }],
  rules: [
    { id: 'p', name: 'Hunt', type: 'produce', priority: 10, scope: { kind: 'faction', id: 'seal' }, resourceId: 'oil', amount: 12, perCapita: true, variance: 0.1 },
    { id: 't', name: 'Trade', type: 'trade', priority: 20, reserve: 20, relationGain: 0.5 },
    { id: 'c', name: 'Burn oil', type: 'consume', priority: 30, scope: { kind: 'all' }, resourceId: 'oil', amount: 6, perCapita: true, shortageStabilityDelta: -4, shortagePopulationLoss: 0.05 },
  ],
  events: [{ id: 'e', name: 'Hard winter', description: '', step: 4, effects: [{ kind: 'addModifier', locationId: 'bay', resourceId: 'oil', factor: 0.5, duration: 3.4, label: 'Ice' }] }],
})

describe('AI drafts are validated like imports', () => {
  test('a valid draft converts into a simulatable model', () => {
    const r = draftToModel(draft(), 9)
    expect(r.ok).toBe(true)
    expect(r.model.locations[0]?.initialStock).toEqual({ oil: 100 })
    expect(r.model.events[0]?.effects[0]).toMatchObject({ duration: 3 })
    expect(replay(advance(createRootBranch(r.model, { id: 'm', color: '#ffffff', createdAt: 0 }), 10)).states).toHaveLength(11)
  })

  test('broken references and bad values are reported, not applied', () => {
    const d = draft()
    d.routes[0]!.toId = 'atlantis'
    d.factions[0]!.color = 'red'
    const r = draftToModel(d)
    expect(r.ok).toBe(false)
    expect(r.issues.map((i) => i.message).join(' ')).toMatch(/colour|atlantis/)
  })
})

function fakeRes() {
  const out = { status: 0, body: '' }
  const res = {
    statusCode: 0,
    setHeader() {},
    end(b: string) {
      out.status = this.statusCode
      out.body = b
    },
  }
  return { res: res as unknown as ServerResponse, out }
}

describe('AI endpoints without credentials', () => {
  test('status reports unavailable and actions return 503; other routes pass through', async () => {
    const saved = { k: process.env.ANTHROPIC_API_KEY, t: process.env.ANTHROPIC_AUTH_TOKEN, b: process.env.BRANCHPOINT_AI }
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
    delete process.env.BRANCHPOINT_AI
    try {
      const a = fakeRes()
      expect(await handleAi({ url: '/api/ai/status', method: 'GET' } as IncomingMessage, a.res)).toBe(true)
      expect(JSON.parse(a.out.body)).toMatchObject({ available: false })
      const b = fakeRes()
      await handleAi({ url: '/api/ai/draft', method: 'POST' } as IncomingMessage, b.res)
      expect(b.out.status).toBe(503)
      expect(await handleAi({ url: '/index.html', method: 'GET' } as IncomingMessage, fakeRes().res)).toBe(false)
    } finally {
      if (saved.k) process.env.ANTHROPIC_API_KEY = saved.k
      if (saved.t) process.env.ANTHROPIC_AUTH_TOKEN = saved.t
      if (saved.b) process.env.BRANCHPOINT_AI = saved.b
    }
  })
})
