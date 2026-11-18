import { Plus, X } from 'lucide-react'
import type { Comparator, Condition, Effect, Metric, Rule, RuleType, Scope, WorldModel } from '../../engine/model'
import { Button, Field, NumberInput, Select, TextInput, Toggle } from '../../components/ui'

/** Form controls for the controlled rule vocabulary. No free-form code anywhere. */

const opt = (list: { id: string; name: string }[]) => list.map((x) => ({ value: x.id, label: x.name }))

export function ScopePicker({ value, onChange, model, disabled }: { value: Scope; onChange: (s: Scope) => void; model: WorldModel; disabled?: boolean }) {
  const regions = [...new Set(model.locations.map((l) => l.region).filter(Boolean))]
  const kinds = [
    { value: 'all', label: 'Every location' },
    { value: 'faction', label: 'Locations held by…' },
    { value: 'region', label: 'Locations in region…' },
    { value: 'location', label: 'One location…' },
  ] as const
  const setKind = (k: Scope['kind']) => {
    if (k === 'all') onChange({ kind: 'all' })
    if (k === 'faction') onChange({ kind: 'faction', id: model.factions[0]?.id ?? '' })
    if (k === 'region') onChange({ kind: 'region', region: regions[0] ?? '' })
    if (k === 'location') onChange({ kind: 'location', id: model.locations[0]?.id ?? '' })
  }
  return (
    <div className="stack-2">
      <Select value={value.kind} options={[...kinds]} onChange={setKind} disabled={disabled} />
      {value.kind === 'faction' && <Select value={value.id} options={opt(model.factions)} onChange={(id) => onChange({ kind: 'faction', id })} disabled={disabled} />}
      {value.kind === 'location' && <Select value={value.id} options={opt(model.locations)} onChange={(id) => onChange({ kind: 'location', id })} disabled={disabled} />}
      {value.kind === 'region' && <Select value={value.region} options={regions.map((r) => ({ value: r, label: r }))} onChange={(region) => onChange({ kind: 'region', region })} disabled={disabled} />}
    </div>
  )
}

const METRICS: { value: Metric['kind']; label: string }[] = [
  { value: 'factionStock', label: 'Faction’s total stock' },
  { value: 'stock', label: 'Stock at a location' },
  { value: 'stability', label: 'Faction stability' },
  { value: 'factionPopulation', label: 'Faction population' },
  { value: 'population', label: 'Location population' },
  { value: 'relation', label: 'Relation between factions' },
]

function defaultMetric(kind: Metric['kind'], m: WorldModel): Metric {
  const f = m.factions[0]?.id ?? ''
  const f2 = m.factions[1]?.id ?? f
  const l = m.locations[0]?.id ?? ''
  const r = m.resources[0]?.id ?? ''
  switch (kind) {
    case 'stock':
      return { kind, locationId: l, resourceId: r }
    case 'factionStock':
      return { kind, factionId: f, resourceId: r }
    case 'population':
      return { kind, locationId: l }
    case 'factionPopulation':
    case 'stability':
      return { kind, factionId: f }
    case 'relation':
      return { kind, a: f, b: f2 }
  }
}

