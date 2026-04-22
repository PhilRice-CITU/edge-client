import { useNavigate, useParams } from '@tanstack/react-router'
import { useSession } from '@renderer/hooks/useSession'
import { ResultCard } from '@renderer/components/organisms/ResultCard'
import { KioskButton } from '@renderer/components/molecules/KioskButton'

export function ResultPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId/result' })
  const navigate = useNavigate()
  const { data: session, isLoading } = useSession(sessionId)

  if (isLoading || !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (session.status === 'submitted') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Processing grade…</p>
        <p className="text-xs text-muted-foreground/60">This may take a moment</p>
      </div>
    )
  }

  if (session.status === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-lg font-semibold text-destructive">Grading Failed</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The server could not process this batch. Please try again with a new session.
          </p>
        </div>
        <KioskButton onClick={() => navigate({ to: '/home' })} variant="secondary">
          Back to Home
        </KioskButton>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      {session.result_grade ? (
        <ResultCard
          grade={session.result_grade}
          dashboardUrl={session.dashboard_url}
          batchCount={session.batches.length}
        />
      ) : (
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground">No grade available yet.</p>
        </div>
      )}
      <KioskButton onClick={() => navigate({ to: '/home' })} variant="secondary">
        Back to Home
      </KioskButton>
    </div>
  )
}
