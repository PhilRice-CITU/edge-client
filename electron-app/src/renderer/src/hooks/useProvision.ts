import { useMutation, useQuery } from '@tanstack/react-query'
import { apiUrl } from '@renderer/lib/api'
import type { Region } from '@renderer/types/session'

interface RegisterResult {
  device_id: string
  display_name: string
  device_secret: string
  qr_url: string
}

interface ClaimResult {
  device_id: string
  display_name: string
}

export function useRegions() {
  return useQuery<Region[]>({
    queryKey: ['setup-regions'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/devices/regions'))
      if (!res.ok) throw new Error('Failed to fetch regions')
      return res.json() as Promise<Region[]>
    },
    staleTime: 60_000,
  })
}

export function useRegisterDevice() {
  return useMutation<RegisterResult, Error, { region_code: string; provision_token: string }>({
    mutationFn: async ({ region_code, provision_token }) => {
      const res = await fetch(apiUrl('/devices/provision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code, provision_token }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
        throw new Error(err.detail ?? err.error ?? 'Registration failed')
      }
      const data = (await res.json()) as RegisterResult
      // Persist device identity (including the new secret) to .env
      await window.api.saveConfig({
        DEVICE_ID: data.device_id,
        DEVICE_SECRET: data.device_secret,
        DEVICE_DISPLAY_NAME: data.display_name,
        DEVICE_QR_URL: data.qr_url,
      })
      return data
    },
  })
}

export function useClaimDevice() {
  return useMutation<ClaimResult, Error, { device_id: string }>({
    mutationFn: async ({ device_id }) => {
      const res = await fetch(apiUrl('/devices/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
        throw new Error(err.detail ?? err.error ?? 'Claim failed')
      }
      return res.json() as Promise<ClaimResult>
    },
  })
}
