// Servidor público do Xadrez Caótico, na Cloudflare: contas, partidas salvas de cada pessoa e as salas
// de partida entre duas pessoas (ver sala.ts). O site fica no GitHub Pages e fala com este endereço.

import {
  chaveValida,
  codigoNormalizado,
  conferirSemConta,
  criarSessao,
  encerrarSessao,
  limpezaDiaria,
  nomeDeBusca,
  nomeValido,
  novoCodigoDeRecuperacao,
  protegerSegredo,
  segredoConfere,
  somarTentativa,
  tentativasFeitas,
  usuarioDoToken,
  type Usuario,
} from './conta'
import type { Sala } from './sala'

export { Sala } from './sala'

export interface Ambiente {
  DB: D1Database
  SALAS: DurableObjectNamespace<Sala>
  PIMENTA: string
  ORIGENS: string
  /** Só no simulador (.dev.vars): os testes criam mais contas que uma pessoa criaria. */
  LIMITE_CONTAS?: string
}

const LIMITE_CORPO = 256 * 1024
const STORES = ['xadrezPartidas', 'xadrezAprendizado']
const MAXIMO_NO_LOTE = 200
const MAXIMO_POR_REGISTRO = 16 * 1024
const MAXIMO_REGISTROS_POR_PESSOA = 20000
const REGISTROS_POR_PAGINA = 1000
const CONVITES_ABERTOS_POR_PESSOA = 10
const SALAS_NA_LISTA = 30
const MAXIMO_DE_AMIGOS = 200
const LIGACOES_NA_LISTA = 300
const PARTIDAS_RECEBIDAS_NA_LISTA = 20
const CONVITES_DE_AMIZADE_POR_HORA = 30
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const TAMANHO_CODIGO = 8

const QUINZE_MINUTOS = 15 * 60 * 1000
const UMA_HORA = 60 * 60 * 1000
const ERROS_POR_ENDERECO = 20
const ERROS_POR_CONTA = 10
const CONTAS_POR_ENDERECO = 5
const RECUPERACOES_POR_ENDERECO = 5

class Falha extends Error {
  status: number
  constructor(status: number, codigo: string) {
    super(codigo)
    this.status = status
  }
}

function origemPermitida(pedido: Request, env: Ambiente): string | null {
  const origem = pedido.headers.get('Origin')
  return origem && env.ORIGENS.split(',').includes(origem) ? origem : null
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function comCors(resposta: Response, origem: string | null): Response {
  if (!origem || resposta.status === 101) return resposta
  const nova = new Response(resposta.body, resposta)
  nova.headers.set('Access-Control-Allow-Origin', origem)
  nova.headers.set('Vary', 'Origin')
  return nova
}

async function lerCorpo<T>(pedido: Request): Promise<T> {
  const texto = await pedido.text()
  if (texto.length > LIMITE_CORPO) throw new Falha(413, 'grande-demais')
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Falha(400, 'json-invalido')
  }
}

const tokenDoCabecalho = (pedido: Request) => pedido.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null

async function exigirUsuario(pedido: Request, env: Ambiente): Promise<Usuario> {
  const usuario = await usuarioDoToken(env, tokenDoCabecalho(pedido))
  if (!usuario) throw new Falha(401, 'sessao')
  return usuario
}

const enderecoDe = (pedido: Request) => pedido.headers.get('CF-Connecting-IP') ?? 'local'

/** Código das salas e ID público dos jogadores: curtos, sem letras que se confundem. */
function novoCodigo(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(TAMANHO_CODIGO)), (b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('')
}

