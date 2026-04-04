import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import type { DeviceStatus } from '@renderer/types/session'

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const mockStatus: DeviceStatus = {
  device_id: 'pi-001',
  edge_mode: 'production',
  images_on_disk: 5,
  queued_uploads: 2,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDeviceStatus', () => {
  it('returns device status on successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockStatus), { status: 200 }),
    )
    const { result } = renderHook(() => useDeviceStatus(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockStatus)
  })

  it('returns error state when Flask is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'))
    const { result } = renderHook(() => useDeviceStatus(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('returns error state when Flask returns non-200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }))
    const { result } = renderHook(() => useDeviceStatus(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