export function ConditionEditor({ value, onChange, model, disabled }: { value: Condition; onChange: (c: Condition) => void; model: WorldModel; disabled?: boolean }) {
  const m = value.metric
  const setMetric = (metric: Metric) => onChange({ ...value, metric })
  return (
    <div className="stack-2">
      <Select value={m.kind} options={METRICS} onChange={(k) => setMetric(defaultMetric(k, model))} disabled={disabled} />
      <div className="row-2">
        {'factionId' in m && <Select value={m.factionId} options={opt(model.factions)} onChange={(factionId) => setMetric({ ...m, factionId })} disabled={disabled} />}
        {'locationId' in m && <Select value={m.locationId} options={opt(model.locations)} onChange={(locationId) => setMetric({ ...m, locationId })} disabled={disabled} />}
        {'resourceId' in m && <Select value={m.resourceId} options={opt(model.resources)} onChange={(resourceId) => setMetric({ ...m, resourceId })} disabled={disabled} />}
        {m.kind === 'relation' && (
          <>
            <Select value={m.a} options={opt(model.factions)} onChange={(a) => setMetric({ ...m, a })} disabled={disabled} />
            <Select value={m.b} options={opt(model.factions)} onChange={(b) => setMetric({ ...m, b })} disabled={disabled} />
          </>
        )}
      </div>
      <div className="row-2">
        <Select<Comparator>
          value={value.op}
          options={[
            { value: '<', label: 'is below' },
            { value: '<=', label: 'is at most' },
            { value: '>', label: 'is above' },
            { value: '>=', label: 'is at least' },
          ]}
          onChange={(op) => onChange({ ...value, op })}
          disabled={disabled}
        />
        <NumberInput value={value.value} onCommit={(v) => onChange({ ...value, value: v })} disabled={disabled} />
      </div>
    </div>
  )
}

const EFFECT_KINDS: { value: Effect['kind']; label: string }[] = [
  { value: 'adjustStock', label: 'Change stock by' },
  { value: 'setStock', label: 'Set stock to' },
  { value: 'adjustPopulation', label: 'Change population by' },
  { value: 'adjustStability', label: 'Change stability by' },
  { value: 'adjustRelation', label: 'Change relation by' },
  { value: 'setRouteActive', label: 'Open / close route' },
  { value: 'setOwner', label: 'Transfer location' },
  { value: 'addModifier', label: 'Output modifier' },
  { value: 'setWar', label: 'Declare war / make peace' },
  { value: 'setAlliance', label: 'Form / break alliance' },
  { value: 'adjustTech', label: 'Change innovation by' },
  { value: 'startPlague', label: 'Start a plague' },
]

export function defaultEffect(kind: Effect['kind'], m: WorldModel): Effect {
  const f = m.factions[0]?.id ?? ''
  const f2 = m.factions[1]?.id ?? f
  const l = m.locations[0]?.id ?? ''
  const r = m.resources[0]?.id ?? ''
  switch (kind) {
    case 'adjustStock':
      return { kind, locationId: l, resourceId: r, delta: -50 }
    case 'setStock':
      return { kind, locationId: l, resourceId: r, value: 0 }
    case 'adjustPopulation':
      return { kind, locationId: l, delta: -50 }
    case 'setPopulation':
      return { kind, locationId: l, value: 100 }
    case 'adjustStability':
      return { kind, factionId: f, delta: -10 }
    case 'setStability':
      return { kind, factionId: f, value: 50 }
    case 'adjustRelation':
      return { kind, a: f, b: f2, delta: -10 }
    case 'setRouteActive':
      return { kind, routeId: m.routes[0]?.id ?? '', active: false }
    case 'setOwner':
      return { kind, locationId: l, factionId: f }
    case 'addModifier':
      return { kind, locationId: l, resourceId: r, factor: 0.5, duration: 4, label: 'Blight' }
    case 'setWar':
      return { kind, a: f, b: f2, active: true }
    case 'setAlliance':
      return { kind, a: f, b: f2, active: true }
    case 'adjustTech':
      return { kind, factionId: f, delta: 0.1 }
    case 'startPlague':
      return { kind, locationId: l, duration: 5 }
  }
}

