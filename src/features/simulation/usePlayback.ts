import { useEffect } from 'react'
import { appStore, useApp } from '../../state/store'

/** Drives continuous simulation while `playing`. One step per tick; stops on errors. */
export function usePlayback() {
  const playing = useApp((s) => s.playing)
  const speed = useApp((s) => s.speed)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => appStore.getState().step(1), 1000 / speed)
    return () => clearInterval(t)
  }, [playing, speed])
}
