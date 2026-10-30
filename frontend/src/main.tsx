import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import CrashScreen from './components/CrashScreen.tsx'

// Error reporting is off unless VITE_SENTRY_DSN is set (e.g. local dev). No
// session replay or performance tracing, and no PII — just unhandled errors.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
  // Harmless browser noise that says nothing about our code.
  ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications.'],
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<CrashScreen />}>
      <App />
    </Sentry.ErrorBoundary>
    {/* Cookie-free page-view counts (Vercel Web Analytics). Does nothing until
        Web Analytics is enabled on the project in the Vercel dashboard. */}
    <Analytics />
  </StrictMode>,
)
