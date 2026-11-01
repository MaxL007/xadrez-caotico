import { enderecoDaSala } from '../db/servidor'

// A conexão ao vivo com uma partida entre duas pessoas. Se a internet cair ela volta sozinha, e ao
// voltar o servidor manda a partida inteira: nenhum lance se perde.

const BATIMENTO_MS = 30000
const ESPERA_MAXIMA_MS = 15000

export type StatusDaSala = 'aguardando' | 'andamento' | 'fim' | 'expirada'
export type ResultadoDaSala = 'brancas' | 'pretas' | 'empate'

export interface EstadoDaSala {
  codigo: string
  status: StatusDaSala
  brancas: string | null
  pretas: string | null
  minhaCor: 'w' | 'b'
  lances: string[]
  resultado?: ResultadoDaSala
  motivo?: string
  adversarioConectado: boolean
}

export interface LanceDaSala {
  n: number
  de: string
  para: string
  promocao?: string
  san: string
}

export interface AoReceberDaSala {
  estado: (estado: EstadoDaSala) => void
  lance: (lance: LanceDaSala) => void
  fim: (resultado: ResultadoDaSala, motivo: string) => void
  presenca: (conectado: boolean) => void
  conexao: (ligada: boolean) => void
  /** O servidor recusou a entrada (sessão vencida, sem lugar na sala). */
  recusada: () => void
}

export interface ConexaoDaSala {
  enviarLance: (n: number, de: string, para: string, promocao?: string) => void
  desistir: () => void
  fechar: () => void
}

export function abrirConexaoDaSala(codigo: string, token: string, ao: AoReceberDaSala): ConexaoDaSala {
  let ws: WebSocket | null = null
  let fechada = false
  let abriuAlgumaVez = false
  let tentativas = 0
  let batimento: ReturnType<typeof setInterval> | null = null
  let aEnviar: string | null = null

  function conectar() {
    const conexao = new WebSocket(enderecoDaSala(codigo), ['xadrez', token])
    ws = conexao
    conexao.onopen = () => {
      abriuAlgumaVez = true
      tentativas = 0
      ao.conexao(true)
      if (aEnviar) conexao.send(aEnviar)
      aEnviar = null
      batimento = setInterval(() => conexao.send('{"t":"ping"}'), BATIMENTO_MS)
    }
    conexao.onmessage = (evento) => {
      const m = JSON.parse(String(evento.data))
      if (m.t === 'estado') ao.estado(m as EstadoDaSala)
      else if (m.t === 'lance') ao.lance(m as LanceDaSala)
      else if (m.t === 'fim') ao.fim(m.resultado, m.motivo)
      else if (m.t === 'presenca') ao.presenca(m.adversarioConectado)
    }
    conexao.onclose = () => {
      if (batimento) clearInterval(batimento)
      batimento = null
      if (fechada) return
      // nem chegou a abrir: o servidor recusou. Tentar de novo não adianta
      if (!abriuAlgumaVez && tentativas >= 2) return ao.recusada()
      ao.conexao(false)
      setTimeout(() => {
        if (!fechada) conectar()
      }, Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** tentativas))
      tentativas += 1
    }
  }

  function enviar(mensagem: unknown) {
    const texto = JSON.stringify(mensagem)
    if (ws?.readyState === WebSocket.OPEN) ws.send(texto)
    else aEnviar = texto
  }

  conectar()
  return {
    enviarLance: (n, de, para, promocao) => enviar({ t: 'lance', n, de, para, promocao }),
    desistir: () => enviar({ t: 'desistir' }),
    fechar() {
      fechada = true
      ws?.close()
    },
  }
}
