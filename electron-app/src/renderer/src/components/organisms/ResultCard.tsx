import { ExternalLink } from 'lucide-react'
import { Button } from '@renderer/components/atoms/Button'

interface ResultCardProps {
  grade: string
  dashboardUrl: string | null
  batchCount: number
}

export function ResultCard({ grade, dashboardUrl, batchCount }: ResultCardProps) {
  const handleOpenDashboard = () => {
    if (dashboardUrl) {
      window.api.openExternal(dashboardUrl)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wider text-muted-foreground">Grade Result</p>
        <h2 className="mt-2 text-5xl font-bold text-primary">{grade}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          from {batchCount} batch{batchCount !== 1 ? 'es' : ''}
        </p>
      </div>
      {dashboardUrl && (
        <Button onClick={handleOpenDashboard} variant="outline" className="w-full gap-2">
          <ExternalLink className="h-4 w-4" />
          View on Dashboard
        </Button>
      )}
    </div>
  )
}
