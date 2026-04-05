import { useMutation, useQuery } from '@tanstack/react-query'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import type { Region } from '@renderer/types/session'

interface RegisterResult {
  device_id: string
  display_name: string
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
      const res = await fetch(`${FLASK_BASE_URL}/setup/regions`)
      if (!res.ok) throw new Error('Failed to fetch regions')
      return res.json() as Promise<Region[]>
    },
    staleTime: 60_000,
  })
}

export function useRegisterDevice() {
  return useMutation<RegisterResult, Error, { region_code: string }>({
    mutationFn: async ({ region_code }) => {
      const res = await fetch(`${FLASK_BASE_URL}/setup/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Registration failed')
      }
      return res.json() as Promise<RegisterResult>
    },
  })
}

export function useClaimDevice() {
  return useMutation<ClaimResult, Error, { device_id: string }>({
    mutationFn: async ({ device_id }) => {
      const res = await fetch(`${FLASK_BASE_URL}/setup/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Claim failed')
      }
      return res.json() as Promise<ClaimResult>
    },
  })
}
