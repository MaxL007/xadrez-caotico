import type { ConfigXadrez } from '../jogo/configXadrez'
import { DIFICULDADES } from '../jogo/engine'
import { RITMOS } from '../jogo/relogio'
import type { Traduzir } from '../textos/idiomas'

/** O "Novo jogo": a cor e, contra a máquina, a dificuldade e o modo (normal ou blitz, com o ritmo). Na revanche contra
 * outra pessoa, só a cor. */
export function EscolhaDoNovoJogo({
  t,
  config,
  mudarConfig,
  adversario,
  revancheFalhou,
  emPartida,
  onEscolher,
  onVoltar,
}: {
  t: Traduzir
  config: ConfigXadrez
  mudarConfig: (mudanca: Partial<ConfigXadrez>) => void
  /** O nome do adversário na revanche; null contra a máquina. */
  adversario: string | null
  revancheFalhou: boolean
  /** Tem partida aberta atrás: o Voltar volta pra ela, não pro menu. */
  emPartida: boolean
  onEscolher: (cor: 'w' | 'b') => void
  onVoltar: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4">
      <div className="w-full max-w-xs rounded-xl bg-surface p-4 shadow-xl text-center">
        <h3 className="font-display text-base font-semibold text-ink-900 mb-1">{adversario !== null ? t('online.revancheTitulo', { nome: adversario ?? '' }) : t('cor.titulo')}</h3>
        <p className="text-xs text-ink-400 mb-4">{adversario !== null ? t('online.revancheTexto', { nome: adversario ?? '' }) : t('cor.texto')}</p>
        {revancheFalhou && (
          <p role="alert" className="mb-3 text-xs font-medium text-rose-700">
            {t('online.revancheErro', { nome: adversario ?? '' })}
          </p>
        )}
        {adversario === null && (
          <div className="mb-4" data-dificuldade>
            <p className="mb-1.5 text-xs font-semibold text-ink-700">{t('dificuldade.titulo')}</p>
            <div role="radiogroup" aria-label={t('dificuldade.titulo')} className="grid grid-cols-3 gap-1.5">
              {DIFICULDADES.map((nivel) => (
                <button
                  key={nivel}
                  type="button"
                  role="radio"
                  aria-checked={config.dificuldade === nivel}
                  onClick={() => mudarConfig({ dificuldade: nivel })}
                  className={`rounded-lg border px-1 py-1.5 text-xs font-semibold transition ${config.dificuldade === nivel ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:bg-ink-50'}`}
                >
                  {t(`dificuldade.${nivel}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-400">{t(`dificuldade.${config.dificuldade}Dica`)}</p>
          </div>
        )}
        {adversario === null && (
          // o modo: normal, sem relógio, ou blitz, com o relógio de xadrez no ritmo escolhido
          <div className="mb-4" data-modo>
            <p className="mb-1.5 text-xs font-semibold text-ink-700">{t('modo.titulo')}</p>
            <div role="radiogroup" aria-label={t('modo.titulo')} className="grid grid-cols-2 gap-1.5">
              {(['normal', 'blitz'] as const).map((modo) => (
                <button
                  key={modo}
                  type="button"
                  role="radio"
                  aria-checked={config.modo === modo}
                  onClick={() => mudarConfig({ modo })}
                  className={`rounded-lg border px-1 py-1.5 text-xs font-semibold transition ${config.modo === modo ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:bg-ink-50'}`}
                  data-modo-opcao={modo}
                >
                  {t(`modo.${modo}`)}
                </button>
              ))}
            </div>
            {config.modo === 'blitz' && (
              <div role="radiogroup" aria-label={t('modo.ritmo')} className="mt-1.5 grid grid-cols-3 gap-1.5" data-ritmos>
                {RITMOS.map((ritmo) => (
                  <button
                    key={ritmo}
                    type="button"
                    role="radio"
                    aria-checked={config.ritmo === ritmo}
                    onClick={() => mudarConfig({ ritmo })}
                    className={`rounded-lg border px-1 py-1 font-mono text-xs font-bold transition ${config.ritmo === ritmo ? 'border-[#c9a24a] bg-[#c9a24a] text-[#1c120a]' : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:bg-ink-50'}`}
                    data-ritmo={ritmo}
                  >
                    {ritmo}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-400">
              {config.modo === 'blitz'
                ? t('modo.blitzDica', { minutos: config.ritmo.split('+')[0], segundos: config.ritmo.split('+')[1] })
                : t('modo.normalDica')}
            </p>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => onEscolher('w')}
            className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
          >
            <span className="h-10 w-10 rounded-full border-2 border-[#b9b2a6] bg-[#f7f4ee] shadow-inner" />
            <span className="text-sm font-medium text-ink-800">{t('cor.brancas')}</span>
          </button>
          <button
            type="button"
            onClick={() => onEscolher('b')}
            className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
          >
            <span className="h-10 w-10 rounded-full border-2 border-[#6b6358] bg-[#14110e] shadow-inner" />
            <span className="text-sm font-medium text-ink-800">{t('cor.pretas')}</span>
          </button>
        </div>
        <button type="button" onClick={onVoltar} className="mt-4 text-xs text-ink-400 underline hover:text-ink-600">
          {t(emPartida ? 'cor.voltarPartida' : 'cor.voltarMenu')}
        </button>
      </div>
    </div>
  )
}
