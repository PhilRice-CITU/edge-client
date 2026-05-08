import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Settings, ArrowRight, ArrowLeft, X, User, Tag, Layers } from 'lucide-react'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { useCreateSession } from '@renderer/hooks/useSession'
import { StatusBadge } from '@renderer/components/molecules/StatusBadge'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { AnimatedLogo } from '@renderer/components/atoms/AnimatedLogo'

const OPERATOR_KEY = 'lastOperatorName'
const WIZARD_DRAFT_KEY = 'wizardDraft'

interface WizardDraft {
  operatorName: string
  sessionName: string
  riceVarietyRaw: string
}

function formatRiceVariety(name: string): string {
  const now = new Date()
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${name.trim()}_${y}${mo}${d}_${h}${mi}${s}`
}

type WizardState = 'closed' | 'step1' | 'step2'

export function HomePage() {
  const navigate = useNavigate()
  const { data: status } = useDeviceStatus()
  const createSession = useCreateSession()

  const [wizard, setWizard] = useState<WizardState>('closed')
  const [sliding, setSliding] = useState(false)
  const [slideDir, setSlideDir] = useState<'forward' | 'back'>('forward')

  const [operatorName, setOperatorName] = useState(() => localStorage.getItem(OPERATOR_KEY) ?? '')
  const [sessionName, setSessionName] = useState('')
  const [riceVariety, setRiceVariety] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateReady, setUpdateReady] = useState(false)

  const operatorRef = useRef<HTMLInputElement>(null)
  const sessionNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_DRAFT_KEY)
    if (raw) {
      sessionStorage.removeItem(WIZARD_DRAFT_KEY)
      try {
        const draft: WizardDraft = JSON.parse(raw)
        setOperatorName(draft.operatorName ?? '')
        setSessionName(draft.sessionName ?? '')
        setRiceVariety(draft.riceVarietyRaw ?? '')
        setWizard('step2')
      } catch {
        // corrupt draft — ignore
      }
    }
  }, [])

  useEffect(() => {
    const offAvailable = window.api.onUpdateAvailable((v) => setUpdateVersion(v))
    const offDownloaded = window.api.onUpdateDownloaded((v) => {
      setUpdateVersion(v)
      setUpdateReady(true)
    })
    return () => { offAvailable(); offDownloaded() }
  }, [])

  useEffect(() => {
    if (wizard === 'step1') {
      setTimeout(() => operatorRef.current?.focus(), 350)
    } else if (wizard === 'step2') {
      setTimeout(() => sessionNameRef.current?.focus(), 350)
    }
  }, [wizard])

  const openWizard = () => {
    setApiError(null)
    setSessionName('')
    setRiceVariety('')
    setWizard('step1')
  }

  const goToStep2 = () => {
    setSlideDir('forward')
    setSliding(true)
    setTimeout(() => {
      setWizard('step2')
      setSliding(false)
    }, 200)
  }

  const goToStep1 = () => {
    setSlideDir('back')
    setSliding(true)
    setTimeout(() => {
      setWizard('step1')
      setSliding(false)
    }, 200)
  }

  const closeWizard = () => {
    setWizard('closed')
    setApiError(null)
  }

  const handleStart = async () => {
    if (creating || !sessionName.trim()) return
    setCreating(true)
    setApiError(null)
    const trimmedOperator = operatorName.trim()
    if (trimmedOperator) localStorage.setItem(OPERATOR_KEY, trimmedOperator)
    const variety = riceVariety.trim() ? formatRiceVariety(riceVariety.trim()) : null
    try {
      const session = await createSession.mutateAsync({
        mode: 'grade',
        operator_name: trimmedOperator,
        session_name: sessionName.trim(),
        rice_variety: variety,
      })
      const draft: WizardDraft = {
        operatorName: trimmedOperator,
        sessionName: sessionName.trim(),
        riceVarietyRaw: riceVariety.trim(),
      }
      sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft))
      navigate({ to: '/session/$sessionId', params: { sessionId: session.id } })
    } catch (err) {
      console.error('[handleStart] createSession failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setApiError(msg || 'Unknown error')
    } finally {
      setCreating(false)
    }
  }

  const wizardVisible = wizard !== 'closed'

  const slideStyle: React.CSSProperties = sliding
    ? {
        transform: slideDir === 'forward' ? 'translateX(-40px)' : 'translateX(40px)',
        opacity: 0,
        transition: 'transform 200ms ease, opacity 200ms ease',
      }
    : {
        transform: 'translateX(0)',
        opacity: 1,
        transition: 'transform 200ms ease, opacity 200ms ease',
      }

  return (
    <div className="relative flex h-full flex-col items-center gap-10 p-6 overflow-hidden">
      {/* ── Normal home content ─────────────────────────────────── */}
      <div className="flex w-full p-12 items-center justify-between">
        <div className="flex items-center gap-2">
          <AnimatedLogo size={28} animate={false} />
          <h1 className="text-xl font-semibold text-foreground">Hum.ai</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <button
            onClick={() => navigate({ to: '/settings' })}
            aria-label="Settings"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center w-full max-w-110">
        <h2 className="text-3xl font-bold text-foreground">Select Mode</h2>
        <p className="text-muted-foreground">Choose how to use this device</p>
      </div>

      <div className="flex w-full max-w-110 flex-col gap-4">
        {updateVersion && (
          <div className="rounded-xl bg-primary/10 px-4 py-3 text-center text-sm text-primary">
            {updateReady
              ? `v${updateVersion} ready — restarts on next quit`
              : `v${updateVersion} downloading…`}
            {updateReady && (
              <button
                onClick={() => window.api.installUpdate()}
                className="ml-2 underline underline-offset-2"
              >
                Restart now
              </button>
            )}
          </div>
        )}
        <KioskButton onClick={openWizard} variant="primary">
          Grade Rice
        </KioskButton>
        {import.meta.env.VITE_EDGE_MODE !== 'production' && (
          <KioskButton onClick={() => navigate({ to: '/training' })} variant="secondary">
            Training Mode
          </KioskButton>
        )}
      </div>

      {/* ── Wizard overlay ──────────────────────────────────────── */}
      <div
        className={[
          'absolute inset-0 z-50 flex flex-col bg-background',
          'transition-all duration-300 ease-out',
          wizardVisible
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none translate-y-4',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          {wizard === 'step2' ? (
            <button
              onClick={goToStep1}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
              Whose grading?
            </button>
          ) : (
            <button
              onClick={closeWizard}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
              Home
            </button>
          )}
          <StepDots step={wizard === 'step1' ? 1 : 2} />
          {wizard === 'step2' ? (
            <button
              onClick={closeWizard}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Back to Home"
            >
              <X size={18} />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        {/* Step content */}
        <div className="flex flex-1 flex-col items-center justify-center pb-6" style={slideStyle}>
          <div className="w-full max-w-110 px-8">
            {wizard === 'step1' ? (
              <Step1
                operatorName={operatorName}
                setOperatorName={setOperatorName}
                inputRef={operatorRef}
                onNext={goToStep2}
              />
            ) : (
              <Step2
                sessionName={sessionName}
                setSessionName={setSessionName}
                riceVariety={riceVariety}
                setRiceVariety={setRiceVariety}
                inputRef={sessionNameRef}
                apiError={apiError}
                creating={creating}
                onStart={handleStart}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={[
          'h-2 rounded-full transition-all duration-300',
          step === 1 ? 'w-6 bg-primary' : 'w-2 bg-border',
        ].join(' ')}
      />
      <div
        className={[
          'h-2 rounded-full transition-all duration-300',
          step === 2 ? 'w-6 bg-primary' : 'w-2 bg-border',
        ].join(' ')}
      />
    </div>
  )
}

function Step1({
  operatorName,
  setOperatorName,
  inputRef,
  onNext,
}: {
  operatorName: string
  setOperatorName: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <User size={14} />
          <span className="text-xs font-medium uppercase tracking-wider">Step 1 of 2</span>
        </div>
        <h2 className="text-3xl font-bold text-foreground leading-tight">
          Who's grading?
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter your name to tag this session. Leave blank to skip.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="text"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onNext()}
          placeholder="Operator name"
          className="h-14 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <KioskButton onClick={onNext} variant="primary">
        <span className="flex items-center justify-center gap-2">
          Continue
          <ArrowRight size={18} />
        </span>
      </KioskButton>
    </div>
  )
}

function Step2({
  sessionName,
  setSessionName,
  riceVariety,
  setRiceVariety,
  inputRef,
  apiError,
  creating,
  onStart,
}: {
  sessionName: string
  setSessionName: (v: string) => void
  riceVariety: string
  setRiceVariety: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  apiError: string | null
  creating: boolean
  onStart: () => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Layers size={14} />
          <span className="text-xs font-medium uppercase tracking-wider">Step 2 of 2</span>
        </div>
        <h2 className="text-3xl font-bold text-foreground leading-tight">
          Session details
        </h2>
        <p className="text-sm text-muted-foreground">
          Name this grading session and optionally specify the rice variety.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Tag size={12} />
            Session name
            <span className="text-primary">*</span>
          </label>
          <input
            ref={inputRef}
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sessionName.trim() && onStart()}
            placeholder="e.g. Batch A, Trial Run 1"
            className="h-14 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Tag size={12} />
            Rice variety
            <span className="text-muted-foreground/60 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={riceVariety}
            onChange={(e) => setRiceVariety(e.target.value)}
            placeholder="e.g. Sinandomeng, NSIC Rc222"
            className="h-14 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {riceVariety.trim() && (
            <p className="text-xs text-muted-foreground pl-1">
              Stored as{' '}
              <span className="font-mono text-foreground">
                {riceVariety.trim()}_YYYYMMDD_HHmmss
              </span>
            </p>
          )}
        </div>

        {apiError && (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiError}
          </p>
        )}
      </div>

      <KioskButton onClick={onStart} disabled={!sessionName.trim() || creating} variant="primary">
        <span className="flex items-center justify-center gap-2">
          {creating ? 'Starting…' : 'Start Grading'}
          {!creating && <ArrowRight size={18} />}
        </span>
      </KioskButton>
    </div>
  )
}
