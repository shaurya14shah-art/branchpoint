import { useState } from 'react'
import { Map as MapIcon, Plus, Sparkles, X } from 'lucide-react'
import { blankWorld, FACTION_COLORS, RESOURCE_PRESETS } from '../../examples/blank'
import { SHATTERED_ISLES } from '../../examples/shatteredIsles'
import { validateModel } from '../../engine/validate'
import { appStore } from '../../state/store'
import { Dialog } from '../../components/Dialog'
import { Button, Field, NumberInput, TextInput } from '../../components/ui'

type Template = 'example' | 'blank' | 'ai'

/** Three-step creation flow: basics → starting conditions → review. */
export function NewWorldDialog({ open, onClose, onAi, aiAvailable }: { open: boolean; onClose: () => void; onAi: () => void; aiAvailable: boolean }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const [template, setTemplate] = useState<Template>('blank')
  const [name, setName] = useState('Untitled world')
  const [description, setDescription] = useState('')
  const [factions, setFactions] = useState([
    { name: 'The Northmarch', color: FACTION_COLORS[0]! },
    { name: 'The River Compact', color: FACTION_COLORS[1]! },
  ])
  const [resources, setResources] = useState(RESOURCE_PRESETS.slice(0, 2).map((r) => r.name))
  const [population, setPopulation] = useState(500)
  const [food, setFood] = useState(300)
  const [seed, setSeed] = useState(1)

  const close = () => {
    setStage(0)
    onClose()
  }
  const input = {
    name: name.trim() || 'Untitled world',
    description,
    seed,
    factions: factions.filter((f) => f.name.trim()),
    resources: RESOURCE_PRESETS.filter((r) => resources.includes(r.name)),
    population,
    startingFood: food,
  }
  const generated = blankWorld(input)
  const check = validateModel(generated.model)

  const create = async () => {
    if (template === 'example') await appStore.getState().openExample()
    else await appStore.getState().createProject(generated.model, generated.layout)
    close()
  }

  const footer =
    stage === 0 ? (
      <>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        {template === 'example' ? (
          <Button variant="primary" onClick={create}>
            Open The Shattered Isles
          </Button>
        ) : template === 'ai' ? (
          <Button
            variant="primary"
            onClick={() => {
              close()
              onAi()
            }}
          >
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStage(1)} disabled={!name.trim()}>
            Next: starting conditions
          </Button>
        )}
      </>
    ) : stage === 1 ? (
      <>
        <Button variant="ghost" onClick={() => setStage(0)}>
          Back
        </Button>
        <Button variant="primary" onClick={() => setStage(2)} disabled={input.factions.length === 0 || input.resources.length === 0}>
          Review
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setStage(1)}>
          Back
        </Button>
        <Button variant="primary" onClick={create} disabled={!check.ok}>
          Create world
        </Button>
      </>
    )

  return (
    <Dialog open={open} onClose={close} title={['New world', 'Starting conditions', 'Review'][stage]} footer={footer} width={600}>
      <ol className="stepper" aria-label="Progress">
        {['Basics', 'Starting conditions', 'Review'].map((s, i) => (
          <li key={s} className={i === stage ? 'is-current' : i < stage ? 'is-done' : ''}>
            {s}
          </li>
        ))}
      </ol>
      {stage === 0 && (
        <div className="stack-4">
          <div className="template-grid" role="radiogroup" aria-label="Starting point">
            <button type="button" role="radio" aria-checked={template === 'blank'} className={`template ${template === 'blank' ? 'is-on' : ''}`} onClick={() => setTemplate('blank')}>
              <Plus size={16} />
              <strong>Blank economy</strong>
              <span>Your factions and resources, a starter rule set.</span>
            </button>
            <button type="button" role="radio" aria-checked={template === 'example'} className={`template ${template === 'example' ? 'is-on' : ''}`} onClick={() => setTemplate('example')}>
              <MapIcon size={16} />
              <strong>{SHATTERED_ISLES.name}</strong>
              <span>3 factions, 8 settlements, droughts and raids.</span>
            </button>
            <button type="button" role="radio" aria-checked={template === 'ai'} disabled={!aiAvailable} title={aiAvailable ? undefined : 'Set ANTHROPIC_API_KEY on the server to enable'} className={`template ${template === 'ai' ? 'is-on' : ''}`} onClick={() => setTemplate('ai')}>
              <Sparkles size={16} />
              <strong>Describe it</strong>
              <span>{aiAvailable ? 'Draft a model from prose, then review it.' : 'AI drafting is not configured.'}</span>
            </button>
          </div>
          {template === 'blank' && (
            <>
              <Field label="Simulation type" hint="Factions hold settlements that produce, trade and consume resources. More types can be added through the rule registry.">
                {() => <div className="input static">Faction economy</div>}
              </Field>
              <Field label="World name">{(id) => <TextInput id={id} value={name} onCommit={setName} />}</Field>
              <Field label="Description">{(id) => <TextInput id={id} multiline maxLength={2000} value={description} onCommit={setDescription} placeholder="What is this world about?" />}</Field>
            </>
          )}
        </div>
      )}
      {stage === 1 && (
        <div className="stack-4">
          <Field label="Factions" hint="Each faction starts with one settlement.">
            {() => (
              <div className="stack-2">
                {factions.map((f, i) => (
                  <div key={i} className="row-2">
                    <input type="color" className="color-input" value={f.color} aria-label={`${f.name} colour`} onChange={(e) => setFactions(factions.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
                    <input className="input" value={f.name} maxLength={60} aria-label={`Faction ${i + 1} name`} onChange={(e) => setFactions(factions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} disabled={factions.length <= 1} onClick={() => setFactions(factions.filter((_, j) => j !== i))}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus size={13} />} disabled={factions.length >= 6} onClick={() => setFactions([...factions, { name: `Faction ${factions.length + 1}`, color: FACTION_COLORS[factions.length % FACTION_COLORS.length]! }])}>
                  Add faction
                </Button>
              </div>
            )}
          </Field>
          <Field label="Resources" hint="The first selected resource is the staple everyone eats.">
            {() => (
              <div className="chip-row">
                {RESOURCE_PRESETS.map((r) => (
                  <button key={r.name} type="button" className={`chip ${resources.includes(r.name) ? 'is-on' : ''}`} aria-pressed={resources.includes(r.name)} onClick={() => setResources(resources.includes(r.name) ? resources.filter((x) => x !== r.name) : [...resources, r.name])}>
                    <span className="legend-bar" style={{ background: r.color }} />
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <div className="row-3">
            <Field label="Population per settlement">{(id) => <NumberInput id={id} min={1} max={1_000_000} value={population} onCommit={setPopulation} />}</Field>
            <Field label="Starting staple stock">{(id) => <NumberInput id={id} min={0} max={1_000_000} value={food} onCommit={setFood} />}</Field>
            <Field label="Random seed">{(id) => <NumberInput id={id} min={0} max={4294967295} value={seed} onCommit={(v) => setSeed(Math.round(v))} />}</Field>
          </div>
        </div>
      )}
      {stage === 2 && (
        <div className="stack-4">
          <p className="prose">
            <strong>{input.name}</strong> — {generated.model.factions.length} factions, {generated.model.locations.length} settlements, {generated.model.resources.length} resources and {generated.model.rules.length} starter rules:
          </p>
          <ul className="plain-list">
            {generated.model.rules.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
          {check.issues.map((i, k) => (
            <p key={k} className={`note ${i.severity === 'error' ? 'crit' : 'warn'}`}>
              {i.path}: {i.message}
            </p>
          ))}
          <p className="muted small">Next: add routes with the connect tool (R), settlements with (L), and shocks under Rules → Scheduled events.</p>
        </div>
      )}
    </Dialog>
  )
}
