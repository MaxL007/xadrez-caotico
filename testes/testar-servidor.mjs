// Testa o servidor de ponta a ponta contra o simulador da Cloudflare (wrangler dev em 127.0.0.1:8787):
// contas, senhas, dados de cada pessoa e as partidas entre pessoas, inclusive as tentativas de trapaça.
// Rodar com o simulador no ar: node testes/testar-servidor.mjs
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const API = process.env.API ?? 'http://127.0.0.1:8787'
const WS = API.replace(/^http/, 'ws')
const ORIGEM = 'http://127.0.0.1:5184'

let falhas = 0
let certos = 0
function conferir(nome, ok, detalhe = '') {
  if (ok) certos++
  else falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

let enderecoFalso = 0
/** Cada conta do teste vem de um endereço, senão o limite de contas por hora barra o próprio teste. */
const novoEndereco = () => `203.0.113.${++enderecoFalso}`

async function api(metodo, caminho, { token, corpo, endereco, origem = ORIGEM } = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origem ? { Origin: origem } : {}),
      ...(endereco ? { 'CF-Connecting-IP': endereco } : {}),
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
  return { status: resposta.status, json, cors: resposta.headers.get('Access-Control-Allow-Origin') }
}

/** O que o site faz com a senha antes de enviar (src/conta/senha.ts). */
const derivar = (nome, senha) =>
  crypto.pbkdf2Sync(senha.normalize('NFC'), `xadrez-caotico:v1:${nome.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()}`, 1000, 32, 'sha256').toString('base64')

async function novaConta(nome, senha = 'senha-de-teste') {
  const r = await api('POST', '/contas', { corpo: { nome, chave: derivar(nome, senha) }, endereco: novoEndereco() })
  if (r.status !== 201) throw new Error(`não criou ${nome}: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json
}

function conectar(codigo, token, origem = ORIGEM) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}/salas/${codigo}/ws`, { protocols: ['xadrez', token], headers: { Origin: origem } })
    const mensagens = []
    const esperando = []
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      mensagens.push(m)
      for (const item of [...esperando]) {
        if (item.teste(m)) {
          esperando.splice(esperando.indexOf(item), 1)
          item.resolver(m)
        }
      }
    }
    const conexao = {
      ws,
      mensagens,
      enviar: (m) => ws.send(JSON.stringify(m)),
      fechar: () => ws.close(),
      esperar(teste, prazo = 5000) {
        const ja = mensagens.find(teste)
        if (ja) {
          mensagens.splice(mensagens.indexOf(ja), 1)
          return Promise.resolve(ja)
        }
        return new Promise((ok, erro) => {
          const item = { teste, resolver: (m) => (clearTimeout(tempo), mensagens.splice(mensagens.indexOf(m), 1), ok(m)) }
          const tempo = setTimeout(() => {
            esperando.splice(esperando.indexOf(item), 1)
            erro(new Error('não chegou a mensagem esperada'))
          }, prazo)
          esperando.push(item)
        })
      },
    }
    ws.onopen = () => resolve({ aberto: true, ...conexao })
    ws.onerror = () => resolve({ aberto: false, ...conexao })
  })
}

const lance = (de, para, n, promocao) => ({ t: 'lance', n, de, para, promocao })