// --- contas ------------------------------------------------------------------------------
async function criarConta(pedido: Request, env: Ambiente) {
  const { nome, chave } = await lerCorpo<{ nome?: unknown; chave?: unknown }>(pedido)
  if (!nomeValido(nome)) throw new Falha(422, 'nome-invalido')
  if (!chaveValida(chave)) throw new Falha(422, 'chave-invalida')
  const limiteDeContas = Number(env.LIMITE_CONTAS ?? CONTAS_POR_ENDERECO)
  if ((await somarTentativa(env, `conta:${enderecoDe(pedido)}`, UMA_HORA)) > limiteDeContas) throw new Falha(429, 'muitas-tentativas')

  const id = crypto.randomUUID()
  const senha = await protegerSegredo(env, chave)
  const codigoRecuperacao = novoCodigoDeRecuperacao()
  const recuperacao = await protegerSegredo(env, codigoNormalizado(codigoRecuperacao))
  try {
    await env.DB.prepare('INSERT INTO usuarios (id, id_jogador, nome, nome_busca, sal, hash, sal_recuperacao, hash_recuperacao, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
      .bind(id, novoCodigo(), nome.trim(), nomeDeBusca(nome), senha.sal, senha.hash, recuperacao.sal, recuperacao.hash, Date.now())
      .run()
  } catch (erro) {
    if (String(erro).includes('UNIQUE')) throw new Falha(409, 'nome-em-uso')
    throw erro
  }
  return responder({ token: await criarSessao(env, id), usuario: { id, nome: nome.trim() }, codigoRecuperacao }, 201)
}

async function entrarNaConta(pedido: Request, env: Ambiente) {
  const { nome, chave } = await lerCorpo<{ nome?: unknown; chave?: unknown }>(pedido)
  if (!nomeValido(nome) || !chaveValida(chave)) throw new Falha(401, 'credenciais')

  const porEndereco = `erro:${enderecoDe(pedido)}`
  const porConta = `erro-conta:${nomeDeBusca(nome)}`
  if ((await tentativasFeitas(env, porEndereco)) >= ERROS_POR_ENDERECO || (await tentativasFeitas(env, porConta)) >= ERROS_POR_CONTA) {
    throw new Falha(429, 'muitas-tentativas')
  }

  const conta = await env.DB.prepare('SELECT id, nome, sal, hash FROM usuarios WHERE nome_busca = ?1')
    .bind(nomeDeBusca(nome))
    .first<{ id: string; nome: string; sal: string; hash: string }>()
  if (!conta) await conferirSemConta(env, chave)
  if (!conta || !(await segredoConfere(env, chave, conta.sal, conta.hash))) {
    await somarTentativa(env, porEndereco, QUINZE_MINUTOS)
    await somarTentativa(env, porConta, QUINZE_MINUTOS)
    throw new Falha(401, 'credenciais')
  }
  return responder({ token: await criarSessao(env, conta.id), usuario: { id: conta.id, nome: conta.nome } })
}

/** Sem e-mail: quem perde a senha usa o código mostrado ao criar a conta, e recebe outro. */
async function recuperarConta(pedido: Request, env: Ambiente) {
  const { nome, codigo, chaveNova } = await lerCorpo<{ nome?: unknown; codigo?: unknown; chaveNova?: unknown }>(pedido)
  if (!nomeValido(nome) || typeof codigo !== 'string' || !chaveValida(chaveNova)) throw new Falha(401, 'credenciais')
  if ((await somarTentativa(env, `recuperar:${enderecoDe(pedido)}`, UMA_HORA)) > RECUPERACOES_POR_ENDERECO) throw new Falha(429, 'muitas-tentativas')

  const conta = await env.DB.prepare('SELECT id, nome, sal_recuperacao, hash_recuperacao FROM usuarios WHERE nome_busca = ?1')
    .bind(nomeDeBusca(nome))
    .first<{ id: string; nome: string; sal_recuperacao: string; hash_recuperacao: string }>()
  const normalizado = codigoNormalizado(codigo)
  if (!conta) await conferirSemConta(env, normalizado)
  if (!conta || !(await segredoConfere(env, normalizado, conta.sal_recuperacao, conta.hash_recuperacao))) throw new Falha(401, 'credenciais')

  const senha = await protegerSegredo(env, chaveNova)
  const codigoRecuperacao = novoCodigoDeRecuperacao()
  const recuperacao = await protegerSegredo(env, codigoNormalizado(codigoRecuperacao))
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET sal = ?1, hash = ?2, sal_recuperacao = ?3, hash_recuperacao = ?4 WHERE id = ?5').bind(senha.sal, senha.hash, recuperacao.sal, recuperacao.hash, conta.id),
    env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?1').bind(conta.id),
  ])
  return responder({ token: await criarSessao(env, conta.id), usuario: { id: conta.id, nome: conta.nome }, codigoRecuperacao })
}

