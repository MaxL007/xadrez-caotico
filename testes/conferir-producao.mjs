// Confere o servidor publicado de verdade: duas contas temporárias jogam uma partida longa, salvam dados e
// são apagadas no fim. Mede o tempo de cada lance. Cria só duas contas: o limite é 5 por hora por endereço.
// Rodar: API=https://... node testes/conferir-producao.mjs
import crypto from 'crypto'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { Chess } = require('chess.js')

const API = process.env.API
const WS = API.replace(/^http/, 'ws')
const ORIGEM = 'https://maxl007.github.io'
const LANCES = Number(process.env.LANCES ?? 90)

let falhas = 0
function conferir(nome, ok, detalhe = '') {
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

async function api(metodo, caminho, { token, corpo, origem = ORIGEM } = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origem ? { Origin: origem } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  })
  const texto = await resposta.text()
  let json = null
  try {
    json = JSON.parse(texto)
  } catch {
    // resposta sem corpo
  }
  return { status: resposta.status, json, texto, cors: resposta.headers.get('Access-Control-Allow-Origin') }
}

const derivar = (nome, senha) => crypto.pbkdf2Sync(senha, `xadrez-caotico:v1:${nome.toLowerCase()}`, 1000, 32, 'sha256').toString('base64')

function conectar(codigo, token) {
  return new Promise((resolve, recusar) => {
    const ws = new WebSocket(`${WS}/salas/${codigo}/ws`, { protocols: ['xadrez', token], headers: { Origin: ORIGEM } })
    const fila = []
    const esperando = []
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      const i = esperando.findIndex((item) => item.teste(m))
      if (i >= 0) esperando.splice(i, 1)[0].ok(m)
      else fila.push(m)
    }
    ws.onerror = () => recusar(new Error('conexão recusada'))
    ws.onopen = () =>
      resolve({
        enviar: (m) => ws.send(JSON.stringify(m)),
        fechar: () => ws.close(),
        esperar(teste, prazo = 10000) {
          const i = fila.findIndex(teste)
          if (i >= 0) return Promise.resolve(fila.splice(i, 1)[0])
          return new Promise((ok, erro) => {
            const tempo = setTimeout(() => erro(new Error('não chegou a mensagem')), prazo)
            esperando.push({ teste, ok: (m) => (clearTimeout(tempo), ok(m)) })
          })
        },
      })
  })
}

const sufixo = Date.now().toString(36).slice(-6)
const contas = [`Teste A ${sufixo}`, `Teste B ${sufixo}`]
const sessoes = []

