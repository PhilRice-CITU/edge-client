import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import type { Session } from '@renderer/types/session'

export function useCapture(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${FLASK_BASE_URL}/sessions/${sessionId}/capture`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Capture failed')
      return response.json() as Promise<Session>
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['session', sessionId], data)
    },
  })
}