async function excluirConta(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { chave } = await lerCorpo<{ chave?: unknown }>(pedido)
  if (!chaveValida(chave)) throw new Falha(401, 'credenciais')
  const conta = await env.DB.prepare('SELECT sal, hash FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ sal: string; hash: string }>()
  if (!conta || !(await segredoConfere(env, chave, conta.sal, conta.hash))) throw new Falha(401, 'credenciais')
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?1').bind(usuario.id),
    env.DB.prepare('DELETE FROM registros WHERE usuario_id = ?1').bind(usuario.id),
    env.DB.prepare('DELETE FROM amizades WHERE solicitante_id = ?1 OR destinatario_id = ?1').bind(usuario.id),
    // na lista do adversário a partida continua, sem o nome de quem saiu
    env.DB.prepare("UPDATE salas SET brancas_nome = '—', brancas_id = NULL WHERE brancas_id = ?1").bind(usuario.id),
    env.DB.prepare("UPDATE salas SET pretas_nome = '—', pretas_id = NULL WHERE pretas_id = ?1").bind(usuario.id),
    env.DB.prepare('DELETE FROM salas WHERE criador_id = ?1 AND (brancas_id IS NULL OR pretas_id IS NULL)').bind(usuario.id),
    env.DB.prepare('UPDATE salas SET criador_id = COALESCE(brancas_id, pretas_id) WHERE criador_id = ?1').bind(usuario.id),
    env.DB.prepare('DELETE FROM usuarios WHERE id = ?1').bind(usuario.id),
  ])
  return responder({ ok: true })
}

// --- partidas salvas ---------------------------------------------------------------------
async function listarRegistros(pedido: Request, env: Ambiente, url: URL) {
  const usuario = await exigirUsuario(pedido, env)
  const desde = Number(url.searchParams.get('desde') ?? 0) || 0
  const { results } = await env.DB.prepare('SELECT store, dados, atualizado_em FROM registros WHERE usuario_id = ?1 AND atualizado_em > ?2 ORDER BY atualizado_em LIMIT ?3')
    .bind(usuario.id, desde, REGISTROS_POR_PAGINA)
    .all<{ store: string; dados: string; atualizado_em: number }>()
  return responder({
    registros: results.map((r) => ({ store: r.store, dados: JSON.parse(r.dados), atualizadoEm: r.atualizado_em })),
    fim: results.length < REGISTROS_POR_PAGINA,
  })
}

async function gravarRegistros(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { registros } = await lerCorpo<{ registros?: { store?: unknown; dados?: { id?: unknown } }[] }>(pedido)
  if (!Array.isArray(registros) || registros.length > MAXIMO_NO_LOTE) throw new Falha(422, 'lote-invalido')

  const agora = Date.now()
  const instrucoes = registros.map(({ store, dados }) => {
    const id = dados?.id
    const texto = JSON.stringify(dados)
    if (typeof store !== 'string' || !STORES.includes(store) || typeof id !== 'string' || !id || id.length > 200 || texto.length > MAXIMO_POR_REGISTRO) {
      throw new Falha(422, 'lote-invalido')
    }
    return env.DB.prepare(
      `INSERT INTO registros (usuario_id, store, id, dados, atualizado_em) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(usuario_id, store, id) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em`,
    ).bind(usuario.id, store, id, texto, agora)
  })

  // contar custa uma leitura por registro: confere de vez em quando, o que basta pra segurar abuso
  if (Math.random() < 0.05) {
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM registros WHERE usuario_id = ?1').bind(usuario.id).first<{ n: number }>()
    if ((total?.n ?? 0) > MAXIMO_REGISTROS_POR_PESSOA) throw new Falha(507, 'limite-de-dados')
  }
  if (instrucoes.length > 0) await env.DB.batch(instrucoes)
  return responder({ gravados: instrucoes.length, atualizadoEm: agora })
}

// --- amigos ------------------------------------------------------------------------------
const jogadorPublico = (linha: { id_jogador: string; nome: string }) => ({ idJogador: linha.id_jogador, nome: linha.nome })

