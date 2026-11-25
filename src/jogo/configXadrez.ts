import { useCallback, useMemo } from 'react'
import { useEstadoPersistente } from '../app/estadoPersistente'
import type { Idioma } from '../textos/idiomas'
import type { Dificuldade } from './engine'
import { RITMO_PADRAO, type Ritmo } from './relogio'

export type QualidadeXadrez = 'baixa' | 'media' | 'alta'

/** As configurações do jogo de xadrez, guardadas em cada aparelho. */
export interface ConfigXadrez {
  qualidade: QualidadeXadrez
  /** A pessoa escolheu a qualidade nas Configurações. Sem isso vale o padrão: a média, ou a baixa no aparelho fraco. */
  qualidadeEscolhida?: boolean
  som: boolean
  volume: number
  /** O volume de cada categoria, de 0 a 1, por cima do volume geral. */
  volumeEfeitos: number
  volumePassos: number
  volumeAmbiente: number
  ambiente: boolean
  /** Som e vibração ao tocar nas peças. */
  toque: boolean
  /** Menos movimento ("o golpe que pesa"): sem a câmera chegando perto, o tremor, a borda pulsando e as peças balançando. */
  menosMovimento: boolean
  /** Mostra a lista de lances e as partidas embaixo do tabuleiro. */
  registro: boolean
  /** Dá pra girar e aproximar o tabuleiro arrastando; desligado, a câmera fica parada. */
  telaMovel: boolean
  idioma: Idioma
  /** A dificuldade escolhida no último "Novo jogo": a tela já abre com ela marcada. */
  dificuldade: Dificuldade
  /** O modo do último "Novo jogo": normal, sem relógio, ou blitz, com o relógio no `ritmo`. */
  modo: 'normal' | 'blitz'
  ritmo: Ritmo
}

/** Aparelho fraco: até 4 GB de memória. O navegador só informa a memória em faixas (0,25 a 8); sem a informação
 * (iPhone, Firefox), conta como aparelho comum. Os núcleos não servem: o celular de 4 GB costuma ter 8. */
function aparelhoFraco(): boolean {
  if (typeof navigator === 'undefined') return false
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof memoria === 'number' && memoria <= 4
}

const PADRAO: ConfigXadrez = {
  // a média: boa de jogar e bonita na maioria dos aparelhos. No aparelho fraco (celular de 4 GB) a média travava as
  // lutas: quem nunca escolheu começa na baixa, que ficou nítida (ver QUALIDADES). A alta fica pros fortes
  qualidade: aparelhoFraco() ? 'baixa' : 'media',
  som: true,
  volume: 0.8,
  volumeEfeitos: 1,
  volumePassos: 1,
  volumeAmbiente: 1,
  ambiente: true,
  toque: true,
  menosMovimento: false,
  registro: true,
  telaMovel: true,
  idioma: 'pt-BR',
  dificuldade: 'intermediario',
  modo: 'normal',
  ritmo: RITMO_PADRAO,
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

let painelDesenhouEm = -Infinity
/** A Loja ou a Personalização desenhou o 3D dela há pouco: o tabuleiro de fundo desenha menos enquanto isso (no
 * celular fraco, dois desenhos 3D ao mesmo tempo disputavam a placa de vídeo). Escondido (a prévia da Loja), o painel
 * não desenha, e o tabuleiro volta ao ritmo dele. */
export const painelDesenhando = () => performance.now() - painelDesenhouEm < 300

/** O ritmo de um painel com desenho 3D: diz, a cada quadro, se ele desenha. Não desenha escondido (a Loja fica montada
 * durante a prévia) e, na qualidade leve, desenha no máximo 30 vezes por segundo, como o tabuleiro. */
export function ritmoDoPainel(): (caixa: HTMLElement) => boolean {
  const leve = qualidadeEmUso() === 'baixa'
  let ultimo = 0
  return (caixa) => {
    if (!caixa.isConnected || caixa.clientWidth === 0) return false
    const agora = performance.now()
    if (leve && agora - ultimo < 1000 / 30 - 2) return false
    ultimo = agora
    painelDesenhouEm = agora
    return true
  }
}

/** Os desenhos 3D de fora do tabuleiro: na qualidade leve, sem antisserrilhado e com a resolução contida. */
export function desenhoDosPaineis(): { antialias: boolean; resolucao: number } {
  const leve = qualidadeEmUso() === 'baixa'
  // na leve, até 1,35 vez a tela como o tabuleiro: na própria tela o retrato ficava embaçado no celular
  return { antialias: !leve, resolucao: leve ? Math.min(window.devicePixelRatio || 1, 1.35) : Math.min(window.devicePixelRatio || 1, 2) }
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
