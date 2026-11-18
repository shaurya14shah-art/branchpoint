import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui'

/** Modal built on the native <dialog> element: focus trap, Esc to close, inert background. */
export function Dialog({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDialogElement>(null)
  // Only treat it as a backdrop click when the press also started on the backdrop; otherwise a
  // press inside and release outside (e.g. selecting text) would close the dialog.
  const pressedBackdrop = useRef(false)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
      // showModal focuses the first focusable (the close button); prefer the marked primary control.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      className="dialog"
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === ref.current
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedBackdrop.current) onClose()
        pressedBackdrop.current = false
      }}
    >
      {open && (
        <div className="dialog-inner">
          <header className="dialog-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <X size={15} />
            </button>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="prose">{body}</div>
    </Dialog>
  )
}

export function PromptDialog({ open, title, label, initial, confirmLabel, onSubmit, onClose, hint }: { open: boolean; title: string; label: string; initial: string; confirmLabel: string; onSubmit: (v: string) => void; onClose: () => void; hint?: ReactNode }) {
  const [value, setValue] = useState(initial)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setValue(initial)
  }
  const submit = () => {
    if (!value.trim()) return
    onSubmit(value.trim())
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          className="input"
          data-autofocus
          onFocus={(e) => e.target.select()}
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </label>
      {hint && <div className="field-hint">{hint}</div>}
    </Dialog>
  )
}
