import { APP_BUILD } from './version'

// Placeholder shell; replaced by the real UI in later phases.
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>arc</h1>
      <p>Web version of arc for EP-133 K.O. II is being built. {APP_BUILD}</p>
    </main>
  )
}
