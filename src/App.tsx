import { lazy, Suspense } from 'react'

const ChessBoard3D = lazy(() => import('./tabuleiro/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D })))

export function App() {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-6 sm:py-6">
      <div className="card">
        <Suspense fallback={<p className="fixed inset-0 flex items-center justify-center bg-[#1c120a] text-sm text-[#c9b48a]">Carregando o tabuleiro…</p>}>
          <ChessBoard3D />
        </Suspense>
      </div>
    </main>
  )
}
