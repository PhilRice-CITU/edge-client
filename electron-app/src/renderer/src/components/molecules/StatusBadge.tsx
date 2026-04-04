import { cn } from '@renderer/lib/utils'
import type { DeviceStatus } from '@renderer/types/session'

interface StatusBadgeProps {
  status: DeviceStatus | undefined
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground',
          className,
        )}
      >
        <span className="h-2 w-2 rounded-full bg-muted-foreground" />
        Offline
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700',
        className,
      )}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      {status.device_id}
    </span>
  )
}
