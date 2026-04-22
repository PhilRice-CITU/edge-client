import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FLASK_BASE_URL } from '@renderer/lib/constants'
import type { Session } from '@renderer/types/session'

const CAPTURE_TIMEOUT_MS = 120_000

export function useCapture(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS)

      try {
        const response = await fetch(
          `${FLASK_BASE_URL}/sessions/${sessionId}/capture`,
          { method: 'POST', signal: controller.signal },
        )
        clearTimeout(timeoutId)

        if (!response.ok) {
          let detail = 'Capture failed'
          try {
            const payload = (await response.json()) as { error?: string; detail?: string }
            detail = payload.detail ?? payload.error ?? detail
          } catch {
          }
          throw new Error(detail)
        }

        return response.json() as Promise<Session>
      } catch (err) {
        clearTimeout(timeoutId)
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('Capture timed out. The camera may be stuck — restart the device.')
        }
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['session', sessionId], data)
    },
  })
}
