import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { AlertCircle, ArrowLeft, CheckCircle, ChevronDown, Loader2 } from 'lucide-react'
import { AnimatedLogo } from '@renderer/components/atoms/AnimatedLogo'
import { KioskButton } from '@renderer/components/molecules/KioskButton'
import { useRegions, useRegisterDevice, useClaimDevice } from '@renderer/hooks/useProvision'
import { cn } from '@renderer/lib/utils'

type View = 'pick-region' | 'claim' | 'registered'

interface RegistrationResult {
  device_id: string
  display_name: string
  qr_url: string
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-border bg-card/90 p-8 shadow-xl backdrop-blur-sm">
        {children}
      </div>
    </div>
  )
}

export function SetupPage() {
  const navigate = useNavigate()
  const { data: regions, isLoading, isError, refetch: refetchRegions } = useRegions()
  const registerDevice = useRegisterDevice()
  const claimDevice = useClaimDevice()

  const [view, setView] = useState<View>('pick-region')
  const [claimInput, setClaimInput] = useState('')
  const [result, setResult] = useState<RegistrationResult | null>(null)
  const [claimError, setClaimError] = useState('')

  const handleRegister = (region_code: string) => {
    registerDevice.mutate(
      { region_code },
      {
        onSuccess: (data) => {
          setResult(data)
          setView('registered')
        },
      },
    )
  }

  const handleClaim = () => {
    const trimmed = claimInput.trim()
    if (!trimmed) return
    setClaimError('')
    claimDevice.mutate(
      { device_id: trimmed },
      {
        onSuccess: (data) => {
          setResult({ device_id: trimmed, display_name: data.display_name, qr_url: '' })
          setView('registered')
        },
        onError: (err) => setClaimError(err.message),
      },
    )
  }

  if (view === 'registered' && result) {
    return (
      <CardShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-primary/10 p-3">
            <CheckCircle size={40} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Device Ready</h1>
          <p className="text-base font-medium text-muted-foreground">{result.display_name}</p>
        </div>

        {result.qr_url ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-md">
              <QRCodeSVG value={result.qr_url} size={180} />
            </div>
            <p className="text-xs text-muted-foreground">Scan to view in dashboard</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Device ID</p>
            <p className="mt-1 font-mono text-xs break-all text-foreground">{result.device_id}</p>
          </div>
        )}

        <KioskButton onClick={() => navigate({ to: '/home' })} variant="primary">
          Start Using →
        </KioskButton>
      </CardShell>
    )
  }

  if (view === 'claim') {
    return (
      <CardShell>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              setView('pick-region')
              setClaimError('')
            }}
            className="-ml-1 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Claim Existing Device</h1>
          <p className="text-sm text-muted-foreground">
            Enter the device ID shown on the original QR screen.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            className="w-full rounded-xl border border-border bg-input px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="3f2504e0-4f89-11d3-9a0c-0305e82c3301"
            value={claimInput}
            onChange={(e) => setClaimInput(e.target.value)}
          />
          {claimError && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{claimError}</span>
            </div>
          )}
        </div>

        <KioskButton
          onClick={handleClaim}
          disabled={claimDevice.isPending || !claimInput.trim()}
          variant="primary"
        >
          {claimDevice.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Claiming…
            </span>
          ) : (
            'Claim Device'
          )}
        </KioskButton>
      </CardShell>
    )
  }

  return (
    <CardShell>
      <div className="flex flex-col items-center gap-3 text-center">
        <AnimatedLogo size={48} animate={false} />
        <h1 className="text-2xl font-bold text-foreground">Select Your Region</h1>
        <p className="text-sm text-muted-foreground">
          This device will be registered to the selected region.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 py-6 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading regions…</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>Could not reach server. Check API_BASE_URL in .env.</span>
            </div>
            <button
              onClick={() => void refetchRegions()}
              className="text-xs font-medium text-destructive underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {regions && regions.length > 0 && (
          <div className="relative">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleRegister(e.target.value)
              }}
              disabled={registerDevice.isPending}
              className={cn(
                'w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 pr-10 text-sm font-medium text-foreground transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary',
                registerDevice.isPending && 'cursor-not-allowed opacity-50',
              )}
            >
              <option value="" disabled>
                Select a region…
              </option>
              {regions.map((region) => (
                <option key={region.id} value={region.code}>
                  {region.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {registerDevice.isPending ? (
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              ) : (
                <ChevronDown size={16} className="text-muted-foreground" />
              )}
            </div>
          </div>
        )}

        {registerDevice.isError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{registerDevice.error?.message ?? 'Registration failed. Try again.'}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => setView('claim')}
        className="text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Claim an existing device →
      </button>
    </CardShell>
  )
}