try {
  conferir('servidor no ar', (await api('GET', '/saude')).status === 200)
  conferir('site do jogo liberado no CORS', (await api('GET', '/saude')).cors === ORIGEM)
  conferir('site de fora não é liberado', (await api('GET', '/saude', { origem: 'https://exemplo.example' })).cors === null)
  conferir('sem sessão não entra', (await api('GET', '/eu')).status === 401)

  for (const nome of contas) {
    const r = await api('POST', '/contas', { corpo: { nome, chave: derivar(nome, 'senha-temporaria') } })
    if (r.status !== 201) throw new Error(`não criou conta: ${r.status} ${r.texto.slice(0, 150)}`)
    sessoes.push(r.json)
  }
  conferir('cria as contas', sessoes.length === 2)
  const [a, b] = sessoes
  const login = await api('POST', '/sessoes', { corpo: { nome: contas[0], chave: derivar(contas[0], 'senha-temporaria') } })
  conferir('entra com a senha', login.status === 200)
  conferir('senha errada não entra', (await api('POST', '/sessoes', { corpo: { nome: contas[0], chave: derivar(contas[0], 'outra-senha') } })).status === 401)

  const lote = Array.from({ length: 200 }, (_, i) => ({ store: 'xadrezAprendizado', dados: { id: `pos-${i}`, lances: [{ san: 'e4', vitorias: i, derrotas: 0, empates: 0 }] } }))
  const gravou = await api('POST', '/registros', { token: a.token, corpo: { registros: lote } })
  conferir('grava um lote cheio de 200 registros', gravou.status === 200, String(gravou.status))
  conferir('lê os 200 de volta', (await api('GET', '/registros', { token: a.token })).json?.registros?.length === 200)
  conferir('outra pessoa não vê', (await api('GET', '/registros', { token: b.token })).json?.registros?.length === 0)

  const convite = await api('POST', '/amigos', { token: a.token, corpo: { busca: contas[1] } })
  const aceite = await api('POST', '/amigos', { token: b.token, corpo: { busca: contas[0] } })
  conferir('convida pelo nome e o outro aceita', convite.json?.status === 'pendente' && aceite.json?.status === 'aceita', aceite.texto.slice(0, 100))
  const idB = (await api('GET', '/amigos', { token: b.token })).json?.meuId
  conferir('a lista de amigos responde', (await api('GET', '/amigos', { token: a.token })).json?.amigos?.[0]?.idJogador === idB, idB)
  const sala = (await api('POST', '/salas', { token: a.token, corpo: { cor: 'w', amigo: idB } })).json
  const entrou = await api('POST', `/salas/${sala.codigo}/entrar`, { token: b.token })
  conferir('chama pra partida amistosa e o amigo aceita', entrou.json?.cor === 'b', sala.codigo)
  const brancas = await conectar(sala.codigo, a.token)
  const pretas = await conectar(sala.codigo, b.token)
  await brancas.esperar((m) => m.t === 'estado')
  await pretas.esperar((m) => m.t === 'estado')
  conferir('os dois conectam ao vivo', true)

  // partida longa: é aí que o tempo de processamento de cada lance poderia passar do limite
  const chess = new Chess()
  const tempos = []
  let fim = null
  for (let n = 0; n < LANCES && !chess.isGameOver(); n++) {
    const legais = chess.moves({ verbose: true })
    const lance = legais[(n * 7 + 3) % legais.length]
    chess.move(lance)
    const quem = n % 2 === 0 ? brancas : pretas
    const outro = n % 2 === 0 ? pretas : brancas
    const inicio = performance.now()
    quem.enviar({ t: 'lance', n, de: lance.from, para: lance.to, promocao: lance.promotion })
    const chegou = await outro.esperar((m) => m.t === 'lance' && m.n === n)
    tempos.push(performance.now() - inicio)
    if (chegou.san !== lance.san) throw new Error(`lance ${n}: ${chegou.san} em vez de ${lance.san}`)
    await quem.esperar((m) => m.t === 'lance' && m.n === n)
  }
  tempos.sort((x, y) => x - y)
  const media = tempos.reduce((s, t) => s + t, 0) / tempos.length
  conferir(`${tempos.length} lances seguidos sem perder nenhum`, tempos.length > 0, `média ${media.toFixed(0)} ms, pior ${tempos.at(-1).toFixed(0)} ms entre um jogador e o outro`)
  if (chess.isGameOver()) {
    fim = await brancas.esperar((m) => m.t === 'fim')
    conferir('o fim da partida foi detectado', !!fim, JSON.stringify(fim))
  } else {
    brancas.enviar({ t: 'desistir' })
    fim = await pretas.esperar((m) => m.t === 'fim')
    conferir('desistência encerra', fim.motivo === 'desistencia')
  }
  const lista = (await api('GET', '/salas', { token: b.token })).json?.salas ?? []
  conferir('a partida aparece encerrada na lista', lista.some((s) => s.codigo === sala.codigo && s.status === 'fim'))
  conferir('o perfil conta a partida', (await api('GET', `/amigos/${idB}`, { token: a.token })).json?.geral?.partidas === 1)
  brancas.fechar()
  pretas.fechar()
} catch (erro) {
  falhas++
  console.log('FALHOU (parou):', erro.message)
}

// as contas de teste não ficam no banco
for (const [i, sessao] of sessoes.entries()) {
  const r = await api('POST', '/contas/excluir', { token: sessao.token, corpo: { chave: derivar(contas[i], 'senha-temporaria') } })
  conferir(`conta temporária ${i + 1} apagada`, r.status === 200, String(r.status))
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
process.exit(falhas ? 1 : 0)
