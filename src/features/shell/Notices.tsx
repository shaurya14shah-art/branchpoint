import { X } from 'lucide-react'
import { appStore, useApp } from '../../state/store'

export function Notices() {
  const notices = useApp((s) => s.notices)
  return (
    <div className="notices" role="region" aria-label="Notifications" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.tone}`} role={n.tone === 'error' ? 'alert' : 'status'}>
          <div className="notice-body">
            <div>{n.message}</div>
            {n.detail && <pre className="notice-detail">{n.detail}</pre>}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => appStore.getState().dismiss(n.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
