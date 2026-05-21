import { useMutation, useQuery } from '@tanstack/react-query'
import { apiUrl } from '@renderer/lib/api'
import type { Region } from '@renderer/types/session'

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown }
  if (typeof err.detail === 'string') return err.detail
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((e) =>
        e && typeof e === 'object' && 'msg' in e
          ? `${(e as { loc?: unknown[] }).loc?.slice(-1)[0] ?? 'request'}: ${String((e as { msg: unknown }).msg)}`
          : String(e),
      )
      .join('; ')
  }
  if (typeof err.error === 'string') return err.error
  return fallback
}

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
  return useMutation<RegisterResult, Error, { region_code: string }>({
    mutationFn: async ({ region_code }) => {
      const res = await fetch(apiUrl('/devices/provision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code }),
      })
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res, 'Registration failed'))
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
        throw new Error(await parseErrorMessage(res, 'Claim failed'))
      }
      const data = (await res.json()) as ClaimResult
      await window.api.saveConfig({
        DEVICE_ID: data.device_id,
        DEVICE_DISPLAY_NAME: data.display_name,
      })
      return data
    },
  })
}
