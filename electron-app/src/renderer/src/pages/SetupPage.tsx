import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle, ChevronRight, Loader2 } from 'lucide-react'
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

export function SetupPage() {
  const navigate = useNavigate()
  const { data: regions, isLoading, isError, refetch: refetchRegions } = useRegions()
  const registerDevice = useRegisterDevice()
  const claimDevice = useClaimDevice()

  const [view, setView] = useState<View>('pick-region')
  const [claimInput, setClaimInput] = useState('')
  const [provisionToken, setProvisionToken] = useState('')
  const [result, setResult] = useState<RegistrationResult | null>(null)
  const [claimError, setClaimError] = useState('')

  const handleRegister = (region_code: string) => {
    if (!provisionToken.trim()) return
    registerDevice.mutate(
      { region_code, provision_token: provisionToken.trim() },
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
      <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle size={48} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Device Ready</h1>
          <p className="text-lg font-semibold text-muted-foreground">{result.display_name}</p>
        </div>
        {result.qr_url ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4 shadow">
              <QRCodeSVG value={result.qr_url} size={180} />
            </div>
            <p className="text-sm text-muted-foreground">Scan to view in dashboard</p>
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            ID: {result.device_id}
          </p>
        )}
        <KioskButton onClick={() => navigate({ to: '/home' })} variant="primary">
          Start Using →
        </KioskButton>
      </div>
    )
  }

  if (view === 'claim') {
    return (
      <div className="flex h-full flex-col justify-between p-8">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              setView('pick-region')
              setClaimError('')
            }}
            className="self-start text-sm text-muted-foreground underline underline-offset-2"
          >
            ← Back
          </button>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Claim Existing Device</h1>
          <p className="text-sm text-muted-foreground">
            Enter the device ID shown on the original QR screen or paste the UUID.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <input
            className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. 3f2504e0-4f89-11d3-9a0c-0305e82c3301"
            value={claimInput}
            onChange={(e) => setClaimInput(e.target.value)}
          />
          {claimError && (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
              {claimError}
            </p>
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
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-between p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <AnimatedLogo size={48} animate={false} />
        <h1 className="text-2xl font-bold text-foreground">Select Your Region</h1>
        <p className="text-sm text-muted-foreground">
          This device will be registered to the selected region.
        </p>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto py-4">
        <input
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Provision token (required)"
          type="password"
          value={provisionToken}
          onChange={(e) => setProvisionToken(e.target.value)}
        />
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading regions…</span>
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center gap-2">
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
              Could not reach server. Check API_BASE_URL in .env and try again.
            </p>
            <button
              onClick={() => void refetchRegions()}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
        {regions?.map((region) => (
          <button
            key={region.id}
            onClick={() => handleRegister(region.code)}
            disabled={registerDevice.isPending || !provisionToken.trim()}
            className={cn(
              'flex w-full items-center justify-between rounded-xl border border-border bg-card px-5 py-4 text-left text-foreground transition-colors hover:bg-accent',
              (registerDevice.isPending || !provisionToken.trim()) && 'cursor-not-allowed opacity-50',
            )}
          >
            <span className="text-base font-medium">{region.name}</span>
            {registerDevice.isPending ? (
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight size={18} className="text-muted-foreground" />
            )}
          </button>
        ))}
        {registerDevice.isError && (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            {registerDevice.error?.message ?? 'Registration failed. Try again.'}
          </p>
        )}
      </div>

      <button
        onClick={() => setView('claim')}
        className="text-sm text-muted-foreground underline underline-offset-2"
      >
        Claim an existing device →
      </button>
    </div>
  )
}
