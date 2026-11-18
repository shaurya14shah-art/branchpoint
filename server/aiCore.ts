import type { IncomingMessage, ServerResponse } from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { compareFactsSchema, draftToModel, worldDraftSchema } from '../src/lib/ai/draft'

/**
 * Optional AI endpoints. The API key is read from the server environment only; nothing here is
 * bundled into the browser. Every AI result is validated before it is returned, and the client
 * validates again and asks the user to approve it before anything is applied.
 */

const MODEL = 'claude-opus-5-5'
// Server-side refusal fallback: if the model declines, the API reroutes within the same call.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.BRANCHPOINT_AI === '1')
}

let client: Anthropic | null = null
const getClient = () => (client ??= new Anthropic())

const DRAFT_SYSTEM = `You turn a prose description of a fictional world into a model for Branchpoint, a deterministic simulation of factions, settlements, resources and trade.

How the engine works (design numbers that make the simulation interesting, not static or instantly collapsing):
- Each step: scheduled events fire, then rules run in ascending priority. Later rules see earlier rules' changes.
- Quantities are integers. Stability is 0-100. Relations between factions are -100..100 (pairs not listed start at 0).
- Rule types: drift (stability relaxes toward target by rate, use ~0.05-0.1, priority 0); produce (scope locations gain amount, or amount per 100 people when perCapita; variance 0-0.3, priority ~10); trade (moves goods along every route each step, never draining a source below reserve; cross-faction routes halt when relation < route.minRelation; priority ~20); consume (perCapita amount per 100 people; shortage lowers owner stability by shortageStabilityDelta (negative) and loses shortagePopulationLoss (0-0.2) of the unfed; priority ~30); decay (fraction 0-0.1 lost per step, priority ~40); growth (population grows by rate ~0.01-0.02 while stock >= surplusPerCapita per 100 people; priority ~50); threshold (when a condition holds, apply effects; use cooldown 3-10; priority ~60).
- Emergent rules (include one of each so the world evolves on its own): succession (priority 1, stepsPerYear 1, crisisStability ~12); fortune (priority 5, chance ~0.3, intensity 1); migration (priority 45, rate ~0.05); contagion (priority 46, outbreakChance ~0.006, spreadChance ~0.3, mortality ~0.04, duration ~5); agency (priority 55, foodResourceId = staple, investResourceId = a scarce material, activity ~0.7, temperament 1); warfare (priority 58, armsResourceId = a metal or similar, casualtyRate ~0.06, conquestRatio ~1.35, exhaustionLimit ~75).
- Every faction has traits (0..1): aggression, ambition, caution, mercantile. Make them distinct and true to the description; they drive raids, wars, alliances, aid, embargoes and investment.
- A staple food consumed at ~8 per 100 people should be produced at ~6-15 per 100 depending on the faction, so some factions depend on trade.
- Scheduled events (step >= 3) are shocks such as droughts: addModifier multiplies a location's output of a resource by factor (e.g. 0.4) for duration steps.

Rules for the output:
- 2-5 factions, 4-12 settlements grouped into 2-5 regions (islands/areas), 2-5 resources, 3-10 trade routes, 6-14 rules, 0-3 scheduled events.
- ids are short kebab-case and unique across ALL entities (resources, factions, locations, routes, rules, events). Every reference must use an existing id.
- Colours are muted #rrggbb hex. Settlement coordinates: x in 80-920, y in 80-560; settlements in the same region sit within ~200 units of each other, regions apart.
- Populations 100-2000. Starting stocks should cover several steps of consumption.
- Only use what the description supports; fill gaps with plausible, modest choices. Descriptions belong in plain prose.`

const SUMMARY_SYSTEM = `You summarise differences between simulated timelines in Branchpoint. You are given facts computed by a deterministic engine: which inputs differ between branches (the only causes of divergence), final-state numbers, and milestones.
Write at most 150 words of plain prose. Use only the provided facts and numbers; do not invent events or values. Name the input change(s) first, then the most important outcome differences with numbers and steps. When linking an outcome to a cause beyond what the facts state, phrase it as a likely mechanism, not a certainty. No headings or bullet lists.`

async function readJson(req: IncomingMessage, limit = 256 * 1024): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, 'Request too large')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Body must be JSON')
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function refusalMessage(stop: string | null | undefined): string | null {
  return stop === 'refusal' ? 'The model declined this request.' : stop === 'max_tokens' ? 'The response was cut off; try a shorter description.' : null
}

async function draft(body: unknown) {
  const parsed = (body ?? {}) as { description?: unknown; seed?: unknown }
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (description.length < 20) throw new HttpError(400, 'Describe the world in at least a sentence or two.')
  if (description.length > 8000) throw new HttpError(400, 'Description is longer than 8,000 characters.')
  const seed = typeof parsed.seed === 'number' && Number.isInteger(parsed.seed) ? parsed.seed >>> 0 : 1

  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    ...FALLBACK,
    output_config: { effort: 'high', format: betaZodOutputFormat(worldDraftSchema) },
    system: DRAFT_SYSTEM,
    messages: [{ role: 'user', content: `World description:\n\n${description}` }],
  })
  const message = await stream.finalMessage()
  const stopped = refusalMessage(message.stop_reason)
  if (stopped) throw new HttpError(422, stopped)
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new HttpError(502, 'The model returned malformed JSON.')
  }
  const shaped = worldDraftSchema.safeParse(json)
  if (!shaped.success) throw new HttpError(502, `The model returned an unexpected shape: ${shaped.error.issues[0]?.message ?? 'unknown'}`)
  return draftToModel(shaped.data, seed)
}

async function summarize(body: unknown) {
  const facts = compareFactsSchema.safeParse((body as { facts?: unknown } | null)?.facts)
  if (!facts.success) throw new HttpError(400, 'Invalid comparison facts.')
  const message = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: 'medium' },
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: `Facts (JSON):\n${JSON.stringify(facts.data)}` }],
  })
  const stopped = refusalMessage(message.stop_reason)
  if (stopped) throw new HttpError(422, stopped)
  return { summary: message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim(), model: message.model }
}

/** Handles /api/ai/* ; returns false when the URL is not an AI route. */
export async function handleAi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split('?')[0] ?? ''
  if (!url.startsWith('/api/ai/')) return false
  try {
    if (url === '/api/ai/status' && req.method === 'GET') return send(res, 200, { available: aiConfigured(), model: MODEL }), true
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    if (!aiConfigured()) throw new HttpError(503, 'AI is not configured on this server (set ANTHROPIC_API_KEY).')
    if (url === '/api/ai/draft') return send(res, 200, await draft(await readJson(req))), true
    if (url === '/api/ai/summarize') return send(res, 200, await summarize(await readJson(req))), true
    throw new HttpError(404, 'Unknown AI endpoint')
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: e.message })
    else if (e instanceof Anthropic.AuthenticationError) send(res, 503, { error: 'The server’s Anthropic credentials were rejected.' })
    else if (e instanceof Anthropic.RateLimitError) send(res, 429, { error: 'Rate limited by the AI provider; try again shortly.' })
    else if (e instanceof Anthropic.APIError) send(res, 502, { error: `AI provider error (${e.status ?? 'network'}).` })
    else {
      console.error('[branchpoint ai]', e)
      send(res, 500, { error: 'Unexpected server error.' })
    }
    return true
  }
}
