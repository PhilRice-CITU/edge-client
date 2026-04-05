import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
} from '@tanstack/react-router'
import { App } from '@renderer/App'
import { SplashPage } from '@renderer/pages/SplashPage'
import { HomePage } from '@renderer/pages/HomePage'
import { SessionPage } from '@renderer/pages/SessionPage'
import { ResultPage } from '@renderer/pages/ResultPage'
import { TrainingPage } from '@renderer/pages/TrainingPage'
import { SetupPage } from '@renderer/pages/SetupPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'

export const rootRoute = createRootRoute({ component: App })

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/splash' })
  },
})

export const splashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/splash',
  component: SplashPage,
})

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: HomePage,
})

export const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/session/$sessionId',
  component: SessionPage,
})

export const resultRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/session/$sessionId/result',
  component: ResultPage,
})

export const trainingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training',
  component: TrainingPage,
})

export const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
})

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  splashRoute,
  homeRoute,
  sessionRoute,
  resultRoute,
  trainingRoute,
  setupRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