function EffectRow({ e, onChange, model, disabled }: { e: Effect; onChange: (e: Effect) => void; model: WorldModel; disabled?: boolean }) {
  const locs = opt(model.locations)
  const facs = opt(model.factions)
  const res = opt(model.resources)
  return (
    <div className="stack-2">
      <Select value={e.kind} options={EFFECT_KINDS.some((k) => k.value === e.kind) ? EFFECT_KINDS : [...EFFECT_KINDS, { value: e.kind, label: e.kind }]} onChange={(k) => onChange(defaultEffect(k, model))} disabled={disabled} />
      <div className="row-2 wrap">
        {'locationId' in e && <Select value={e.locationId} options={locs} onChange={(locationId) => onChange({ ...e, locationId })} disabled={disabled} />}
        {'resourceId' in e && <Select value={e.resourceId} options={res} onChange={(resourceId) => onChange({ ...e, resourceId })} disabled={disabled} />}
        {'factionId' in e && <Select value={e.factionId} options={facs} onChange={(factionId) => onChange({ ...e, factionId })} disabled={disabled} />}
        {(e.kind === 'setWar' || e.kind === 'setAlliance') && (
          <>
            <Select value={e.a} options={facs} onChange={(a) => onChange({ ...e, a })} disabled={disabled} />
            <Select value={e.b} options={facs} onChange={(b) => onChange({ ...e, b })} disabled={disabled} />
            <Toggle label={e.kind === 'setWar' ? 'At war' : 'Allied'} checked={e.active} onChange={(active) => onChange({ ...e, active })} disabled={disabled} />
          </>
        )}
        {e.kind === 'startPlague' && <NumberInput value={e.duration} min={1} max={100} suffix="steps" onCommit={(duration) => onChange({ ...e, duration: Math.round(duration) })} disabled={disabled} />}
        {e.kind === 'adjustRelation' && (
          <>
            <Select value={e.a} options={facs} onChange={(a) => onChange({ ...e, a })} disabled={disabled} />
            <Select value={e.b} options={facs} onChange={(b) => onChange({ ...e, b })} disabled={disabled} />
          </>
        )}
        {e.kind === 'setRouteActive' && (
          <>
            <Select value={e.routeId} options={opt(model.routes)} onChange={(routeId) => onChange({ ...e, routeId })} disabled={disabled} />
            <Toggle label="Route open" checked={e.active} onChange={(active) => onChange({ ...e, active })} disabled={disabled} />
          </>
        )}
        {'delta' in e && <NumberInput value={e.delta} onCommit={(delta) => onChange({ ...e, delta })} disabled={disabled} />}
        {'value' in e && <NumberInput value={e.value} min={0} onCommit={(value) => onChange({ ...e, value })} disabled={disabled} />}
        {e.kind === 'addModifier' && (
          <>
            <NumberInput value={e.factor} min={0} max={10} step={0.1} suffix="×" onCommit={(factor) => onChange({ ...e, factor })} disabled={disabled} />
            <NumberInput value={e.duration} min={1} max={1000} suffix="steps" onCommit={(duration) => onChange({ ...e, duration: Math.round(duration) })} disabled={disabled} />
            <TextInput value={e.label} disabled={disabled} placeholder="Label" onCommit={(label) => onChange({ ...e, label: label.trim() || 'Modifier' })} />
          </>
        )}
      </div>
    </div>
  )
}

