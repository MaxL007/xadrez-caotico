import { lazy, Suspense } from 'react'

const ChessBoard3D = lazy(() => import('./components/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })))

export function App() {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-6 sm:py-6">
      <div className="card">
        <Suspense fallback={<p className="py-10 text-center text-sm text-ink-400">Carregando o tabuleiro…</p>}>
          <ChessBoard3D />
        </Suspense>
      </div>
    </main>
  )
}
