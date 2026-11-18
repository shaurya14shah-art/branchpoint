import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { WorldModel } from '../../engine/model'
import type { WorldView } from '../../state/useWorld'
import { appStore } from '../../state/store'
import { Button } from '../../components/ui'
import { ConfirmDialog } from '../../components/Dialog'

export function DeleteEntity({ w, what, note, fn }: { w: WorldView; what: string; note: string; fn: (m: WorldModel) => WorldModel }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setOpen(true)}>
        Delete {what}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title={`Delete ${what}?`}
        confirmLabel="Delete"
        body={<p>{w.head === 0 ? 'It is removed from the starting model of this branch.' : `It is removed on “${w.branch.name}” from step ${w.head} onward. History already simulated is kept.`}</p>}
        onConfirm={() => {
          if (appStore.getState().updateModel(fn, note)) appStore.getState().select(null)
        }}
      />
    </>
  )
}
