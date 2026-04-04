import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SplashPage } from '@renderer/pages/SplashPage'
import type { DeviceStatus } from '@renderer/types/session'

// Mock TanStack Router hooks
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock useDeviceStatus so we control what it returns
vi.mock('@renderer/hooks/useDeviceStatus', () => ({
  useDeviceStatus: vi.fn(),
}))

import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'

const mockStatus: DeviceStatus = {
  device_id: 'pi-001',
  edge_mode: 'production',
  images_on_disk: 0,
  queued_uploads: 0,
}

function makeWrapper() {
  const client = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SplashPage', () => {
  it('renders the app name', () => {
    vi.mocked(useDeviceStatus).mockReturnValue({
      data: undefined,
      isError: false,
    } as ReturnType<typeof useDeviceStatus>)

    render(<SplashPage />, { wrapper: makeWrapper() })
    expect(screen.getByText('Rice Vision')).toBeInTheDocument()
    expect(screen.getByText('PNS/BAFS 290:2025 Grading System')).toBeInTheDocument()
  })

  it('shows device_id when status is loaded', () => {
    vi.mocked(useDeviceStatus).mockReturnValue({
      data: mockStatus,
      isError: false,
    } as ReturnType<typeof useDeviceStatus>)

    render(<SplashPage />, { wrapper: makeWrapper() })
    expect(screen.getByText('pi-001')).toBeInTheDocument()
  })

  it('navigates to /home after SPLASH_DURATION_MS when status is ready', async () => {
    vi.mocked(useDeviceStatus).mockReturnValue({
      data: mockStatus,
      isError: false,
    } as ReturnType<typeof useDeviceStatus>)

    render(<SplashPage />, { wrapper: makeWrapper() })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/home' })
  })

  it('navigates to /home on error after SPLASH_DURATION_MS', async () => {
    vi.mocked(useDeviceStatus).mockReturnValue({
      data: undefined,
      isError: true,
    } as ReturnType<typeof useDeviceStatus>)

    render(<SplashPage />, { wrapper: makeWrapper() })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/home' })
  })
})
