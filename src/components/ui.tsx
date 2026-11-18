import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'default' | 'primary' | 'ghost' | 'danger'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }>(
  function Button({ variant = 'default', size = 'md', icon, className = '', children, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
        {icon}
        {children && <span>{children}</span>}
      </button>
    )
  },
)

/** Icon-only button. `label` is both the accessible name and the tooltip. */
export function IconButton({ label, shortcut, icon, active, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; icon: ReactNode; active?: boolean }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} data-tip={shortcut ? `${label}  ${shortcut}` : label} className={`icon-btn ${active ? 'is-active' : ''} ${className}`} {...rest}>
      {icon}
    </button>
  )
}

export function Field({ label, hint, children, inline }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; inline?: boolean }) {
  const id = useId()
  return (
    <div className={`field ${inline ? 'field-inline' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-control">{children(id)}</div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

/** Text input that commits on blur / Enter, so typing does not create a model revision per key. */
export function TextInput({ value, onCommit, id, placeholder, disabled, multiline, maxLength = 80 }: { value: string; onCommit: (v: string) => void; id?: string; placeholder?: string; disabled?: boolean; multiline?: boolean; maxLength?: number }) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // Adopt external changes (e.g. undo, branch switch) — React's "adjust state on prop change" pattern.
    setPrev(value)
    setDraft(value)
  }
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  const common = {
    id,
    value: draft,
    placeholder,
    disabled,
    maxLength,
    onBlur: commit,
    className: 'input',
  }
  return multiline ? (
    <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(value)
      }}
    />
  )
}

export function NumberInput({ value, onCommit, id, min, max, step = 1, disabled, suffix }: { value: number; onCommit: (v: number) => void; id?: string; min?: number; max?: number; step?: number; disabled?: boolean; suffix?: string }) {
  const [draft, setDraft] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(String(value))
    setInvalid(false)
  }
  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (n !== value) onCommit(n)
  }
  return (
    <div className={`num-field ${invalid ? 'is-invalid' : ''}`}>
      <input
        id={id}
        className="input input-num"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(String(value))
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const n = Number(draft) + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)
            const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(n * 1000) / 1000))
            setDraft(String(clamped))
            onCommit(clamped)
          }
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
      {invalid && <span className="num-error" role="alert">{min !== undefined && max !== undefined ? `${min}–${max}` : 'invalid'}</span>}
    </div>
  )
}

export function Select<T extends string>({ value, options, onChange, id, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id?: string; disabled?: boolean }) {
  return (
    <select id={id} className="input select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  )
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'crit' | 'notable'; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  )
}

export function Swatch({ color, size = 8, ring }: { color: string; size?: number; ring?: boolean }) {
  return <span className={`swatch ${ring ? 'swatch-ring' : ''}`} style={{ background: ring ? 'transparent' : color, borderColor: color, width: size, height: size }} aria-hidden />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Section({ title, actions, children, dense }: { title: ReactNode; actions?: ReactNode; children: ReactNode; dense?: boolean }) {
  return (
    <section className={`section ${dense ? 'section-dense' : ''}`}>
      <header className="section-head">
        <h3>{title}</h3>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      <div className="section-body">{children}</div>
    </section>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} title={o.title} className={o.value === value ? 'is-active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
