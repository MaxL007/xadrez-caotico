// Vitórias de teste que o servidor aceita: a posição final de verdade (um mate, ou a vez da máquina quando o tempo dela
// acabou) e o bilhete da partida, gravado direto no banco do simulador com a data de alguns minutos atrás — a vitória só
// paga se a partida durou o bastante para os lances dela.
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

/** O "mate do louco", com quem joga de pretas: a máquina (brancas) leva mate no 4º lance. */
export const MATE = { corJogador: 'b', pgn: '1. f3 e5 2. g4 Qh4#', fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3' }
/** Blitz em que o tempo da máquina (pretas) acabou na vez dela, logo depois de 1. e4. */
export const TEMPO_DA_MAQUINA = { corJogador: 'w', pgn: '1. e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' }

const nomeDeBusca = (nome) => nome.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

/** Grava bilhetes de `minutos` atrás (10, se não disser) para as partidas da conta de `nome`. */
export function bilhetesAntigos(nome, partidas) {
  const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker')
  const agora = Date.now()
  const sql = partidas
    .map(
      ({ id, dificuldade, ritmo = null, minutos = 10 }) =>
        `INSERT OR REPLACE INTO bilhetes (usuario_id, partida_id, dificuldade, ritmo, criado_em) SELECT id, '${id}', '${dificuldade}', ${ritmo ? `'${ritmo}'` : 'NULL'}, ${agora - minutos * 60_000} FROM usuarios WHERE nome_busca = '${nomeDeBusca(nome)}'`,
    )
    .join('; ')
  execFileSync(process.execPath, [path.join(pasta, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'xadrez-caotico', '--local', '--command', sql], { cwd: pasta, stdio: 'pipe' })
}