async function listarAmigos(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const [eu, ligacoes, chamadas] = await Promise.all([
    env.DB.prepare('SELECT id_jogador FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ id_jogador: string }>(),
    env.DB.prepare(
      `SELECT u.id, u.id_jogador, u.nome, a.solicitante_id, a.status FROM amizades a
       JOIN usuarios u ON u.id = CASE a.solicitante_id WHEN ?1 THEN a.destinatario_id ELSE a.solicitante_id END
       WHERE a.solicitante_id = ?1 OR a.destinatario_id = ?1 ORDER BY a.status = 'aceita' DESC, u.nome_busca LIMIT ?2`,
    )
      .bind(usuario.id, LIGACOES_NA_LISTA)
      .all<{ id: string; id_jogador: string; nome: string; solicitante_id: string; status: string }>(),
    env.DB.prepare(
      `SELECT codigo, criador_id, brancas_id FROM salas
       WHERE (brancas_id = ?1 OR pretas_id = ?1) AND status = 'aguardando' AND criador_id <> ?1 ORDER BY criada_em DESC LIMIT ?2`,
    )
      .bind(usuario.id, PARTIDAS_RECEBIDAS_NA_LISTA)
      .all<{ codigo: string; criador_id: string; brancas_id: string }>(),
  ])
  const amigos = ligacoes.results.filter((l) => l.status === 'aceita')
  const pendentes = ligacoes.results.filter((l) => l.status === 'pendente')
  return responder({
    meuId: eu?.id_jogador,
    amigos: amigos.map(jogadorPublico),
    convitesRecebidos: pendentes.filter((l) => l.solicitante_id !== usuario.id).map(jogadorPublico),
    convitesEnviados: pendentes.filter((l) => l.solicitante_id === usuario.id).map(jogadorPublico),
    // quem deixou de ser amigo não chama mais: a sala fica lá até expirar
    partidasRecebidas: chamadas.results.flatMap((s) => {
      const amigo = amigos.find((a) => a.id === s.criador_id)
      return amigo ? [{ ...jogadorPublico(amigo), codigo: s.codigo, minhaCor: s.brancas_id === usuario.id ? 'w' : 'b' }] : []
    }),
  })
}

async function convidarAmigo(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { busca } = await lerCorpo<{ busca?: unknown }>(pedido)
  if (typeof busca !== 'string' || busca.length > 40) throw new Falha(422, 'busca-invalida')
  if ((await somarTentativa(env, `amigo:${usuario.id}`, UMA_HORA)) > CONVITES_DE_AMIZADE_POR_HORA) throw new Falha(429, 'muitas-tentativas')

  // o nome precisa ser exato, pra busca não servir de lista de jogadores; um nome igual ao ID de alguém perde pro ID
  const alvo = await env.DB.prepare('SELECT id, id_jogador, nome FROM usuarios WHERE id_jogador = ?1 OR nome_busca = ?2 ORDER BY id_jogador = ?1 DESC LIMIT 1')
    .bind(codigoNormalizado(busca), nomeDeBusca(busca))
    .first<{ id: string; id_jogador: string; nome: string }>()
  if (!alvo) throw new Falha(404, 'jogador-nao-encontrado')
  if (alvo.id === usuario.id) throw new Falha(422, 'voce-mesmo')

  const ligacao = await env.DB.prepare('SELECT solicitante_id, status FROM amizades WHERE (solicitante_id = ?1 AND destinatario_id = ?2) OR (solicitante_id = ?2 AND destinatario_id = ?1)')
    .bind(usuario.id, alvo.id)
    .first<{ solicitante_id: string; status: string }>()
  if (ligacao?.status === 'aceita') throw new Falha(409, 'ja-amigos')
  if (ligacao?.solicitante_id === usuario.id) return responder({ ...jogadorPublico(alvo), status: 'pendente' })

  // convites recebidos não contam: senão daria pra encher a lista de alguém e travar a conta dessa pessoa
  const ocupados = await env.DB.prepare("SELECT COUNT(*) AS n FROM amizades WHERE solicitante_id = ?1 OR (destinatario_id = ?1 AND status = 'aceita')").bind(usuario.id).first<{ n: number }>()
  if ((ocupados?.n ?? 0) >= MAXIMO_DE_AMIGOS) throw new Falha(409, 'muitos-amigos')

  // o outro já tinha convidado: os dois querem, então aceitar é convidar de volta
  if (ligacao) {
    await env.DB.prepare("UPDATE amizades SET status = 'aceita' WHERE solicitante_id = ?1 AND destinatario_id = ?2").bind(alvo.id, usuario.id).run()
    return responder({ ...jogadorPublico(alvo), status: 'aceita' })
  }
  await env.DB.prepare("INSERT INTO amizades (solicitante_id, destinatario_id, status, criada_em) VALUES (?1, ?2, 'pendente', ?3) ON CONFLICT DO NOTHING").bind(usuario.id, alvo.id, Date.now()).run()
  return responder({ ...jogadorPublico(alvo), status: 'pendente' }, 201)
}

/** Remover um amigo, recusar um convite recebido e cancelar um enviado são a mesma coisa: a ligação some. */
async function removerAmigo(pedido: Request, env: Ambiente, idJogador: string) {
  const usuario = await exigirUsuario(pedido, env)
  await env.DB.prepare(
    `DELETE FROM amizades WHERE (solicitante_id = ?1 AND destinatario_id = (SELECT id FROM usuarios WHERE id_jogador = ?2))
       OR (destinatario_id = ?1 AND solicitante_id = (SELECT id FROM usuarios WHERE id_jogador = ?2))`,
  )
    .bind(usuario.id, idJogador)
    .run()
  return responder({ ok: true })
}

/** Só amizade aceita chega aqui: é o que protege o perfil e as partidas amistosas. */
function amigoPeloId(env: Ambiente, usuarioId: string, idJogador: string) {
  return env.DB.prepare(
    `SELECT u.id, u.id_jogador, u.nome, u.criado_em FROM usuarios u
     JOIN amizades a ON a.status = 'aceita' AND ((a.solicitante_id = ?1 AND a.destinatario_id = u.id) OR (a.destinatario_id = ?1 AND a.solicitante_id = u.id))
     WHERE u.id_jogador = ?2`,
  )
    .bind(usuarioId, idJogador)
    .first<{ id: string; id_jogador: string; nome: string; criado_em: number }>()
}

const RETROSPECTO = `SELECT COUNT(*) AS partidas, COALESCE(SUM(resultado = 'empate'), 0) AS empates,
  COALESCE(SUM((resultado = 'brancas' AND brancas_id = ?1) OR (resultado = 'pretas' AND pretas_id = ?1)), 0) AS vitorias
  FROM salas WHERE status = 'fim' AND (brancas_id = ?1 OR pretas_id = ?1)`

type Retrospecto = { partidas: number; empates: number; vitorias: number }
const comDerrotas = (r: Retrospecto | null) => {
  const { partidas, empates, vitorias } = r ?? { partidas: 0, empates: 0, vitorias: 0 }
  return { partidas, vitorias, derrotas: partidas - vitorias - empates, empates }
}

async function verPerfil(pedido: Request, env: Ambiente, idJogador: string) {
  const usuario = await exigirUsuario(pedido, env)
  const amigo = await amigoPeloId(env, usuario.id, idJogador)
  if (!amigo) throw new Falha(403, 'nao-e-amigo')
  const [geral, entreVoces] = await Promise.all([
    env.DB.prepare(RETROSPECTO).bind(amigo.id).first<Retrospecto>(),
    env.DB.prepare(`${RETROSPECTO} AND (brancas_id = ?2 OR pretas_id = ?2)`).bind(amigo.id, usuario.id).first<Retrospecto>(),
  ])
  return responder({ ...jogadorPublico(amigo), desde: amigo.criado_em, geral: comDerrotas(geral), entreVoces: comDerrotas(entreVoces) })
}

// --- salas -------------------------------------------------------------------------------
const stubDaSala = (env: Ambiente, codigo: string) => env.SALAS.get(env.SALAS.idFromName(codigo))
const codigoDeSalaValido = (codigo: string) => /^[A-Z2-9]{8}$/.test(codigo)

async function criarSala(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { cor, amigo } = await lerCorpo<{ cor?: unknown; amigo?: unknown }>(pedido)
  if (cor !== 'w' && cor !== 'b' && cor !== 'sorteio') throw new Falha(422, 'cor-invalida')
  const linhaDoAmigo = typeof amigo === 'string' ? await amigoPeloId(env, usuario.id, amigo) : null
  if (!linhaDoAmigo) throw new Falha(403, 'nao-e-amigo')
  const convidado: Usuario = { id: linhaDoAmigo.id, nome: linhaDoAmigo.nome }

  // chamar de novo quem ainda não respondeu volta pra mesma partida
  const aberta = await env.DB.prepare("SELECT codigo, brancas_id FROM salas WHERE criador_id = ?1 AND status = 'aguardando' AND (brancas_id = ?2 OR pretas_id = ?2)")
    .bind(usuario.id, convidado.id)
    .first<{ codigo: string; brancas_id: string }>()
  if (aberta) return responder({ codigo: aberta.codigo, cor: aberta.brancas_id === usuario.id ? 'w' : 'b' })

  const abertos = await env.DB.prepare("SELECT COUNT(*) AS n FROM salas WHERE criador_id = ?1 AND status = 'aguardando'").bind(usuario.id).first<{ n: number }>()
  if ((abertos?.n ?? 0) >= CONVITES_ABERTOS_POR_PESSOA) throw new Falha(429, 'muitos-convites')

  const minhaCor = cor === 'sorteio' ? (crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'w' : 'b') : cor
  const [brancas, pretas] = minhaCor === 'w' ? [usuario, convidado] : [convidado, usuario]
  const codigo = novoCodigo()
  const agora = Date.now()
  await env.DB.prepare(
    `INSERT INTO salas (codigo, criador_id, brancas_id, pretas_id, brancas_nome, pretas_nome, status, criada_em, atualizada_em)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'aguardando', ?7, ?7)`,
  )
    .bind(codigo, usuario.id, brancas.id, pretas.id, brancas.nome, pretas.nome, agora)
    .run()
  await stubDaSala(env, codigo).criar(codigo, brancas, pretas, minhaCor)
  return responder({ codigo, cor: minhaCor }, 201)
}

async function entrarNaSala(pedido: Request, env: Ambiente, codigo: string) {
  const usuario = await exigirUsuario(pedido, env)
  if (!codigoDeSalaValido(codigo)) throw new Falha(404, 'sala-nao-existe')
  if ((await somarTentativa(env, `sala:${usuario.id}`, UMA_HORA)) > 60) throw new Falha(429, 'muitas-tentativas')
  const resultado = await stubDaSala(env, codigo).entrar(usuario)
  if (!resultado.ok) throw new Falha(resultado.erro === 'sala-nao-existe' ? 404 : 409, resultado.erro)
  return responder({ codigo, cor: resultado.cor })
}

async function recusarSala(pedido: Request, env: Ambiente, codigo: string) {
  const usuario = await exigirUsuario(pedido, env)
  if (codigoDeSalaValido(codigo)) await stubDaSala(env, codigo).recusar(usuario.id)
  return responder({ ok: true })
}

/** Partida que o amigo chamou e ainda não foi aceita fica de fora: ela aparece em `partidasRecebidas`. */
async function listarSalas(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { results } = await env.DB.prepare(
    `SELECT codigo, brancas_id, brancas_nome, pretas_nome, status, resultado, motivo, atualizada_em FROM salas
     WHERE (brancas_id = ?1 OR pretas_id = ?1) AND (status <> 'aguardando' OR criador_id = ?1) ORDER BY atualizada_em DESC LIMIT ?2`,
  )
    .bind(usuario.id, SALAS_NA_LISTA)
    .all<{ codigo: string; brancas_id: string | null; brancas_nome: string | null; pretas_nome: string | null; status: string; resultado: string | null; motivo: string | null; atualizada_em: number }>()
  return responder({
    salas: results.map((s) => ({
      codigo: s.codigo,
      minhaCor: s.brancas_id === usuario.id ? 'w' : 'b',
      brancas: s.brancas_nome,
      pretas: s.pretas_nome,
      status: s.status,
      resultado: s.resultado,
      motivo: s.motivo,
      atualizadaEm: s.atualizada_em,
    })),
  })
}

/** O navegador não deixa pôr cabeçalho em WebSocket: o token vem como subprotocolo, fora da URL e dos registros de acesso. */
async function conectarNaSala(pedido: Request, env: Ambiente, codigo: string) {
  if (pedido.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new Falha(426, 'precisa-websocket')
  const origem = pedido.headers.get('Origin')
  if (!origem || !env.ORIGENS.split(',').includes(origem)) throw new Falha(403, 'origem-nao-permitida')
  const [protocolo, token] = (pedido.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim())
  if (protocolo !== 'xadrez') throw new Falha(401, 'sessao')
  const usuario = await usuarioDoToken(env, token ?? null)
  if (!usuario) throw new Falha(401, 'sessao')
  if (!codigoDeSalaValido(codigo)) throw new Falha(404, 'sala-nao-existe')

  const repasse = new Request(pedido)
  repasse.headers.set('X-Usuario-Id', usuario.id)
  repasse.headers.delete('Sec-WebSocket-Protocol')
  return stubDaSala(env, codigo).fetch(repasse)
}

// --- rotas -------------------------------------------------------------------------------
async function rotear(pedido: Request, env: Ambiente, url: URL): Promise<Response> {
  const { pathname: caminho } = url
  const metodo = pedido.method
  const sala = caminho.match(/^\/salas\/([^/]+)(\/entrar|\/recusar|\/ws)?$/)
  const amigo = caminho.match(/^\/amigos\/([A-Z2-9]{8})(\/remover)?$/)

  if (metodo === 'GET' && caminho === '/saude') return responder({ ok: true, jogo: 'xadrez-caotico' })
  if (metodo === 'POST' && caminho === '/contas') return criarConta(pedido, env)
  if (metodo === 'POST' && caminho === '/contas/recuperar') return recuperarConta(pedido, env)
  if (metodo === 'POST' && caminho === '/contas/excluir') return excluirConta(pedido, env)
  if (metodo === 'POST' && caminho === '/sessoes') return entrarNaConta(pedido, env)
  if (metodo === 'POST' && caminho === '/sessoes/sair') {
    const token = tokenDoCabecalho(pedido)
    if (token) await encerrarSessao(env, token)
    return responder({ ok: true })
  }
  if (metodo === 'GET' && caminho === '/eu') return responder({ usuario: await exigirUsuario(pedido, env) })
  if (metodo === 'GET' && caminho === '/registros') return listarRegistros(pedido, env, url)
  if (metodo === 'POST' && caminho === '/registros') return gravarRegistros(pedido, env)
  if (metodo === 'GET' && caminho === '/amigos') return listarAmigos(pedido, env)
  if (metodo === 'POST' && caminho === '/amigos') return convidarAmigo(pedido, env)
  if (amigo && metodo === 'GET' && !amigo[2]) return verPerfil(pedido, env, amigo[1])
  if (amigo && metodo === 'POST' && amigo[2]) return removerAmigo(pedido, env, amigo[1])
  if (metodo === 'GET' && caminho === '/salas') return listarSalas(pedido, env)
  if (metodo === 'POST' && caminho === '/salas') return criarSala(pedido, env)
  if (sala && metodo === 'POST' && sala[2] === '/entrar') return entrarNaSala(pedido, env, sala[1])
  if (sala && metodo === 'POST' && sala[2] === '/recusar') return recusarSala(pedido, env, sala[1])
  if (sala && metodo === 'GET' && sala[2] === '/ws') return conectarNaSala(pedido, env, sala[1])
  throw new Falha(404, 'nao-encontrado')
}

export default {
  async fetch(pedido: Request, env: Ambiente): Promise<Response> {
    const origem = origemPermitida(pedido, env)
    if (pedido.method === 'OPTIONS') {
      if (!origem) return new Response(null, { status: 403 })
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origem,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        },
      })
    }
    try {
      return comCors(await rotear(pedido, env, new URL(pedido.url)), origem)
    } catch (erro) {
      if (erro instanceof Falha) return comCors(responder({ erro: erro.message }, erro.status), origem)
      console.error(erro)
      return comCors(responder({ erro: 'erro-interno' }, 500), origem)
    }
  },

  async scheduled(_evento: ScheduledController, env: Ambiente) {
    await limpezaDiaria(env)
  },
} satisfies ExportedHandler<Ambiente>
