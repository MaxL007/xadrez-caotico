import { useState } from 'react'
import type { Traduzir } from '../chess/idiomas'
import { ANEL_DA_MOLDURA, imagemDoJogador } from '../conta/aparencia'
import type { Jogador, Retrospecto } from '../db/servidor'

// Peças que o perfil próprio e o perfil dos amigos têm em comum.

export function Avatar({ jogador, tamanho }: { jogador: Pick<Jogador, 'idJogador' | 'avatar' | 'moldura'>; tamanho: number }) {
  const anel = jogador.moldura ? ANEL_DA_MOLDURA[jogador.moldura] : undefined
  const espessura = anel ? Math.max(3, Math.round(tamanho * 0.07)) : 0
  const lado = tamanho - espessura * 2
  return (
    <span className="relative inline-block shrink-0" style={{ width: tamanho, height: tamanho }} data-moldura={jogador.moldura ?? 'nenhuma'}>
      {anel && <span aria-hidden className={`absolute inset-0 rounded-full ${jogador.moldura === 'caos' ? 'animate-spin [animation-duration:6s] motion-reduce:animate-none' : ''}`} style={{ background: anel }} />}
      <img src={imagemDoJogador(jogador)} alt="" className="absolute rounded-full bg-[#2a1c10] object-cover" style={{ top: espessura, left: espessura, width: lado, height: lado }} />
      {jogador.moldura === 'real' && (
        <svg aria-hidden viewBox="0 0 24 16" className="absolute left-1/2 -translate-x-1/2 drop-shadow" style={{ top: -tamanho * 0.17, width: tamanho * 0.42 }}>
          <path d="M2 15 1 4l6 5 5-8 5 8 6-5-1 11Z" fill="#f7d565" stroke="#a67c1a" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

export function MeuId({ t, id }: { t: Traduzir; id: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#2a1c10] px-3 py-2">
      <p className="text-xs text-[#c9b48a]">
        {t('amigos.meuId')}{' '}
        <span className="select-all font-mono text-sm font-semibold tracking-widest text-[#f5e6c8]" data-meu-id>
          {id}
        </span>
      </p>
      <button
        type="button"
        className="text-xs font-semibold text-[#c9b48a] underline-offset-2 hover:underline"
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(() => setCopiado(true))
        }}
      >
        {t(copiado ? 'conta.copiado' : 'conta.copiar')}
      </button>
    </div>
  )
}

function Quadro({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-[#2a1c10] px-1 py-2 text-center">
      <p className="text-lg font-semibold">{valor}</p>
      <p className="text-[0.65rem] text-[#c9b48a]">{rotulo}</p>
    </div>
  )
}

export function Placar({ t, retrospecto }: { t: Traduzir; retrospecto: Retrospecto }) {
  return (
    <div className="grid grid-cols-4 gap-2" data-placar>
      <Quadro rotulo={t('perfil.partidas')} valor={retrospecto.partidas} />
      <Quadro rotulo={t('perfil.vitorias')} valor={retrospecto.vitorias} />
      <Quadro rotulo={t('perfil.derrotas')} valor={retrospecto.derrotas} />
      <Quadro rotulo={t('perfil.empates')} valor={retrospecto.empates} />
    </div>
  )
}
