import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FLASK_BASE_URL, SESSION_POLL_INTERVAL } from '@renderer/lib/constants'
import type { Session, SessionMode } from '@renderer/types/session'

export function useSession(sessionId: string | null) {
  return useQuery<Session>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(`${FLASK_BASE_URL}/sessions/${sessionId}`)
      if (!response.ok) throw new Error('Session not found')
      return response.json() as Promise<Session>
    },
    enabled: sessionId !== null,
    // Stop polling once the session reaches a terminal state
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'graded' || status === 'failed') return false
      return SESSION_POLL_INTERVAL
    },
    staleTime: 1_000,
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      mode: SessionMode
      operator_name: string
      rice_variety: string | null
    }) => {
      const response = await fetch(`${FLASK_BASE_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!response.ok) throw new Error('Failed to create session')
      return response.json() as Promise<Session>
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['session', data.id], data)
    },
  })
}

export function useUpdateSession(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      fields: Partial<Pick<Session, 'operator_name' | 'rice_variety' | 'status'>>,
    ) => {
      const response = await fetch(`${FLASK_BASE_URL}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!response.ok) throw new Error('Failed to update session')
      return response.json() as Promise<Session>
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['session', sessionId], data)
    },
  })
}

export function useSubmitSession(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${FLASK_BASE_URL}/sessions/${sessionId}/submit`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to submit session')
      return response.json() as Promise<{ result_id: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    },
  })
}
