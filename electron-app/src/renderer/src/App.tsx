import { Outlet } from '@tanstack/react-router'
import { UpdateBanner } from '@/components/atoms/UpdateBanner'

export function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background font-sans text-foreground antialiased">
      <Outlet />
      <UpdateBanner />
    </div>
  )
}
