import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSession, useCreateSession, useUpdateSession, useSubmitSession } from '@renderer/hooks/useSession'
import type { Session } from '@renderer/types/session'

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const mockSession: Session = {
  id: 'sess-abc',
  mode: 'grade',
  operator_name: 'Juan',
  rice_variety: 'Sinandomeng',
  status: 'capturing',
  batches: [],
  created_at: '2025-01-01T00:00:00Z',
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.restoreAllMocks())

describe('useSession', () => {
  it('fetches session by id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), { status: 200 }),
    )
    const { result } = renderHook(() => useSession('sess-abc'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.id).toBe('sess-abc')
  })

  it('is disabled when sessionId is null', () => {
    const { result } = renderHook(() => useSession(null), { wrapper: makeWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useCreateSession', () => {
  it('POSTs to /sessions and returns new session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockSession), { status: 200 }),
    )
    const { result } = renderHook(() => useCreateSession(), { wrapper: makeWrapper() })
    let returned: typeof mockSession | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({
        mode: 'grade',
        operator_name: 'Juan',
        rice_variety: 'Sinandomeng',
      })
    })
    expect(returned?.id).toBe('sess-abc')
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toContain('/sessions')
    expect(call[1]?.method).toBe('POST')
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))
    const { result } = renderHook(() => useCreateSession(), { wrapper: makeWrapper() })
    await act(async () => {
      await result.current.mutate({ mode: 'grade', operator_name: 'X', rice_variety: null })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useUpdateSession', () => {
  it('PATCHes the session and returns updated data', async () => {
    const updated = { ...mockSession, operator_name: 'Maria' }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updated), { status: 200 }),
    )
    const { result } = renderHook(() => useUpdateSession('sess-abc'), { wrapper: makeWrapper() })
    let returned: typeof updated | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({ operator_name: 'Maria' })
    })
    expect(returned?.operator_name).toBe('Maria')
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[1]?.method).toBe('PATCH')
  })
})

describe('useSubmitSession', () => {
  it('POSTs to /sessions/:id/submit', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ result_id: 'res-xyz' }), { status: 200 }),
    )
    const { result } = renderHook(() => useSubmitSession('sess-abc'), { wrapper: makeWrapper() })
    let returned: { result_id: string } | undefined
    await act(async () => {
      returned = await result.current.mutateAsync()
    })
    expect(returned?.result_id).toBe('res-xyz')
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toContain('/sessions/sess-abc/submit')
    expect(call[1]?.method).toBe('POST')
  })
})