/** Liga "tudo liberado" na conta direto no banco do simulador, do mesmo jeito que se faz na conta do dono do jogo. */
function liberarTudo(nome) {
  const pastaDoServidor = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker')
  const comando = `UPDATE usuarios SET tudo_liberado = 1 WHERE nome_busca = '${nome.toLowerCase()}'`
  execFileSync(process.execPath, [path.join(pastaDoServidor, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'xadrez-caotico', '--local', '--command', comando], { cwd: pastaDoServidor, stdio: 'pipe' })
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const meusAmigos = async (token) => (await api('GET', '/amigos', { token })).json
const convidar = (token, busca) => api('POST', '/amigos', { token, corpo: { busca } })

try {
  // =================== contas ===================
  conferir('o servidor responde', (await api('GET', '/saude')).status === 200)
  const sufixo = Date.now().toString(36).slice(-5)
  const ana = await novaConta(`Ana ${sufixo}`)
  const bia = await novaConta(`Bia ${sufixo}`)
  const caio = await novaConta(`Caio ${sufixo}`)
  conferir('conta nova recebe sessão e código de recuperação', !!ana.token && /^[A-Z0-9-]{19}$/.test(ana.codigoRecuperacao), ana.codigoRecuperacao)

  const repetido = await api('POST', '/contas', { corpo: { nome: `ANÁ ${sufixo}`, chave: derivar('x', 'y') }, endereco: novoEndereco() })
  conferir('nome igual, com outra caixa ou acento, é recusado', repetido.status === 409 && repetido.json?.erro === 'nome-em-uso', String(repetido.status))
  for (const nome of ['a', '<script>', 'x'.repeat(25), '  ', 'ad\nmin', 'ad\u0000min']) {
    const r = await api('POST', '/contas', { corpo: { nome, chave: derivar('x', 'y') }, endereco: novoEndereco() })
    conferir(`nome inválido recusado: ${JSON.stringify(nome.slice(0, 12))}`, r.status === 422, String(r.status))
  }
  const semChave = await api('POST', '/contas', { corpo: { nome: `Dan ${sufixo}`, chave: 'minha-senha-em-texto' }, endereco: novoEndereco() })
  conferir('senha em texto puro é recusada: só a chave derivada entra', semChave.status === 422, String(semChave.status))

  const nomeAna = `Ana ${sufixo}`
  const certo = await api('POST', '/sessoes', { corpo: { nome: nomeAna, chave: derivar(nomeAna, 'senha-de-teste') }, endereco: novoEndereco() })
  conferir('entra com a senha certa', certo.status === 200 && !!certo.json?.token)
  const errada = await api('POST', '/sessoes', { corpo: { nome: nomeAna, chave: derivar(nomeAna, 'outra') }, endereco: novoEndereco() })
  const ninguem = await api('POST', '/sessoes', { corpo: { nome: 'Ninguem Mesmo', chave: derivar('x', 'y') }, endereco: novoEndereco() })
  conferir('senha errada e conta inexistente dão a mesma resposta', errada.status === 401 && ninguem.status === 401 && errada.json.erro === ninguem.json.erro, errada.json?.erro)
  conferir('sem sessão não vê nada', (await api('GET', '/eu')).status === 401)
  conferir('token inventado não vale', (await api('GET', '/eu', { token: 'inventado' })).status === 401)
  conferir('a sessão diz quem é', (await api('GET', '/eu', { token: ana.token })).json?.usuario?.nome === nomeAna)

  let bloqueou = false
  const nomeBia = `Bia ${sufixo}`
  for (let i = 0; i < 12; i++) {
    const r = await api('POST', '/sessoes', { corpo: { nome: nomeBia, chave: derivar(nomeBia, `chute${i}`) }, endereco: novoEndereco() })
    if (r.status === 429) bloqueou = true
  }
  conferir('muitas senhas erradas na mesma conta bloqueiam, mesmo vindo de vários endereços', bloqueou)
  const naConta = await api('POST', '/sessoes', { corpo: { nome: nomeBia, chave: derivar(nomeBia, 'senha-de-teste') }, endereco: novoEndereco() })
  conferir('durante o bloqueio nem a senha certa entra', naConta.status === 429, String(naConta.status))

  const nomeCaio = `Caio ${sufixo}`
  const recuperado = await api('POST', '/contas/recuperar', { corpo: { nome: nomeCaio, codigo: caio.codigoRecuperacao.toLowerCase(), chaveNova: derivar(nomeCaio, 'nova-senha') }, endereco: novoEndereco() })
  conferir('o código de recuperação troca a senha', recuperado.status === 200 && !!recuperado.json?.token, String(recuperado.status))
  conferir('e derruba as sessões antigas', (await api('GET', '/eu', { token: caio.token })).status === 401)
  const reuso = await api('POST', '/contas/recuperar', { corpo: { nome: nomeCaio, codigo: caio.codigoRecuperacao, chaveNova: derivar(nomeCaio, 'de-novo') }, endereco: novoEndereco() })
  conferir('o código usado não vale de novo', reuso.status === 401, String(reuso.status))
  const tokenCaio = recuperado.json.token

  // =================== origem ===================
  const estranha = await api('GET', '/saude', { origem: 'https://site-malicioso.example' })
  conferir('site de fora não recebe liberação de CORS', estranha.cors === null, String(estranha.cors))
  conferir('o site do jogo recebe', (await api('GET', '/saude')).cors === ORIGEM)

  // =================== dados de cada pessoa ===================
  const partida = { id: 'p1', pgn: '1. e4', atualizadaEm: 1 }
  const gravou = await api('POST', '/registros', { token: ana.token, corpo: { registros: [{ store: 'xadrezPartidas', dados: partida }] } })
  conferir('grava a partida', gravou.status === 200 && gravou.json?.gravados === 1)
  conferir('sem sessão não grava', (await api('POST', '/registros', { corpo: { registros: [] } })).status === 401)
  const minha = await api('GET', '/registros', { token: ana.token })
  conferir('a dona lê a partida', minha.json?.registros?.[0]?.dados?.pgn === '1. e4')
  conferir('outra pessoa não vê', (await api('GET', '/registros', { token: bia.token })).json?.registros?.length === 0)
  await api('POST', '/registros', { token: bia.token, corpo: { registros: [{ store: 'xadrezPartidas', dados: { id: 'p1', pgn: 'da bia' } }] } })
  conferir('o mesmo id de outra pessoa não sobrescreve', (await api('GET', '/registros', { token: ana.token })).json?.registros?.[0]?.dados?.pgn === '1. e4')
  const posterior = await api('GET', `/registros?desde=${minha.json.registros[0].atualizadoEm}`, { token: ana.token })
  conferir('leitura incremental não repete o que já veio', posterior.json?.registros?.length === 0)
  conferir('store desconhecido recusado', (await api('POST', '/registros', { token: ana.token, corpo: { registros: [{ store: 'usuarios', dados: { id: 'x' } }] } })).status === 422)
  conferir('registro gigante recusado', (await api('POST', '/registros', { token: ana.token, corpo: { registros: [{ store: 'xadrezPartidas', dados: { id: 'x', pgn: 'a'.repeat(20000) } }] } })).status === 422)
  conferir('lote gigante recusado', (await api('POST', '/registros', { token: ana.token, corpo: { registros: Array.from({ length: 201 }, (_, i) => ({ store: 'xadrezPartidas', dados: { id: `x${i}` } })) } })).status === 422)

  // =================== amigos ===================
  conferir('sem sessão não vê amigos', (await api('GET', '/amigos')).status === 401)
  const dadosAna = await meusAmigos(ana.token)
  const dadosBia = await meusAmigos(bia.token)
  const dadosCaio = await meusAmigos(tokenCaio)
  const idAna = dadosAna.meuId
  const idBia = dadosBia.meuId
  const idCaio = dadosCaio.meuId
  conferir('cada jogador tem um ID próprio de 8 caracteres', [idAna, idBia, idCaio].every((id) => /^[A-Z2-9]{8}$/.test(id ?? '')) && new Set([idAna, idBia, idCaio]).size === 3, idAna)
  conferir('conta nova começa sem amigos', dadosAna.amigos.length === 0 && dadosAna.convitesRecebidos.length === 0)

  const naoTem = await convidar(ana.token, 'Ninguem Com Esse Nome')
  conferir('nome que não existe não é encontrado', naoTem.status === 404 && naoTem.json?.erro === 'jogador-nao-encontrado', String(naoTem.status))
  conferir('não dá pra convidar a si mesmo pelo ID', (await convidar(ana.token, idAna)).json?.erro === 'voce-mesmo')
  conferir('nem pelo nome', (await convidar(ana.token, nomeAna)).json?.erro === 'voce-mesmo')
  conferir('pedaço do nome não acha: a busca não lista jogadores', (await convidar(ana.token, nomeBia.slice(0, 5))).status === 404)
  conferir('busca gigante recusada', (await convidar(ana.token, 'x'.repeat(41))).status === 422)

  const porNome = await convidar(ana.token, nomeBia.toUpperCase())
  conferir('convida pelo nome, sem ligar pra maiúsculas', porNome.status === 201 && porNome.json?.status === 'pendente' && porNome.json?.nome === nomeBia, JSON.stringify(porNome.json))
  conferir('convidar de novo não duplica', (await convidar(ana.token, idBia)).json?.status === 'pendente' && (await meusAmigos(ana.token)).convitesEnviados.length === 1)
  const recebeu = await meusAmigos(bia.token)
  conferir('o convite aparece pra quem recebeu', recebeu.convitesRecebidos[0]?.idJogador === idAna && recebeu.convitesRecebidos[0]?.nome === nomeAna)
  conferir('e como enviado pra quem convidou', (await meusAmigos(ana.token)).convitesEnviados[0]?.idJogador === idBia)
  conferir('convite pendente ainda não é amizade', (await meusAmigos(ana.token)).amigos.length === 0)
  conferir('sem aceitar não vê o perfil', (await api('GET', `/amigos/${idBia}`, { token: ana.token })).status === 403)
  conferir('sem aceitar não chama pra jogar', (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w', amigo: idBia } })).json?.erro === 'nao-e-amigo')

  await api('POST', `/amigos/${idAna}/remover`, { token: bia.token })
  conferir('recusar apaga o convite dos dois lados', (await meusAmigos(bia.token)).convitesRecebidos.length === 0 && (await meusAmigos(ana.token)).convitesEnviados.length === 0)
  await convidar(ana.token, idBia)
  await api('POST', `/amigos/${idBia}/remover`, { token: ana.token })
  conferir('quem convidou pode cancelar', (await meusAmigos(bia.token)).convitesRecebidos.length === 0)

  conferir('convida pelo ID, em minúsculas e com espaço', (await convidar(ana.token, ` ${idBia.toLowerCase()} `)).json?.nome === nomeBia)
  const aceitou = await convidar(bia.token, idAna)
  conferir('aceitar é convidar de volta', aceitou.status === 200 && aceitou.json?.status === 'aceita', JSON.stringify(aceitou.json))
  const listaAna = await meusAmigos(ana.token)
  const listaBia = await meusAmigos(bia.token)
  conferir('virou amizade dos dois lados', listaAna.amigos[0]?.nome === nomeBia && listaBia.amigos[0]?.nome === nomeAna && listaAna.convitesEnviados.length === 0 && listaBia.convitesRecebidos.length === 0)
  conferir('convidar quem já é amigo avisa', (await convidar(ana.token, idBia)).json?.erro === 'ja-amigos')
  conferir('nenhum identificador interno sai na lista de amigos', !JSON.stringify(listaAna).includes(bia.usuario.id) && !JSON.stringify(listaBia).includes(ana.usuario.id))
  conferir('quem não é amigo não vê o perfil', (await api('GET', `/amigos/${idBia}`, { token: tokenCaio })).status === 403)

  // nome igual ao ID de outra pessoa não rouba o convite
  const impostor = await novaConta(idBia)
  conferir('um nome igual ao ID de alguém perde pro ID', (await convidar(tokenCaio, idBia)).json?.nome === nomeBia)
  await api('POST', `/amigos/${idBia}/remover`, { token: tokenCaio })

  // =================== salas ===================
  conferir('sem sessão não cria sala', (await api('POST', '/salas', { corpo: { cor: 'w', amigo: idBia } })).status === 401)
  conferir('cor inválida recusada', (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'x', amigo: idBia } })).status === 422)
  conferir('sala sem amigo escolhido recusada', (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w' } })).json?.erro === 'nao-e-amigo')
  conferir('não chama quem não é amigo', (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w', amigo: idCaio } })).json?.erro === 'nao-e-amigo')
  const sala = await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w', amigo: idBia } })
  const codigo = sala.json?.codigo
  conferir('cria a sala', sala.status === 201 && /^[A-Z2-9]{8}$/.test(codigo ?? ''), codigo)
  conferir('sala que não existe', (await api('POST', '/salas/AAAAAAAA/entrar', { token: bia.token })).status === 404)
  conferir('chamar de novo volta pra mesma partida', (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'b', amigo: idBia } })).json?.codigo === codigo)
  const chamada = (await meusAmigos(bia.token)).partidasRecebidas
  conferir('o amigo recebe a partida amistosa', chamada.length === 1 && chamada[0].codigo === codigo && chamada[0].nome === nomeAna && chamada[0].minhaCor === 'b', JSON.stringify(chamada))
  conferir('quem chamou não recebe a própria partida', (await meusAmigos(ana.token)).partidasRecebidas.length === 0)
  conferir('antes de aceitar, a partida não entra em Minhas partidas do amigo', !(await api('GET', '/salas', { token: bia.token })).json?.salas?.some((s) => s.codigo === codigo))
  conferir('na lista de quem chamou ela aparece', (await api('GET', '/salas', { token: ana.token })).json?.salas?.some((s) => s.codigo === codigo && s.status === 'aguardando'))

  const wsSemSessao = await conectar(codigo, 'inventado')
  conferir('sem sessão válida não abre a conexão ao vivo', !wsSemSessao.aberto)
  const wsDeFora = await conectar(codigo, ana.token, 'https://site-malicioso.example')
  conferir('site de fora não abre a conexão, mesmo com sessão', !wsDeFora.aberto)
  const wsSemLugar = await conectar(codigo, tokenCaio)
  conferir('quem não está na sala não conecta', !wsSemLugar.aberto)

  const brancas = await conectar(codigo, ana.token)
  conferir('a criadora conecta', brancas.aberto)
  const inicio = await brancas.esperar((m) => m.t === 'estado')
  conferir('recebe a sala aguardando, jogando de brancas, já com o nome do amigo', inicio.status === 'aguardando' && inicio.minhaCor === 'w' && inicio.pretas === nomeBia)
  brancas.enviar(lance('e2', 'e4', 0))
  await brancas.esperar((m) => m.t === 'estado' && m.lances.length === 0)
  conferir('sem adversário o lance não entra', true)

  conferir('entrar sem ter sido chamado é recusado', (await api('POST', `/salas/${codigo}/entrar`, { token: tokenCaio })).json?.erro === 'sala-cheia')
  const entrou = await api('POST', `/salas/${codigo}/entrar`, { token: bia.token })
  conferir('o amigo aceita e senta com a outra cor', entrou.status === 200 && entrou.json?.cor === 'b', JSON.stringify(entrou.json))
  conferir('terceira pessoa não entra', (await api('POST', `/salas/${codigo}/entrar`, { token: tokenCaio })).json?.erro === 'sala-cheia')
  conferir('entrar de novo mantém o lugar', (await api('POST', `/salas/${codigo}/entrar`, { token: bia.token })).json?.cor === 'b')
  conferir('depois de aceitar, a partida sai das recebidas', (await meusAmigos(bia.token)).partidasRecebidas.length === 0)
  const andamento = await brancas.esperar((m) => m.t === 'estado' && m.status === 'andamento')
  conferir('a criadora vê a partida começar, com o nome do outro', andamento.pretas === nomeBia, andamento.pretas)

  const pretas = await conectar(codigo, bia.token)
  conferir('o convidado conecta', pretas.aberto)
  await pretas.esperar((m) => m.t === 'estado' && m.minhaCor === 'b')
  await brancas.esperar((m) => m.t === 'presenca' && m.adversarioConectado)
  conferir('um vê o outro conectado', true)

  pretas.enviar(lance('e7', 'e5', 0))
  await pretas.esperar((m) => m.t === 'estado' && m.lances.length === 0)
  conferir('fora da vez o lance é recusado', true)
  pretas.enviar(lance('e2', 'e4', 0))
  await pretas.esperar((m) => m.t === 'estado' && m.lances.length === 0)
  conferir('mexer a peça do outro é recusado', true)
  brancas.enviar(lance('e2', 'e5', 0))
  await brancas.esperar((m) => m.t === 'estado' && m.lances.length === 0)
  conferir('lance ilegal é recusado', true)
  brancas.enviar(lance('zz', 'e5', 0))
  await brancas.esperar((m) => m.t === 'estado' && m.lances.length === 0)
  conferir('casa inexistente é recusada', true)

  brancas.enviar(lance('f2', 'f3', 0))
  const viu = await pretas.esperar((m) => m.t === 'lance')
  conferir('o lance chega ao adversário', viu.san === 'f3' && viu.de === 'f2' && viu.para === 'f3', viu.san)
  await brancas.esperar((m) => m.t === 'lance')
  brancas.enviar(lance('g2', 'g4', 1))
  await brancas.esperar((m) => m.t === 'estado' && m.lances.length === 1)
  conferir('dois lances seguidos da mesma pessoa: o segundo é recusado', true)

  pretas.enviar(lance('e7', 'e5', 1))
  await brancas.esperar((m) => m.t === 'lance' && m.n === 1)
  await pretas.esperar((m) => m.t === 'lance' && m.n === 1)

  pretas.fechar()
  await brancas.esperar((m) => m.t === 'presenca' && !m.adversarioConectado)
  conferir('quando um cai, o outro é avisado', true)
  const voltou = await conectar(codigo, bia.token)
  const retomada = await voltou.esperar((m) => m.t === 'estado')
  conferir('quem volta recebe a partida inteira', retomada.lances.join(' ') === 'f3 e5', retomada.lances.join(' '))

  brancas.enviar(lance('g2', 'g4', 2))
  await voltou.esperar((m) => m.t === 'lance' && m.n === 2)
  voltou.enviar(lance('d8', 'h4', 3))
  const fim = await brancas.esperar((m) => m.t === 'fim')
  conferir('xeque-mate encerra a partida', fim.resultado === 'pretas' && fim.motivo === 'xeque-mate', JSON.stringify(fim))
  await voltou.esperar((m) => m.t === 'fim')
  brancas.enviar(lance('a2', 'a3', 4))
  await brancas.esperar((m) => m.t === 'estado')
  conferir('depois do fim não entra mais lance', true)
  const lista = await api('GET', '/salas', { token: bia.token })
  const naLista = lista.json?.salas?.find((s) => s.codigo === codigo)
  conferir('a partida aparece na lista de quem jogou, com o resultado', naLista?.status === 'fim' && naLista.resultado === 'pretas' && naLista.minhaCor === 'b', JSON.stringify(naLista))
  conferir('e não aparece pra quem não jogou', !(await api('GET', '/salas', { token: tokenCaio })).json?.salas?.some((s) => s.codigo === codigo))
  conferir('nenhum identificador interno sai pro cliente', !JSON.stringify(retomada).includes(ana.usuario.id) && !JSON.stringify(retomada).includes(bia.usuario.id))
  brancas.fechar()
  voltou.fechar()
  conferir('sala encerrada não aceita gente nova', (await api('POST', `/salas/${codigo}/entrar`, { token: tokenCaio })).status === 409)

  // recusar e cancelar a partida amistosa
  const chamadaRecusada = (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w', amigo: idBia } })).json
  const esperando = await conectar(chamadaRecusada.codigo, ana.token)
  await esperando.esperar((m) => m.t === 'estado')
  await api('POST', `/salas/${chamadaRecusada.codigo}/recusar`, { token: tokenCaio })
  conferir('quem não foi chamado não recusa pelos outros', (await meusAmigos(bia.token)).partidasRecebidas.length === 1)
  await api('POST', `/salas/${chamadaRecusada.codigo}/recusar`, { token: bia.token })
  const avisada = await esperando.esperar((m) => m.t === 'estado' && m.status === 'recusada')
  conferir('recusar avisa na hora quem chamou', !!avisada)
  conferir('e a partida some das recebidas', (await meusAmigos(bia.token)).partidasRecebidas.length === 0)
  conferir('partida recusada não pode ser aceita depois', (await api('POST', `/salas/${chamadaRecusada.codigo}/entrar`, { token: bia.token })).json?.erro === 'sala-encerrada')
  esperando.fechar()
  const chamadaCancelada = (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'b', amigo: idBia } })).json
  conferir('depois de recusada, dá pra chamar de novo', chamadaCancelada.codigo !== chamadaRecusada.codigo && chamadaCancelada.cor === 'b')
  await api('POST', `/salas/${chamadaCancelada.codigo}/recusar`, { token: ana.token })
  conferir('quem chamou pode cancelar', (await meusAmigos(bia.token)).partidasRecebidas.length === 0)

  // partida aberta de quem deixou de ser amigo
  await convidar(tokenCaio, idAna)
  await convidar(ana.token, idCaio)
  const deExAmigo = (await api('POST', '/salas', { token: tokenCaio, corpo: { cor: 'w', amigo: idAna } })).json
  conferir('a nova amiga recebe a chamada', (await meusAmigos(ana.token)).partidasRecebidas.some((p) => p.codigo === deExAmigo.codigo))
  await api('POST', `/amigos/${idCaio}/remover`, { token: ana.token })
  const semLigacao = await meusAmigos(ana.token)
  conferir('remover um amigo tira a amizade e as chamadas dele', semLigacao.amigos.every((a) => a.idJogador !== idCaio) && !semLigacao.partidasRecebidas.some((p) => p.codigo === deExAmigo.codigo))
  await api('POST', `/salas/${deExAmigo.codigo}/recusar`, { token: tokenCaio })

  // desistência e sorteio de cor
  const sala2 = (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'sorteio', amigo: idBia } })).json
  conferir('sorteio dá uma cor', sala2.cor === 'w' || sala2.cor === 'b', sala2.cor)
  await api('POST', `/salas/${sala2.codigo}/entrar`, { token: bia.token })
  const a = await conectar(sala2.codigo, ana.token)
  const b = await conectar(sala2.codigo, bia.token)
  await a.esperar((m) => m.t === 'estado')
  await b.esperar((m) => m.t === 'estado')
  a.enviar({ t: 'desistir' })
  const fimDesistencia = await b.esperar((m) => m.t === 'fim')
  conferir('desistir dá a vitória ao outro', fimDesistencia.motivo === 'desistencia' && fimDesistencia.resultado === (sala2.cor === 'w' ? 'pretas' : 'brancas'), JSON.stringify(fimDesistencia))
  a.fechar()
  b.fechar()

  // repetição: cavalos indo e voltando empatam na terceira vez
  const sala3 = (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w', amigo: idBia } })).json
  await api('POST', `/salas/${sala3.codigo}/entrar`, { token: bia.token })
  const c = await conectar(sala3.codigo, ana.token)
  const d = await conectar(sala3.codigo, bia.token)
  await c.esperar((m) => m.t === 'estado')
  await d.esperar((m) => m.t === 'estado')
  const giro = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'], ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]
  for (const [n, [de, para]] of giro.entries()) {
    ;(n % 2 === 0 ? c : d).enviar(lance(de, para, n))
    await c.esperar((m) => m.t === 'lance' && m.n === n)
    await d.esperar((m) => m.t === 'lance' && m.n === n)
  }
  const empate = await c.esperar((m) => m.t === 'fim')
  conferir('repetição de posição empata', empate.resultado === 'empate' && empate.motivo === 'repeticao', JSON.stringify(empate))
  c.fechar()
  d.fechar()

  // promoção: o peão escolhe a peça e o servidor confere
  const sala4 = (await api('POST', '/salas', { token: ana.token, corpo: { cor: 'w', amigo: idBia } })).json
  await api('POST', `/salas/${sala4.codigo}/entrar`, { token: bia.token })
  const e = await conectar(sala4.codigo, ana.token)
  const f = await conectar(sala4.codigo, bia.token)
  await e.esperar((m) => m.t === 'estado')
  await f.esperar((m) => m.t === 'estado')
  const caminho = [['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['h7', 'h6'], ['g5', 'h6'], ['g8', 'f6'], ['h6', 'h7'], ['f6', 'g8']]
  for (const [n, [de, para]] of caminho.entries()) {
    ;(n % 2 === 0 ? e : f).enviar(lance(de, para, n))
    await e.esperar((m) => m.t === 'lance' && m.n === n)
    await f.esperar((m) => m.t === 'lance' && m.n === n)
  }
  e.enviar(lance('h7', 'g8', 8))
  await e.esperar((m) => m.t === 'estado' && m.lances.length === 8)
  conferir('promoção sem dizer a peça é recusada', true)
  e.enviar(lance('h7', 'g8', 8, 'k'))
  await e.esperar((m) => m.t === 'estado' && m.lances.length === 8)
  conferir('promoção pra rei é recusada', true)
  e.enviar(lance('h7', 'g8', 8, 'n'))
  const promovido = await f.esperar((m) => m.t === 'lance' && m.n === 8)
  conferir('promoção à escolha chega ao adversário', promovido.promocao === 'n' && promovido.san.includes('=N'), promovido.san)
  e.enviar({ t: 'desistir' })
  await f.esperar((m) => m.t === 'fim')

  // "Novo jogo" numa partida amistosa chama o mesmo amigo
  conferir('quem não jogou a partida não pede outra', (await api('POST', `/salas/${sala4.codigo}/revanche`, { token: tokenCaio, corpo: { cor: 'w' } })).status === 403)
  conferir('cor inválida na revanche recusada', (await api('POST', `/salas/${sala4.codigo}/revanche`, { token: ana.token, corpo: { cor: 'x' } })).status === 422)
  const revanche = await api('POST', `/salas/${sala4.codigo}/revanche`, { token: ana.token, corpo: { cor: 'b' } })
  conferir('pede outra partida com o mesmo amigo', revanche.status === 201 && revanche.json?.cor === 'b' && revanche.json.codigo !== sala4.codigo, JSON.stringify(revanche.json))
  const avisoDaRevanche = await f.esperar((m) => m.t === 'revanche')
  conferir('o amigo fica sabendo na hora, pela partida aberta', avisoDaRevanche.codigo === revanche.json.codigo)
  await espera(300)
  conferir('quem pediu não recebe o próprio aviso', !e.mensagens.some((m) => m.t === 'revanche'))
  const aoMesmoTempo = await api('POST', `/salas/${sala4.codigo}/revanche`, { token: bia.token, corpo: { cor: 'b' } })
  conferir('se o outro pede também, entra na partida já aberta', aoMesmoTempo.json?.codigo === revanche.json.codigo && aoMesmoTempo.json?.cor === 'w', JSON.stringify(aoMesmoTempo.json))
  const g = await conectar(revanche.json.codigo, ana.token)
  conferir('a nova partida já começou', (await g.esperar((m) => m.t === 'estado')).status === 'andamento')
  g.enviar({ t: 'desistir' })
  await g.esperar((m) => m.t === 'fim')
  g.fechar()
  e.fechar()
  f.fechar()

  // a Ana levou mate, desistiu três vezes e empatou uma
  const perfilAna = (await api('GET', `/amigos/${idAna}`, { token: bia.token })).json
  const esperadoAna = { partidas: 5, vitorias: 0, derrotas: 4, empates: 1 }
  conferir('o perfil mostra o retrospecto do amigo', JSON.stringify(perfilAna.geral) === JSON.stringify(esperadoAna), JSON.stringify(perfilAna.geral))
  conferir('e o placar entre vocês', JSON.stringify(perfilAna.entreVoces) === JSON.stringify(esperadoAna), JSON.stringify(perfilAna.entreVoces))
  conferir('o perfil mostra nome, ID e data da conta', perfilAna.nome === nomeAna && perfilAna.idJogador === idAna && perfilAna.desde > 0)
  const perfilBia = (await api('GET', `/amigos/${idBia}`, { token: ana.token })).json
  conferir('o outro lado vê o placar invertido', perfilBia.entreVoces.vitorias === 4 && perfilBia.entreVoces.derrotas === 0, JSON.stringify(perfilBia.entreVoces))
  conferir('o perfil não entrega dados internos', !JSON.stringify(perfilAna).includes(ana.usuario.id) && !JSON.stringify(perfilAna).includes('hash'))

  // =================== perfil próprio ===================
  conferir('sem sessão não vê o perfil', (await api('GET', '/perfil')).status === 401)
  const meuPerfil = (await api('GET', '/perfil', { token: ana.token })).json
  conferir('o perfil traz nome, ID, data e o retrospecto', meuPerfil.nome === nomeAna && meuPerfil.idJogador === idAna && meuPerfil.desde > 0 && meuPerfil.geral.partidas === 5, JSON.stringify(meuPerfil.geral))
  conferir('conta nova não tem foto nem moldura', meuPerfil.avatar === null && meuPerfil.moldura === null)
  conferir('o perfil não entrega dados internos', !JSON.stringify(meuPerfil).includes(ana.usuario.id) && !JSON.stringify(meuPerfil).includes('hash'))

  const aparencia = (corpo, token = ana.token) => api('POST', '/perfil/aparencia', { token, corpo })
  conferir('sem sessão não muda a aparência', (await api('POST', '/perfil/aparencia', { corpo: { moldura: 'ouro' } })).status === 401)
  for (const avatar of ['inventado', '../../segredo', 'foto:123', '', 7]) conferir(`avatar fora da lista recusado: ${avatar}`, (await aparencia({ avatar })).status === 422)
  conferir('moldura fora da lista recusada', (await aparencia({ moldura: 'diamante-pago' })).status === 422)
  conferir('conta comum não tem tudo liberado', meuPerfil.tudoLiberado === false)
  const trancada = await aparencia({ avatar: 'rei-pretas', moldura: 'ouro' })
  conferir('molduras estão trancadas pra conta comum, mesmo chamando o servidor direto', trancada.status === 403 && trancada.json?.erro === 'moldura-bloqueada', String(trancada.status))
  conferir('e nada da mudança entra', (await api('GET', '/perfil', { token: ana.token })).json?.avatar === null)
  conferir('tirar a moldura qualquer um pode', (await aparencia({ moldura: 'nenhuma' })).status === 200)
  liberarTudo(nomeAna)
  conferir('ligada no banco, a conta passa a ter tudo liberado', (await api('GET', '/perfil', { token: ana.token })).json?.tudoLiberado === true)
  conferir('e aí escolhe avatar do jogo e moldura', (await aparencia({ avatar: 'rei-pretas', moldura: 'ouro' })).status === 200)
  conferir('a liberação é só dela', (await aparencia({ moldura: 'ouro' }, bia.token)).status === 403)
  const comAparencia = (await api('GET', '/perfil', { token: ana.token })).json
  conferir('fica salvo', comAparencia.avatar === 'rei-pretas' && comAparencia.moldura === 'ouro')
  conferir('o amigo vê na lista', (await meusAmigos(bia.token)).amigos.some((a) => a.idJogador === idAna && a.avatar === 'rei-pretas' && a.moldura === 'ouro'))
  const perfilComAparencia = (await api('GET', `/amigos/${idAna}`, { token: bia.token })).json
  conferir('e no perfil', perfilComAparencia.avatar === 'rei-pretas' && perfilComAparencia.moldura === 'ouro')

  const verFoto = (id) => fetch(`${API}/fotos/${id}`, { headers: { Origin: ORIGEM } })
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(600)])
  const mandarFoto = (foto, token = ana.token) => api('POST', '/perfil/foto', { token, corpo: { foto } })
  conferir('sem foto, o endereço dá 404', (await verFoto(idAna)).status === 404)
  conferir('sem sessão não envia foto', (await api('POST', '/perfil/foto', { corpo: { foto: jpeg.toString('base64') } })).status === 401)
  const naoFoto = {
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64'),
    png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString('base64'),
    'endereço de dados': `data:image/svg+xml;base64,${jpeg.toString('base64')}`,
    'caracteres inválidos': `/9j/<script>alert(1)</script>`,
    'grande demais': Buffer.concat([jpeg, Buffer.alloc(50000, 7)]).toString('base64'),
    número: 123,
  }
  for (const [nome, foto] of Object.entries(naoFoto)) conferir(`foto recusada: ${nome}`, (await mandarFoto(foto)).status === 422)
  const enviou = await mandarFoto(jpeg.toString('base64'))
  conferir('aceita o JPEG e passa a usar a foto', enviou.status === 200 && /^foto:\d+$/.test(enviou.json?.avatar ?? ''), enviou.json?.avatar)
  const servida = await verFoto(idAna)
  const bytes = Buffer.from(await servida.arrayBuffer())
  conferir('a foto volta igual, como imagem', servida.status === 200 && servida.headers.get('Content-Type') === 'image/jpeg' && bytes.equals(jpeg))
  conferir('e o navegador não pode tratar como outra coisa', servida.headers.get('X-Content-Type-Options') === 'nosniff')
  conferir('o amigo recebe a versão nova da foto', (await meusAmigos(bia.token)).amigos.some((a) => a.idJogador === idAna && a.avatar === enviou.json.avatar))
  conferir('ID que não existe não tem foto', (await verFoto('AAAAAAAA')).status === 404)
  await aparencia({ avatar: 'peao-brancas' })
  conferir('voltar pra um avatar do jogo apaga a foto', (await verFoto(idAna)).status === 404)
  await aparencia({ moldura: 'nenhuma' })

  let limitouFoto = false
  for (let i = 0; i < 25 && !limitouFoto; i++) limitouFoto = (await mandarFoto(jpeg.toString('base64'), bia.token)).status === 429
  conferir('fotos demais numa hora são barradas', limitouFoto)

  // limite de convites por hora
  let limitou = false
  for (let i = 0; i < 40 && !limitou; i++) limitou = (await convidar(impostor.token, `Ninguem ${i}`)).status === 429
  conferir('convites demais numa hora são barrados', limitou)

  // apagar a conta
  await convidar(tokenCaio, idBia)
  await convidar(bia.token, idCaio)
  conferir('amizade feita pra testar a exclusão', (await meusAmigos(bia.token)).amigos.some((a) => a.idJogador === idCaio))
  await mandarFoto(jpeg.toString('base64'), tokenCaio)
  conferir('foto feita pra testar a exclusão', (await verFoto(idCaio)).status === 200)
  const tchau = await api('POST', '/contas/excluir', { token: tokenCaio, corpo: { chave: derivar(nomeCaio, 'errada') } })
  conferir('excluir a conta exige a senha', tchau.status === 401)
  const excluiu = await api('POST', '/contas/excluir', { token: tokenCaio, corpo: { chave: derivar(nomeCaio, 'nova-senha') } })
  conferir('a pessoa pode excluir a própria conta', excluiu.status === 200)
  await espera(50)
  conferir('a sessão morre junto', (await api('GET', '/eu', { token: tokenCaio })).status === 401)
  conferir('a foto some junto', (await verFoto(idCaio)).status === 404)
  conferir('quem saiu some da lista dos amigos', !(await meusAmigos(bia.token)).amigos.some((a) => a.idJogador === idCaio))
} catch (erro) {
  falhas++
  console.log('FALHOU (parou):', erro.message)
}

console.log(falhas ? `\n${falhas} FALHA(S), ${certos} certos` : `\nTUDO OK (${certos} verificações)`)
process.exit(falhas ? 1 : 0)