export function EffectsEditor({ value, onChange, model, disabled, min = 0 }: { value: Effect[]; onChange: (e: Effect[]) => void; model: WorldModel; disabled?: boolean; min?: number }) {
  return (
    <div className="effects">
      {value.map((e, i) => (
        <div key={i} className="effect-card">
          <EffectRow e={e} model={model} disabled={disabled} onChange={(ne) => onChange(value.map((x, j) => (j === i ? ne : x)))} />
          <button type="button" className="icon-btn" aria-label="Remove effect" disabled={disabled || value.length <= min} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X size={13} />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus size={13} />} disabled={disabled || value.length >= 20} onClick={() => onChange([...value, defaultEffect('adjustStability', model)])}>
        Add effect
      </Button>
    </div>
  )
}

/** Type-specific parameters. `set` merges a patch into the rule. */
export function RuleParams({ rule, model, set, disabled }: { rule: Rule; model: WorldModel; set: (patch: Partial<Rule>) => void; disabled?: boolean }) {
  const res = opt(model.resources)
  switch (rule.type) {
    case 'produce':
    case 'consume':
      return (
        <>
          <Field label="Applies to">{() => <ScopePicker value={rule.scope} model={model} disabled={disabled} onChange={(scope) => set({ scope })} />}</Field>
          <Field label="Resource" inline>{(id) => <Select id={id} value={rule.resourceId} options={res} disabled={disabled} onChange={(resourceId) => set({ resourceId })} />}</Field>
          <Field label="Amount" inline>{(id) => <NumberInput id={id} min={0} max={1e6} value={rule.amount} disabled={disabled} onCommit={(amount) => set({ amount })} />}</Field>
          <Field label="Per 100 people" inline hint="When on, the amount scales with population.">
            {(id) => <Toggle id={id} label="Per 100 people" checked={rule.perCapita} disabled={disabled} onChange={(perCapita) => set({ perCapita })} />}
          </Field>
          {rule.type === 'produce' && (
            <Field label="Variance" inline hint="Seeded ± fraction (0–0.5). Same seed → same draws.">
              {(id) => <NumberInput id={id} min={0} max={0.5} step={0.01} value={rule.variance} disabled={disabled} onCommit={(variance) => set({ variance })} />}
            </Field>
          )}
          {rule.type === 'consume' && (
            <>
              <Field label="Shortage: stability" inline hint="Applied to the owner for each location that runs short.">
                {(id) => <NumberInput id={id} min={-100} max={100} value={rule.shortageStabilityDelta} disabled={disabled} onCommit={(shortageStabilityDelta) => set({ shortageStabilityDelta })} />}
              </Field>
              <Field label="Shortage: population loss" inline hint="Fraction (0–1) of the unmet population lost.">
                {(id) => <NumberInput id={id} min={0} max={1} step={0.01} value={rule.shortagePopulationLoss} disabled={disabled} onCommit={(shortagePopulationLoss) => set({ shortagePopulationLoss })} />}
              </Field>
            </>
          )}
        </>
      )
    case 'trade':
      return (
        <>
          <Field label="Routes">
            {() => (
              <div className="check-list">
                <label className="check">
                  <input type="checkbox" checked={rule.routeIds === 'all'} disabled={disabled} onChange={(e) => set({ routeIds: e.target.checked ? 'all' : model.routes.map((r) => r.id) })} />
                  All routes (including ones added later)
                </label>
                {rule.routeIds !== 'all' &&
                  model.routes.map((r) => {
                    const ids = rule.routeIds === 'all' ? [] : rule.routeIds
                    return (
                      <label key={r.id} className="check">
                        <input type="checkbox" checked={ids.includes(r.id)} disabled={disabled} onChange={(e) => set({ routeIds: e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id) })} />
                        {r.name}
                      </label>
                    )
                  })}
              </div>
            )}
          </Field>
          <Field label="Source reserve" inline hint="A route never draws its source below this.">
            {(id) => <NumberInput id={id} min={0} max={1e6} value={rule.reserve} disabled={disabled} onCommit={(reserve) => set({ reserve })} />}
          </Field>
          <Field label="Relation gain" inline hint="Per delivery between different owners.">
            {(id) => <NumberInput id={id} min={-100} max={100} step={0.5} value={rule.relationGain} disabled={disabled} onCommit={(relationGain) => set({ relationGain })} />}
          </Field>
        </>
      )
    case 'growth':
      return (
        <>
          <Field label="Applies to">{() => <ScopePicker value={rule.scope} model={model} disabled={disabled} onChange={(scope) => set({ scope })} />}</Field>
          <Field label="Requires" inline>{(id) => <Select id={id} value={rule.resourceId} options={res} disabled={disabled} onChange={(resourceId) => set({ resourceId })} />}</Field>
          <Field label="Surplus per 100" inline hint="Stock per 100 people needed to grow.">
            {(id) => <NumberInput id={id} min={0} max={1e6} value={rule.surplusPerCapita} disabled={disabled} onCommit={(surplusPerCapita) => set({ surplusPerCapita })} />}
          </Field>
          <Field label="Growth rate" inline hint="Fraction per step, e.g. 0.015 = 1.5%.">
            {(id) => <NumberInput id={id} min={0} max={1} step={0.005} value={rule.rate} disabled={disabled} onCommit={(rate) => set({ rate })} />}
          </Field>
        </>
      )
    case 'decay':
      return (
        <>
          <Field label="Applies to">{() => <ScopePicker value={rule.scope} model={model} disabled={disabled} onChange={(scope) => set({ scope })} />}</Field>
          <Field label="Resource" inline>{(id) => <Select id={id} value={rule.resourceId} options={res} disabled={disabled} onChange={(resourceId) => set({ resourceId })} />}</Field>
          <Field label="Rate" inline hint="Fraction lost per step (0–1).">
            {(id) => <NumberInput id={id} min={0} max={1} step={0.01} value={rule.rate} disabled={disabled} onCommit={(rate) => set({ rate })} />}
          </Field>
        </>
      )
    case 'drift':
      return (
        <>
          <Field label="Factions">
            {() => (
              <div className="check-list">
                <label className="check">
                  <input type="checkbox" checked={rule.factionIds === 'all'} disabled={disabled} onChange={(e) => set({ factionIds: e.target.checked ? 'all' : model.factions.map((f) => f.id) })} />
                  All factions
                </label>
                {rule.factionIds !== 'all' &&
                  model.factions.map((f) => {
                    const ids = rule.factionIds === 'all' ? [] : rule.factionIds
                    return (
                      <label key={f.id} className="check">
                        <input type="checkbox" checked={ids.includes(f.id)} disabled={disabled} onChange={(e) => set({ factionIds: e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id) })} />
                        {f.name}
                      </label>
                    )
                  })}
              </div>
            )}
          </Field>
          <Field label="Baseline" inline>{(id) => <NumberInput id={id} min={0} max={100} value={rule.target} disabled={disabled} onCommit={(target) => set({ target })} />}</Field>
          <Field label="Rate" inline hint="Fraction of the gap closed per step.">
            {(id) => <NumberInput id={id} min={0} max={1} step={0.01} value={rule.rate} disabled={disabled} onCommit={(rate) => set({ rate })} />}
          </Field>
        </>
      )
    case 'agency':
      return (
        <>
          <p className="note">Every faction weighs raiding, war, peace, alliances, aid, embargoes, reopening trade, restoring order and innovation using its personality (see each faction) blended with its current ruler.</p>
          <Field label="Hunger measured in" inline>{(id) => <Select id={id} value={rule.foodResourceId} options={res} disabled={disabled} onChange={(foodResourceId) => set({ foodResourceId })} />}</Field>
          <Field label="Innovation costs" inline>{(id) => <Select id={id} value={rule.investResourceId} options={res} disabled={disabled} onChange={(investResourceId) => set({ investResourceId })} />}</Field>
          <Field label="Activity" inline hint="Chance (0–1) that a faction acts in a given step.">
            {(id) => <NumberInput id={id} min={0} max={1} step={0.05} value={rule.activity} disabled={disabled} onCommit={(activity) => set({ activity })} />}
          </Field>
          <Field label="Temperament" inline hint="0–2. Scales raid size, repression and how much chance sways choices.">
            {(id) => <NumberInput id={id} min={0} max={2} step={0.1} value={rule.temperament} disabled={disabled} onCommit={(temperament) => set({ temperament })} />}
          </Field>
        </>
      )
    case 'warfare':
      return (
        <>
          <Field label="Armies use" inline>{(id) => <Select id={id} value={rule.armsResourceId} options={res} disabled={disabled} onChange={(armsResourceId) => set({ armsResourceId })} />}</Field>
          <Field label="Casualty rate" inline hint="0–0.2. Bloodiness of battles.">
            {(id) => <NumberInput id={id} min={0} max={0.2} step={0.01} value={rule.casualtyRate} disabled={disabled} onCommit={(casualtyRate) => set({ casualtyRate })} />}
          </Field>
          <Field label="Conquest ratio" inline hint="Strength advantage (after defence) needed to take a settlement.">
            {(id) => <NumberInput id={id} min={1} max={5} step={0.05} value={rule.conquestRatio} disabled={disabled} onCommit={(conquestRatio) => set({ conquestRatio })} />}
          </Field>
          <Field label="Exhaustion limit" inline hint="10–100. A side this weary accepts peace.">
            {(id) => <NumberInput id={id} min={10} max={100} value={rule.exhaustionLimit} disabled={disabled} onCommit={(exhaustionLimit) => set({ exhaustionLimit })} />}
          </Field>
        </>
      )
    case 'contagion':
      return (
        <>
          <Field label="Hunger measured in" inline>{(id) => <Select id={id} value={rule.foodResourceId} options={res} disabled={disabled} onChange={(foodResourceId) => set({ foodResourceId })} />}</Field>
          <Field label="Outbreak chance" inline hint="Base chance per settlement per step (0–0.2), raised by crowding and hunger.">
            {(id) => <NumberInput id={id} min={0} max={0.2} step={0.001} value={rule.outbreakChance} disabled={disabled} onCommit={(outbreakChance) => set({ outbreakChance })} />}
          </Field>
          <Field label="Spread chance" inline hint="Per busy route per step.">
            {(id) => <NumberInput id={id} min={0} max={1} step={0.05} value={rule.spreadChance} disabled={disabled} onCommit={(spreadChance) => set({ spreadChance })} />}
          </Field>
          <Field label="Mortality" inline hint="Share of people lost per step while infected.">
            {(id) => <NumberInput id={id} min={0} max={0.3} step={0.005} value={rule.mortality} disabled={disabled} onCommit={(mortality) => set({ mortality })} />}
          </Field>
          <Field label="Duration" inline>{(id) => <NumberInput id={id} min={1} max={50} suffix="steps" value={rule.duration} disabled={disabled} onCommit={(duration) => set({ duration: Math.round(duration) })} />}</Field>
        </>
      )
    case 'migration':
      return (
        <>
          <Field label="Prospects judged by" inline>{(id) => <Select id={id} value={rule.foodResourceId} options={res} disabled={disabled} onChange={(foodResourceId) => set({ foodResourceId })} />}</Field>
          <Field label="Rate" inline hint="0–0.2 share of a settlement that may leave per step.">
            {(id) => <NumberInput id={id} min={0} max={0.2} step={0.005} value={rule.rate} disabled={disabled} onCommit={(rate) => set({ rate })} />}
          </Field>
        </>
      )
    case 'fortune':
      return (
        <>
          <Field label="Harvests yield" inline>{(id) => <Select id={id} value={rule.foodResourceId} options={res} disabled={disabled} onChange={(foodResourceId) => set({ foodResourceId })} />}</Field>
          <Field label="Chance per step" inline>{(id) => <NumberInput id={id} min={0} max={1} step={0.05} value={rule.chance} disabled={disabled} onCommit={(chance) => set({ chance })} />}</Field>
          <Field label="Intensity" inline hint="0.5–2 magnitude multiplier.">
            {(id) => <NumberInput id={id} min={0.5} max={2} step={0.1} value={rule.intensity} disabled={disabled} onCommit={(intensity) => set({ intensity })} />}
          </Field>
        </>
      )
    case 'succession':
      return (
        <>
          <Field label="Steps per year" inline hint="How fast rulers age.">
            {(id) => <NumberInput id={id} min={1} max={12} value={rule.stepsPerYear} disabled={disabled} onCommit={(stepsPerYear) => set({ stepsPerYear: Math.round(stepsPerYear) })} />}
          </Field>
          <Field label="Succession crisis" inline hint="Up to this much stability is lost when a ruler changes.">
            {(id) => <NumberInput id={id} min={0} max={50} value={rule.crisisStability} disabled={disabled} onCommit={(crisisStability) => set({ crisisStability })} />}
          </Field>
        </>
      )
    case 'threshold':
      return (
        <>
          <Field label="Event label">{(id) => <TextInput id={id} value={rule.eventLabel} disabled={disabled} onCommit={(v) => set({ eventLabel: v.trim() || 'Threshold reached' })} />}</Field>
          <Field label="When">{() => <ConditionEditor value={rule.condition} model={model} disabled={disabled} onChange={(condition) => set({ condition })} />}</Field>
          <Field label="Then">{() => <EffectsEditor value={rule.effects} model={model} disabled={disabled} min={1} onChange={(effects) => set({ effects })} />}</Field>
          <Field label="Cooldown" inline hint="Steps before it can fire again.">
            {(id) => <NumberInput id={id} min={0} max={10000} value={rule.cooldown} disabled={disabled} onCommit={(cooldown) => set({ cooldown: Math.round(cooldown) })} />}
          </Field>
        </>
      )
  }
}

