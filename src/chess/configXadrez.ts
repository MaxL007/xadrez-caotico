import { useCallback, useMemo } from 'react'
import { useEstadoPersistente } from '../estadoPersistente'
import type { Idioma } from './idiomas'
import type { Dificuldade } from './engine'

export type QualidadeXadrez = 'baixa' | 'media' | 'alta'

/** As configurações do jogo de xadrez, guardadas em cada aparelho. */
export interface ConfigXadrez {
  qualidade: QualidadeXadrez
  /** A pessoa escolheu a qualidade nas Configurações. Sem isso vale o padrão, a média. */
  qualidadeEscolhida?: boolean
  som: boolean
  volume: number
  ambiente: boolean
  /** Som e vibração ao tocar nas peças. */
  toque: boolean
  /** Mostra a lista de lances e as partidas embaixo do tabuleiro. */
  registro: boolean
  /** Dá pra girar e aproximar o tabuleiro arrastando; desligado, a câmera fica parada. */
  telaMovel: boolean
  idioma: Idioma
  /** A dificuldade escolhida no último "Novo jogo": a tela já abre com ela marcada. */
  dificuldade: Dificuldade
}

const PADRAO: ConfigXadrez = {
  // a média: boa de jogar e bonita na maioria dos aparelhos. A baixa fica pros fracos, a alta pros fortes
  qualidade: 'media',
  som: true,
  volume: 0.6,
  ambiente: true,
  toque: true,
  registro: true,
  telaMovel: true,
  idioma: 'pt-BR',
  dificuldade: 'intermediario',
}

/** A qualidade em uso, pra quem desenha 3D fora do tabuleiro (Loja, vitrine, taça) sem precisar do hook. */
export function qualidadeEmUso(): QualidadeXadrez {
  try {
    const salva = JSON.parse(localStorage.getItem('xadrez:config') ?? '{}') as Partial<ConfigXadrez>
    return salva.qualidadeEscolhida && salva.qualidade ? salva.qualidade : PADRAO.qualidade
  } catch {
    return PADRAO.qualidade
  }
}

/** Os desenhos 3D de fora do tabuleiro: na qualidade leve, na resolução da tela e sem antisserrilhado. */
export function desenhoDosPaineis(): { antialias: boolean; resolucao: number } {
  const leve = qualidadeEmUso() === 'baixa'
  return { antialias: !leve, resolucao: leve ? Math.min(window.devicePixelRatio || 1, 1) : Math.min(window.devicePixelRatio || 1, 2) }
}

export function useConfigXadrez(): [ConfigXadrez, (mudanca: Partial<ConfigXadrez>) => void] {
  const [salva, setSalva] = useEstadoPersistente<Partial<ConfigXadrez>>('xadrez:config', PADRAO)
  // o que foi salvo antes de uma opção nova existir fica com o padrão dela. A qualidade é diferente: o aparelho grava a
  // configuração inteira na primeira vez, então a alta de antes está gravada até em quem nunca escolheu; só vale a
  // qualidade que a pessoa escolheu
  const config = useMemo(() => ({ ...PADRAO, ...salva, ...(salva.qualidadeEscolhida ? {} : { qualidade: PADRAO.qualidade }) }), [salva])
  const mudar = useCallback(
    (mudanca: Partial<ConfigXadrez>) => setSalva((atual) => ({ ...atual, ...mudanca, ...(mudanca.qualidade ? { qualidadeEscolhida: true } : {}) })),
    [setSalva],
  )
  return [config, mudar]
}
