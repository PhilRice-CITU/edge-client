import { useQuery } from '@tanstack/react-query'
import { STATUS_POLL_INTERVAL } from '@renderer/lib/constants'
import { apiUrl, edgeHeaders, getDeviceId } from '@renderer/lib/api'
import type { DeviceStatus } from '@renderer/types/session'

export function useDeviceStatus() {
  return useQuery<DeviceStatus>({
    queryKey: ['device-status'],
    queryFn: async () => {
      const deviceId = getDeviceId()
      const response = await fetch(apiUrl(`/devices/${deviceId}/status`), {
        headers: edgeHeaders(),
      })
      if (!response.ok) throw new Error('Failed to fetch device status')
      return response.json() as Promise<DeviceStatus>
    },
    enabled: !!getDeviceId(),
    refetchInterval: STATUS_POLL_INTERVAL,
    staleTime: STATUS_POLL_INTERVAL,
  })
}

export function useLocalStats() {
  return useQuery<{ images_on_disk: number; queued_uploads: number }>({
    queryKey: ['local-stats'],
    queryFn: () => window.api.getLocalStats(),
    refetchInterval: STATUS_POLL_INTERVAL,
    staleTime: STATUS_POLL_INTERVAL,
  })
}
