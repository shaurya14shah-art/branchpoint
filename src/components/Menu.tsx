import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}

/** Small dropdown menu with keyboard navigation (↑/↓/Enter/Esc). */
export function Menu({ trigger, items, align = 'left', label }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode; items: (MenuItem | 'separator')[]; align?: 'left' | 'right'; label: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const onKey = (e: React.KeyboardEvent) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[(i + 1) % buttons.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="menu-root" ref={root}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div className={`menu menu-${align}`} role="menu" aria-label={label} ref={list} onKeyDown={onKey}>
          {items.map((it, i) =>
            it === 'separator' ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={`menu-item ${it.danger ? 'is-danger' : ''}`}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
              >
                <span className="menu-icon">{it.icon}</span>
                <span className="menu-label">{it.label}</span>
                {it.hint && <span className="menu-hint">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
