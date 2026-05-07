import { useEffect, useState } from 'react'

type Phase = 'idle' | 'available' | 'downloaded'

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState('')

  useEffect(() => {
    const cleanupAvailable = window.api.onUpdateAvailable((v) => {
      setPhase('available')
      setVersion(v)
    })
    const cleanupDownloaded = window.api.onUpdateDownloaded((v) => {
      setPhase('downloaded')
      setVersion(v)
    })
    return () => {
      cleanupAvailable()
      cleanupDownloaded()
    }
  }, [])

  if (phase === 'idle') return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between bg-blue-600 px-6 py-3 text-white shadow-lg">
      <span className="text-sm font-medium">
        {phase === 'available'
          ? `Downloading update v${version}…`
          : `Update v${version} ready`}
      </span>
      {phase === 'downloaded' && (
        <button
          onClick={() => window.api.installUpdate()}
          className="rounded bg-white px-4 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
        >
          Restart to Update
        </button>
      )}
    </div>
  )
}
