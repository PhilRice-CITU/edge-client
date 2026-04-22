import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { HomePage } from '@renderer/pages/HomePage'
import type { DeviceStatus, Session } from '@renderer/types/session'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@renderer/hooks/useDeviceStatus', () => ({
  useDeviceStatus: vi.fn(),
}))

vi.mock('@renderer/hooks/useSession', () => ({
  useCreateSession: vi.fn(),
}))

import { useDeviceStatus } from '@renderer/hooks/useDeviceStatus'
import { useCreateSession } from '@renderer/hooks/useSession'

const mockStatus: DeviceStatus = {
  device_id: 'pi-001',
  display_name: 'test-device',
  edge_mode: 'production',
  images_on_disk: 0,
  queued_uploads: 0,
  qr_url: '',
}

const mockSession: Session = {
  id: 'sess-123',
  mode: 'grade',
  operator_name: '',
  rice_variety: null,
  status: 'capturing',
  batches: [],
  created_at: '2025-01-01T00:00:00Z',
}

function makeWrapper() {
  const client = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  mockNavigate.mockReset()
  vi.mocked(useDeviceStatus).mockReturnValue({
    data: mockStatus,
    isError: false,
  } as ReturnType<typeof useDeviceStatus>)
})

afterEach(() => vi.restoreAllMocks())

describe('HomePage', () => {
  it('renders Grade Rice and Training Mode buttons', () => {
    vi.mocked(useCreateSession).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockSession),
    } as unknown as ReturnType<typeof useCreateSession>)

    render(<HomePage />, { wrapper: makeWrapper() })
    expect(screen.getByText('Grade Rice')).toBeInTheDocument()
    expect(screen.getByText('Training Mode')).toBeInTheDocument()
  })

  it('navigates to /session/:id after creating a session', async () => {
    vi.mocked(useCreateSession).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockSession),
    } as unknown as ReturnType<typeof useCreateSession>)

    render(<HomePage />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByText('Grade Rice'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/session/$sessionId',
        params: { sessionId: 'sess-123' },
      })
    })
  })

  it('shows Flask error message when createSession throws', async () => {
    vi.mocked(useCreateSession).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('ERR_CONNECTION_REFUSED')),
    } as unknown as ReturnType<typeof useCreateSession>)

    render(<HomePage />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByText('Grade Rice'))

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot reach device service/i),
      ).toBeInTheDocument()
    })
  })

  it('navigates to /training when Training Mode is clicked', async () => {
    vi.mocked(useCreateSession).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockSession),
    } as unknown as ReturnType<typeof useCreateSession>)

    render(<HomePage />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByText('Training Mode'))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/training' })
  })

  it('navigates to /settings when settings button is clicked', async () => {
    vi.mocked(useCreateSession).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockSession),
    } as unknown as ReturnType<typeof useCreateSession>)

    render(<HomePage />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' })
  })
})
