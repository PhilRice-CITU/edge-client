import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCapture } from '@renderer/hooks/useCapture'
import type { Session } from '@renderer/types/session'

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const mockSession: Session = {
  id: 'sess-abc',
  mode: 'grade',
  operator_name: 'Juan',
  rice_variety: null,
  status: 'capturing',
  batches: [{ batch_number: 1, ir_path: '/tmp/ir.jpg', white_path: '/tmp/white.jpg', captured_at: '2026-01-01T00:00:00Z' }],
  created_at: '2025-01-01T00:00:00Z',
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.restoreAllMocks())

describe('useCapture', () => {
  it('POSTs to /sessions/:id/capture and returns updated session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), { status: 200 }),
    )
    const { result } = renderHook(() => useCapture('sess-abc'), { wrapper: makeWrapper() })
    let returned: typeof mockSession | undefined
    await act(async () => {
      returned = await result.current.mutateAsync()
    })
    expect(returned?.batches).toHaveLength(1)
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toContain('/sessions/sess-abc/capture')
    expect(call[1]?.method).toBe('POST')
  })

  it('sets isError on capture failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }))
    const { result } = renderHook(() => useCapture('sess-abc'), { wrapper: makeWrapper() })
    await act(async () => {
      result.current.mutate()
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('updates query cache with the returned session', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), { status: 200 }),
    )
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCapture('sess-abc'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync()
    })
    const cached = client.getQueryData(['session', 'sess-abc']) as Session | undefined
    expect(cached?.id).toBe('sess-abc')
  })
})
