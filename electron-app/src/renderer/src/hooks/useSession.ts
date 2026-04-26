import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SESSION_POLL_INTERVAL } from '@renderer/lib/constants'
import { apiUrl, edgeHeaders } from '@renderer/lib/api'
import type { Session, SessionMode } from '@renderer/types/session'

export function useSession(sessionId: string | null, pausePolling = false) {
  return useQuery<Session>({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/sessions/${sessionId}`), {
        headers: edgeHeaders(),
      })
      if (!response.ok) throw new Error('Session not found')
      return response.json() as Promise<Session>
    },
    enabled: sessionId !== null,
    refetchInterval: (query) => {
      if (pausePolling) return false
      const status = query.state.data?.status
      if (status === 'submitted' || status === 'failed') return false
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
      const response = await fetch(apiUrl('/sessions'), {
        method: 'POST',
        headers: { ...edgeHeaders(), 'Content-Type': 'application/json' },
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
      const response = await fetch(apiUrl(`/sessions/${sessionId}`), {
        method: 'PATCH',
        headers: { ...edgeHeaders(), 'Content-Type': 'application/json' },
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

export function useSubmitSession(sessionId: string, batches: Session['batches'] = []) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: { operator_name: string; rice_variety: string | null }) => {
      const form = new FormData()
      form.append('operator_name', fields.operator_name ?? '')
      form.append('rice_variety', fields.rice_variety ?? '')

      for (const batch of batches) {
        const [irResp, whiteResp] = await Promise.all([
          fetch(`local-image://${batch.ir_path}`),
          fetch(`local-image://${batch.white_path}`),
        ])
        if (!irResp.ok || !whiteResp.ok) throw new Error(`Batch ${batch.batch_number} images missing`)
        form.append('ir_images', await irResp.blob(), `ir_${batch.batch_number}.jpg`)
        form.append('raw_images', await whiteResp.blob(), `raw_${batch.batch_number}.jpg`)
      }

      const response = await fetch(apiUrl(`/sessions/${sessionId}/submit`), {
        method: 'POST',
        headers: edgeHeaders(),
        body: form,
      })
      if (!response.ok) throw new Error('Failed to submit session')
      return response.json() as Promise<{ result_id: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
    },
  })
}
