import { useState } from 'react'
import { bloquearNaSala, denunciarNaSala, MOTIVOS_DA_DENUNCIA, type MotivoDaDenuncia } from '../dados/servidor'
import type { Traduzir } from '../textos/idiomas'

type Etapa = 'fechado' | 'aberto' | 'bloquear' | 'denunciar' | 'bloqueado' | 'denunciado'

/** Na partida contra outra pessoa: bloquear (não se encontram mais, deixam de ser amigos) e denunciar quem joga do outro
 * lado. O servidor descobre quem é pela sala: o id da pessoa não passa pelo aparelho. */
export function MenuDoAdversario({ t, codigo, nome }: { t: Traduzir; codigo: string; nome: string }) {
  const [etapa, setEtapa] = useState<Etapa>('fechado')
  const [erro, setErro] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(acao: () => Promise<unknown>, depois: Etapa) {
    setEnviando(true)
    setErro(false)
    try {
      await acao()
      setEtapa(depois)
    } catch {
      setErro(true)
    } finally {
      setEnviando(false)
    }
  }

  const botao = 'rounded-lg border border-[#c9a24a]/50 px-2.5 py-1 text-xs font-semibold text-[#f5e6c8] transition hover:bg-[#3a2614] disabled:opacity-50'
  if (etapa === 'fechado') {
    return (
      <button
        type="button"
        onClick={() => setEtapa('aberto')}
        aria-label={t('adversario.opcoes', { nome })}
        className="rounded-lg bg-white/70 px-2 py-0.5 text-xs font-bold text-[#5a4630] shadow"
        data-menu-adversario
      >
        ⋯
      </button>
    )
  }
  return (
    <div className="w-full max-w-sm space-y-2 rounded-xl border border-[#c9a24a]/60 bg-[#1c120a]/95 p-3 text-left text-[#f5e6c8] shadow-xl" role="dialog" aria-label={t('adversario.opcoes', { nome })}>
      {etapa === 'aberto' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botao} onClick={() => setEtapa('denunciar')} data-denunciar>
            {t('adversario.denunciar', { nome })}
          </button>
          <button type="button" className={botao} onClick={() => setEtapa('bloquear')} data-bloquear>
            {t('adversario.bloquear', { nome })}
          </button>
        </div>
      )}
      {etapa === 'bloquear' && (
        <>
          <p className="text-xs">{t('adversario.bloquearConfirmar', { nome })}</p>
          <button type="button" disabled={enviando} className="rounded-lg bg-[#9b2c2c] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void enviar(() => bloquearNaSala(codigo), 'bloqueado')} data-confirmar-bloqueio>
            {t('adversario.sim')}
          </button>
        </>
      )}
      {etapa === 'denunciar' && (
        <>
          <p className="text-xs">{t('adversario.motivo')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MOTIVOS_DA_DENUNCIA.map((motivo: MotivoDaDenuncia) => (
              <button key={motivo} type="button" disabled={enviando} className={botao} onClick={() => void enviar(() => denunciarNaSala(codigo, motivo), 'denunciado')} data-motivo={motivo}>
                {t(`adversario.motivo.${motivo}`)}
              </button>
            ))}
          </div>
        </>
      )}
      {etapa === 'bloqueado' && (
        <p role="status" className="text-xs" data-bloqueado>
          {t('adversario.bloqueado', { nome })}
        </p>
      )}
      {etapa === 'denunciado' && (
        <p role="status" className="text-xs" data-denunciado>
          {t('adversario.denunciado')}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs font-medium text-[#ffb4a8]">
          {t('adversario.erro')}
        </p>
      )}
      <button type="button" className="text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline" onClick={() => setEtapa('fechado')}>
        {t('adversario.fechar')}
      </button>
    </div>
  )
}
