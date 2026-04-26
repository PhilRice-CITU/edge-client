import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiUrl, edgeHeaders } from '@renderer/lib/api'
import type { Session } from '@renderer/types/session'

export function useCapture(sessionId: string, currentBatchCount: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // Step 1: trigger hardware capture via IPC → capture.sh --once
      let ir_path: string
      let white_path: string
      try {
        const result = await window.api.runCapture()
        ir_path = result.ir_path
        white_path = result.white_path
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Capture failed'
        if (msg.includes('timed out') || msg.includes('timeout')) {
          throw new Error('Capture timed out. The camera may be stuck — restart the device.')
        }
        throw new Error(msg)
      }

      // Step 2: record the batch in the cloud session
      const response = await fetch(apiUrl(`/sessions/${sessionId}/batches`), {
        method: 'POST',
        headers: { ...edgeHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ir_path,
          white_path,
          captured_at: new Date().toISOString(),
          batch_number: currentBatchCount + 1,
        }),
      })

      if (!response.ok) {
        let detail = 'Failed to record batch'
        try {
          const payload = (await response.json()) as { error?: string; detail?: string }
          detail = payload.detail ?? payload.error ?? detail
        } catch { /* ignore */ }
        throw new Error(detail)
      }

      return response.json() as Promise<Session>
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['session', sessionId], data)
    },
  })
}