export function ruleTemplate(type: RuleType, m: WorldModel, id: string): Rule {
  const r = m.resources[0]?.id ?? ''
  const base = { id, enabled: true }
  switch (type) {
    case 'produce':
      return { ...base, type, name: 'New production', priority: 10, scope: { kind: 'all' }, resourceId: r, amount: 10, perCapita: false, variance: 0 }
    case 'consume':
      return { ...base, type, name: 'New consumption', priority: 30, scope: { kind: 'all' }, resourceId: r, amount: 5, perCapita: true, shortageStabilityDelta: -3, shortagePopulationLoss: 0 }
    case 'trade':
      return { ...base, type, name: 'New trade', priority: 20, routeIds: 'all', reserve: 0, relationGain: 0 }
    case 'growth':
      return { ...base, type, name: 'New growth', priority: 50, scope: { kind: 'all' }, resourceId: r, surplusPerCapita: 20, rate: 0.01 }
    case 'decay':
      return { ...base, type, name: 'New spoilage', priority: 40, scope: { kind: 'all' }, resourceId: r, rate: 0.02 }
    case 'drift':
      return { ...base, type, name: 'New stability drift', priority: 0, factionIds: 'all', target: 60, rate: 0.1 }
    case 'agency':
      return { ...base, type, name: 'Faction decisions', priority: 55, foodResourceId: r, investResourceId: m.resources[1]?.id ?? r, activity: 0.7, temperament: 1 }
    case 'warfare':
      return { ...base, type, name: 'Warfare', priority: 58, armsResourceId: m.resources[2]?.id ?? m.resources[1]?.id ?? r, casualtyRate: 0.06, conquestRatio: 1.35, exhaustionLimit: 75 }
    case 'contagion':
      return { ...base, type, name: 'Plague', priority: 46, foodResourceId: r, outbreakChance: 0.006, spreadChance: 0.3, mortality: 0.04, duration: 5 }
    case 'migration':
      return { ...base, type, name: 'Migration', priority: 45, foodResourceId: r, rate: 0.05 }
    case 'fortune':
      return { ...base, type, name: 'Fortune', priority: 5, foodResourceId: r, chance: 0.3, intensity: 1 }
    case 'succession':
      return { ...base, type, name: 'Rulers & succession', priority: 1, stepsPerYear: 1, crisisStability: 12 }
    case 'threshold':
      return { ...base, type, name: 'New threshold event', priority: 60, eventLabel: 'Something happens', cooldown: 5, condition: { metric: defaultMetric('stability', m), op: '<', value: 30 }, effects: [defaultEffect('adjustStability', m)] }
  }
}
