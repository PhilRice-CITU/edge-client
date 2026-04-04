import { useQuery } from '@tanstack/react-query'
import { FLASK_BASE_URL, STATUS_POLL_INTERVAL } from '@renderer/lib/constants'
import type { DeviceStatus } from '@renderer/types/session'

export function useDeviceStatus() {
  return useQuery<DeviceStatus>({
    queryKey: ['device-status'],
    queryFn: async () => {
      const response = await fetch(`${FLASK_BASE_URL}/status`)
      if (!response.ok) throw new Error('Failed to fetch device status')
      return response.json() as Promise<DeviceStatus>
    },
    refetchInterval: STATUS_POLL_INTERVAL,
    staleTime: STATUS_POLL_INTERVAL,
  })
}
