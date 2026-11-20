/** A borda da tela ("o golpe que pesa"): escurece durante a luta (mais quanto mais pesa o golpe) e pulsa em vermelho com
 * o rei de quem joga em xeque. Fica por cima do desenho e por baixo dos botões; não pega cliques. Com menos movimento,
 * não pulsa. */
export function Vinheta({ luta, xeque, calma }: { luta: number | null; xeque: boolean; calma: boolean }) {
  const tipo = luta !== null ? 'luta' : xeque ? 'xeque' : ''
  const escuro = 0.3 + 0.3 * (luta ?? 0)
  return (
    <div
      aria-hidden
      data-vinheta={tipo}
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-500 ${tipo ? 'opacity-100' : 'opacity-0'} ${
        tipo === 'xeque' && !calma ? 'animate-[pulsoDaVinheta_1.3s_ease-in-out_infinite]' : ''
      }`}
      style={{
        background:
          tipo === 'xeque'
            ? 'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(150,12,12,0.5) 100%)'
            : `radial-gradient(ellipse at center, rgba(0,0,0,0) 46%, rgba(8,4,2,${escuro.toFixed(2)}) 100%)`,
      }}
    />
  )
}
