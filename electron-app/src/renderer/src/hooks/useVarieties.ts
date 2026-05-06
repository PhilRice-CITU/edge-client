import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiUrl, edgeHeaders } from '@renderer/lib/api'

export interface RiceVariety {
  id: string
  name: string
  grain_class: 'long' | 'medium' | 'short'
  avg_length_mm: number
  avg_width_mm: number
}

export function useVarieties() {
  return useQuery<RiceVariety[]>({
    queryKey: ['varieties'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/varieties'), { headers: edgeHeaders() })
      if (!res.ok) throw new Error('Failed to fetch varieties')
      return res.json()
    },
  })
}

export function useCreateVariety() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Omit<RiceVariety, 'id'>) => {
      const res = await fetch(apiUrl('/varieties'), {
        method: 'POST',
        headers: { ...edgeHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to register variety')
      return res.json() as Promise<RiceVariety>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['varieties'] }),
  })
}
