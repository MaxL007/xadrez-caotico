import { dbGet, dbPut } from './db'
import { chavePosicao } from '../chess/pgnBook'

const STORE_APRENDIZADO = 'xadrezAprendizado'

export interface LanceAprendido {
  san: string
  vitorias: number
  derrotas: number
  empates: number
}

interface RegistroAprendizado {
  id: string
  lances: LanceAprendido[]
}

/** Chaves de posição (FEN) têm "/" — vira separador de rota na API REST, então precisa virar um id de uma peça só. */
function idDaPosicao(chave: string): string {
  return chave.replace(/\//g, '_').replace(/\s+/g, '-')
}

/** `chave` já deve estar normalizada (ver `chavePosicao` em pgnBook.ts) antes de chamar isso. */
export async function buscarAprendizado(chave: string): Promise<LanceAprendido[] | undefined> {
  try {
    const registro = await dbGet<RegistroAprendizado>(STORE_APRENDIZADO, idDaPosicao(chave))
    return registro?.lances
  } catch {
    return undefined
  }
}

/** Soma mais um resultado (vitória/derrota/empate) ao lance jogado a partir dessa posição — é assim que a máquina "aprende" com cada partida concluída. `chave` já deve estar normalizada. */
async function registrarLance(chave: string, san: string, resultado: 'vitoria' | 'derrota' | 'empate'): Promise<void> {
  const id = idDaPosicao(chave)
  let registro: RegistroAprendizado
  try {
    registro = (await dbGet<RegistroAprendizado>(STORE_APRENDIZADO, id)) ?? { id, lances: [] }
  } catch {
    registro = { id, lances: [] }
  }
  let entrada = registro.lances.find((l) => l.san === san)
  if (!entrada) {
    entrada = { san, vitorias: 0, derrotas: 0, empates: 0 }
    registro.lances.push(entrada)
  }
  if (resultado === 'vitoria') entrada.vitorias += 1
  else if (resultado === 'derrota') entrada.derrotas += 1
  else entrada.empates += 1
  await dbPut(STORE_APRENDIZADO, registro)
}

export type ResultadoPartida = 'BRANCAS' | 'PRETAS' | 'EMPATE'

interface LanceHistorico {
  before: string
  san: string
  color: 'w' | 'b'
}

/**
 * Registra o aprendizado de uma partida inteira já concluída: pra cada lance jogado pelas cores
 * indicadas em `coresParaAprender`, soma o resultado dessa partida (vitória/derrota/empate do
 * ponto de vista de quem jogou aquele lance) na posição de onde ele partiu. Só a cor da máquina aprende.
 */
export async function registrarAprendizadoDaPartida(
  historico: LanceHistorico[],
  resultado: ResultadoPartida,
  coresParaAprender: ('w' | 'b')[],
): Promise<void> {
  const tarefas = historico
    .filter((lance) => coresParaAprender.includes(lance.color))
    .map((lance) => {
      const resultadoParaCor: 'vitoria' | 'derrota' | 'empate' =
        resultado === 'EMPATE' ? 'empate' : (resultado === 'BRANCAS') === (lance.color === 'w') ? 'vitoria' : 'derrota'
      return registrarLance(chavePosicao(lance.before), lance.san, resultadoParaCor)
    })
  await Promise.all(tarefas).catch(() => {
    // sem servidor no momento — essa partida simplesmente não contribui pro aprendizado agora
  })
}
