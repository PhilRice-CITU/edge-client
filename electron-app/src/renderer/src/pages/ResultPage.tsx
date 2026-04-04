import { useNavigate, useParams } from '@tanstack/react-router'
import { useSession } from '@renderer/hooks/useSession'
import { ResultCard } from '@renderer/components/organisms/ResultCard'
import { KioskButton } from '@renderer/components/molecules/KioskButton'

export function ResultPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId/result' })
  const navigate = useNavigate()
  const { data: session, isLoading } = useSession(sessionId)

  const isProcessing = !session || session.status === 'submitted'

  if (isLoading || isProcessing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Processing grade…</p>
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
        <p className="text-muted-foreground">No grade available yet.</p>
      )}
      <KioskButton onClick={() => navigate({ to: '/home' })} variant="secondary">
        Back to Home
      </KioskButton>
    </div>
  )
}
