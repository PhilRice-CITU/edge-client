import { Outlet } from '@tanstack/react-router'

export function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background font-sans text-foreground antialiased">
      <Outlet />
    </div>
  )
}
