// A partida contra outra pessoa, do lado da conexão: abre a sala ao vivo no servidor e repassa ao tabuleiro o estado,
// os lances, o fim, a presença do adversário, o pedido de empate e o convite de revanche. A sala que foi trocada por
// outra não mexe mais em nada.
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { entrarEmSala, recusarSala, sessaoAtual } from '../../dados/servidor'
import { abrirConexaoDaSala, type ConexaoDaSala, type EstadoDaSala, type LanceDaSala, type ResultadoDaSala } from '../../dados/salaAoVivo'
import type { PartidaXadrez } from '../../dados/xadrezRepo'

export type EstadoDoEmpate = { tipo: 'pensando' } | { tipo: 'recusado'; por: 'maquina' | 'adversario' } | { tipo: 'enviado' } | { tipo: 'recebido' } | null

/** O que o tabuleiro faz com o que chega da sala (as ações do ChessBoard3D). */
export interface AcoesDaSala {
  carregarSala: () => void
  receberEstadoDaSala: (estado: EstadoDaSala) => void
  receberLanceDaSala: (lance: LanceDaSala) => void
  receberFimDaSala: (resultado: ResultadoDaSala, motivo: string) => void
  atualizarTextos: () => void
}

export function useSalaOnline({
  acoesRef,
  partidaAtualRef,
  jogador,
  setEmpate,
  aoRecusada,
}: {
  acoesRef: MutableRefObject<AcoesDaSala | null>
  partidaAtualRef: MutableRefObject<PartidaXadrez | null>
  /** O nome de quem joga, gravado na partida. */
  jogador: string
  setEmpate: Dispatch<SetStateAction<EstadoDoEmpate>>
  /** O adversário recusou o convite: volta pro menu. */
  aoRecusada: () => void
}) {
  // a conexão ao vivo e o que o servidor disse por último. Sem ela, a partida é contra a máquina
  const salaRef = useRef<{ conexao: ConexaoDaSala; estado: EstadoDaSala | null } | null>(null)
  const [sala, setSala] = useState<EstadoDaSala | null>(null)
  const [conectadoNaSala, setConectadoNaSala] = useState(true)
  // o amigo pediu outra partida enquanto esta está na tela; `vencida` quando o convite já não vale
  const [revanche, setRevanche] = useState<{ codigo: string; vencida: boolean } | null>(null)
  const aoRecusadaRef = useRef(aoRecusada)
  aoRecusadaRef.current = aoRecusada
  useEffect(() => () => salaRef.current?.conexao.fechar(), [])

  function fecharSala() {
    salaRef.current?.conexao.fechar()
    salaRef.current = null
    setSala(null)
    setConectadoNaSala(true)
    setRevanche(null)
  }

  function abrirSala(codigo: string) {
    const token = sessaoAtual()?.token
    if (!token) return
    fecharSala()

    const conexao = abrirConexaoDaSala(codigo, token, {
      estado(estado) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao) return
        setEmpate(estado.empate ? { tipo: estado.empate === estado.minhaCor ? 'enviado' : 'recebido' } : null)
        if (atual.estado) {
          acoesRef.current?.receberEstadoDaSala(estado)
        } else {
          atual.estado = estado
          const agora = Date.now()
          const encerrada = estado.status === 'fim' || estado.status === 'expirada' || estado.status === 'recusada'
          partidaAtualRef.current = { id: `sala-${codigo}`, jogador, corJogador: estado.minhaCor, pgn: '', status: encerrada ? 'FINALIZADA' : 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora }
          acoesRef.current?.carregarSala()
        }
        setSala(estado)
      },
      lance(lance) {
        if (salaRef.current?.conexao !== conexao) return
        // jogar em vez de responder recusa o empate pedido
        setEmpate((agora) => (agora?.tipo === 'recusado' ? agora : null))
        acoesRef.current?.receberLanceDaSala(lance)
      },
      fim(resultado, motivo) {
        if (salaRef.current?.conexao !== conexao) return
        setEmpate(null)
        acoesRef.current?.receberFimDaSala(resultado, motivo)
        setSala((atual) => atual && { ...atual, status: 'fim', resultado, motivo })
      },
      presenca(adversarioConectado) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao) return
        if (atual.estado) atual.estado = { ...atual.estado, adversarioConectado }
        setSala((estado) => estado && { ...estado, adversarioConectado })
      },
      conexao(ligada) {
        if (salaRef.current?.conexao === conexao) setConectadoNaSala(ligada)
      },
      recusada() {
        if (salaRef.current?.conexao === conexao) aoRecusadaRef.current()
      },
      revanche(codigo) {
        if (salaRef.current?.conexao === conexao) setRevanche({ codigo, vencida: false })
      },
      empate(de) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao || !atual.estado) return
        atual.estado = { ...atual.estado, empate: de }
        setEmpate({ tipo: de === atual.estado.minhaCor ? 'enviado' : 'recebido' })
        acoesRef.current?.atualizarTextos()
      },
      empateRecusado(de) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao || !atual.estado) return
        atual.estado = { ...atual.estado, empate: null }
        setEmpate(de === atual.estado.minhaCor ? { tipo: 'recusado', por: 'adversario' } : null)
        acoesRef.current?.atualizarTextos()
      },
    })
    salaRef.current = { conexao, estado: null }
  }

  async function aceitarRevanche() {
    if (!revanche) return
    try {
      await entrarEmSala(revanche.codigo)
      abrirSala(revanche.codigo)
    } catch {
      setRevanche({ ...revanche, vencida: true })
    }
  }

  function recusarRevanche() {
    if (revanche && !revanche.vencida) void recusarSala(revanche.codigo).catch(() => {})
    setRevanche(null)
  }

  return { salaRef, sala, conectadoNaSala, revanche, fecharSala, abrirSala, aceitarRevanche, recusarRevanche }
}
