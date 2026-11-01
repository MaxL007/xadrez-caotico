import { useCallback, useMemo } from 'react'
import { useEstadoPersistente } from '../estadoPersistente'
import type { Idioma } from './idiomas'

export type QualidadeXadrez = 'baixa' | 'media' | 'alta'

/** As configurações do jogo de xadrez, guardadas em cada aparelho. */
export interface ConfigXadrez {
  qualidade: QualidadeXadrez
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
}

const PADRAO: ConfigXadrez = {
  qualidade: 'alta',
  som: true,
  volume: 0.6,
  ambiente: true,
  toque: true,
  registro: true,
  telaMovel: true,
  idioma: 'pt-BR',
}

export function useConfigXadrez(): [ConfigXadrez, (mudanca: Partial<ConfigXadrez>) => void] {
  const [salva, setSalva] = useEstadoPersistente<Partial<ConfigXadrez>>('xadrez:config', PADRAO)
  // o que foi salvo antes de uma opção nova existir fica com o padrão dela
  const config = useMemo(() => ({ ...PADRAO, ...salva }), [salva])
  const mudar = useCallback((mudanca: Partial<ConfigXadrez>) => setSalva((atual) => ({ ...atual, ...mudanca })), [setSalva])
  return [config, mudar]
}
