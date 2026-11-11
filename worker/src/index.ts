// Servidor público do Xadrez Caótico, na Cloudflare: contas, partidas salvas de cada pessoa e as salas
// de partida entre duas pessoas (ver sala.ts). O site fica no GitHub Pages e fala com este endereço.

import {
  chaveValida,
  codigoNormalizado,
  conferirSemConta,
  criarSessao,
  deBase64,
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
import aparencia from '../../src/conta/aparencia.json'
import personalizacao from '../../src/conta/personalizacao.json'
import conquistas from '../../src/chess/conquistas.json'

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
const MAXIMO_FOTO_BASE64 = 60 * 1024
const FOTOS_POR_HORA = 20
const FOTO_NO_CACHE_S = 7 * 24 * 60 * 60
const RECEBIMENTOS_POR_HORA = 30
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const TAMANHO_CODIGO = 8
/** O código do convite por link: secreto, então mais longo que o ID (31^12, uns 59 bits). */
const TAMANHO_CONVITE = 12
const CONSULTAS_DE_CONVITE_POR_HORA = 60
/** O aparelho avisa a cada minuto; sem aviso há dois minutos e meio, o amigo está fora. */
const ONLINE_MS = 150 * 1000
/** Grava a presença no máximo a cada 45 s, pra cada aviso custar no máximo uma escrita. */
const PRESENCA_GRAVA_MS = 45 * 1000
const MAXIMO_NA_CONTAGEM = 10_000_000

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

/** Código das salas, ID público dos jogadores e código de convite: sem letras que se confundem. */
function novoCodigo(tamanho = TAMANHO_CODIGO): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(tamanho)), (b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('')
}

const FORMATO_CONVITE = new RegExp(`^[${ALFABETO_CODIGO}]{${TAMANHO_CONVITE}}$`)
const conviteValido = (codigo: unknown): codigo is string => typeof codigo === 'string' && FORMATO_CONVITE.test(codigo)

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
    env.DB.prepare('DELETE FROM fotos WHERE usuario_id = ?1').bind(usuario.id),
    env.DB.prepare('DELETE FROM conquistas WHERE usuario_id = ?1').bind(usuario.id),
    env.DB.prepare('DELETE FROM itens WHERE usuario_id = ?1').bind(usuario.id),
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
interface LinhaDeJogador {
  id_jogador: string
  nome: string
  avatar: string | null
  moldura: string | null
}

const jogadorPublico = (linha: LinhaDeJogador) => ({ idJogador: linha.id_jogador, nome: linha.nome, avatar: linha.avatar, moldura: linha.moldura })
const estaOnline = (vistoEm: number | null) => (vistoEm ?? 0) > Date.now() - ONLINE_MS

async function listarAmigos(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const [eu, ligacoes, chamadas] = await Promise.all([
    env.DB.prepare('SELECT id_jogador, codigo_convite FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ id_jogador: string; codigo_convite: string | null }>(),
    env.DB.prepare(
      `SELECT u.id, u.id_jogador, u.nome, u.avatar, u.moldura, u.visto_em, a.solicitante_id, a.status FROM amizades a
       JOIN usuarios u ON u.id = CASE a.solicitante_id WHEN ?1 THEN a.destinatario_id ELSE a.solicitante_id END
       WHERE a.solicitante_id = ?1 OR a.destinatario_id = ?1 ORDER BY a.status = 'aceita' DESC, u.nome_busca LIMIT ?2`,
    )
      .bind(usuario.id, LIGACOES_NA_LISTA)
      .all<LinhaDeJogador & { id: string; visto_em: number | null; solicitante_id: string; status: string }>(),
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
    meuConvite: eu?.codigo_convite ?? (await sortearConvite(env, usuario.id)),
    // só amigo aceito vê se a pessoa está com o jogo aberto
    amigos: amigos.map((amigo) => ({ ...jogadorPublico(amigo), online: estaOnline(amigo.visto_em) })),
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
  const alvo = await env.DB.prepare('SELECT id, id_jogador, nome, avatar, moldura FROM usuarios WHERE id_jogador = ?1 OR nome_busca = ?2 ORDER BY id_jogador = ?1 DESC LIMIT 1')
    .bind(codigoNormalizado(busca), nomeDeBusca(busca))
    .first<LinhaDeJogador & { id: string }>()
  if (!alvo) throw new Falha(404, 'jogador-nao-encontrado')
  if (alvo.id === usuario.id) throw new Falha(422, 'voce-mesmo')

  const ligacao = await ligacaoEntre(env, usuario.id, alvo.id)
  if (ligacao?.status === 'aceita') throw new Falha(409, 'ja-amigos')
  if (ligacao?.solicitante_id === usuario.id) return responder({ ...jogadorPublico(alvo), status: 'pendente' })
  await exigirVaga(env, usuario.id)

  // o outro já tinha convidado: os dois querem, então aceitar é convidar de volta
  if (ligacao) {
    await env.DB.prepare("UPDATE amizades SET status = 'aceita' WHERE solicitante_id = ?1 AND destinatario_id = ?2").bind(alvo.id, usuario.id).run()
    return responder({ ...jogadorPublico(alvo), status: 'aceita' })
  }
  await env.DB.prepare("INSERT INTO amizades (solicitante_id, destinatario_id, status, criada_em) VALUES (?1, ?2, 'pendente', ?3) ON CONFLICT DO NOTHING").bind(usuario.id, alvo.id, Date.now()).run()
  return responder({ ...jogadorPublico(alvo), status: 'pendente' }, 201)
}

function ligacaoEntre(env: Ambiente, um: string, outro: string) {
  return env.DB.prepare('SELECT solicitante_id, status FROM amizades WHERE (solicitante_id = ?1 AND destinatario_id = ?2) OR (solicitante_id = ?2 AND destinatario_id = ?1)')
    .bind(um, outro)
    .first<{ solicitante_id: string; status: string }>()
}

/** Convites recebidos não contam: senão daria pra encher a lista de alguém e travar a conta dessa pessoa. */
async function exigirVaga(env: Ambiente, usuarioId: string) {
  const ocupados = await env.DB.prepare("SELECT COUNT(*) AS n FROM amizades WHERE solicitante_id = ?1 OR (destinatario_id = ?1 AND status = 'aceita')").bind(usuarioId).first<{ n: number }>()
  if ((ocupados?.n ?? 0) >= MAXIMO_DE_AMIGOS) throw new Falha(409, 'muitos-amigos')
}

// --- convite por link e QR Code ------------------------------------------------------------
/** Sorteado na primeira vez que a pessoa abre a aba Amigos; se dois pedidos sortearem juntos, vale o que gravou primeiro. */
async function sortearConvite(env: Ambiente, usuarioId: string): Promise<string> {
  const [, lido] = await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET codigo_convite = ?1 WHERE id = ?2 AND codigo_convite IS NULL').bind(novoCodigo(TAMANHO_CONVITE), usuarioId),
    env.DB.prepare('SELECT codigo_convite FROM usuarios WHERE id = ?1').bind(usuarioId),
  ])
  return (lido.results[0] as { codigo_convite: string }).codigo_convite
}

const donoDoConvite = (env: Ambiente, codigo: string) =>
  env.DB.prepare('SELECT id, id_jogador, nome, avatar, moldura FROM usuarios WHERE codigo_convite = ?1').bind(codigo).first<LinhaDeJogador & { id: string }>()

/** Quem convidou, pra tela mostrar o nome antes de a pessoa entrar na conta. */
async function verConvite(pedido: Request, env: Ambiente, codigo: string) {
  if ((await somarTentativa(env, `convite:${enderecoDe(pedido)}`, UMA_HORA)) > CONSULTAS_DE_CONVITE_POR_HORA) throw new Falha(429, 'muitas-tentativas')
  const dono = await donoDoConvite(env, codigo)
  if (!dono) throw new Falha(404, 'convite-nao-encontrado')
  return responder(jogadorPublico(dono))
}

/**
 * Quem abriu o link (ou leu o QR Code) recebe o pedido de amizade do dono do código, e confirma ou recusa na aba
 * Amigos. Se essa pessoa já tinha convidado o dono, os dois querem: a amizade fica aceita na hora.
 */
async function receberConvite(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { codigo } = await lerCorpo<{ codigo?: unknown }>(pedido)
  if (!conviteValido(codigo)) throw new Falha(422, 'convite-invalido')
  if ((await somarTentativa(env, `amigo:${usuario.id}`, UMA_HORA)) > CONVITES_DE_AMIZADE_POR_HORA) throw new Falha(429, 'muitas-tentativas')
  const dono = await donoDoConvite(env, codigo)
  if (!dono) throw new Falha(404, 'convite-nao-encontrado')
  if (dono.id === usuario.id) throw new Falha(422, 'voce-mesmo')

  const ligacao = await ligacaoEntre(env, usuario.id, dono.id)
  if (ligacao?.status === 'aceita') throw new Falha(409, 'ja-amigos')
  if (ligacao?.solicitante_id === usuario.id) {
    await env.DB.prepare("UPDATE amizades SET status = 'aceita' WHERE solicitante_id = ?1 AND destinatario_id = ?2").bind(usuario.id, dono.id).run()
    return responder({ ...jogadorPublico(dono), status: 'aceita' })
  }
  if (ligacao) return responder({ ...jogadorPublico(dono), status: 'pendente' })
  // o pedido sai em nome do dono do link: conta na lista dele
  await exigirVaga(env, dono.id)
  await env.DB.prepare("INSERT INTO amizades (solicitante_id, destinatario_id, status, criada_em) VALUES (?1, ?2, 'pendente', ?3) ON CONFLICT DO NOTHING").bind(dono.id, usuario.id, Date.now()).run()
  return responder({ ...jogadorPublico(dono), status: 'pendente' }, 201)
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
    `SELECT u.id, u.id_jogador, u.nome, u.avatar, u.moldura, u.criado_em, u.visto_em, u.progresso FROM usuarios u
     JOIN amizades a ON a.status = 'aceita' AND ((a.solicitante_id = ?1 AND a.destinatario_id = u.id) OR (a.destinatario_id = ?1 AND a.solicitante_id = u.id))
     WHERE u.id_jogador = ?2`,
  )
    .bind(usuarioId, idJogador)
    .first<LinhaDeJogador & { id: string; criado_em: number; visto_em: number | null; progresso: string | null }>()
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
  const [geral, entreVoces, recebidas, convites] = await Promise.all([
    env.DB.prepare(RETROSPECTO).bind(amigo.id).first<Retrospecto>(),
    env.DB.prepare(`${RETROSPECTO} AND (brancas_id = ?2 OR pretas_id = ?2)`).bind(amigo.id, usuario.id).first<Retrospecto>(),
    env.DB.prepare('SELECT conquista FROM conquistas WHERE usuario_id = ?1').bind(amigo.id).all<{ conquista: string }>(),
    convitesAceitos(env, amigo.id),
  ])
  return responder({
    ...jogadorPublico(amigo),
    online: estaOnline(amigo.visto_em),
    desde: amigo.criado_em,
    geral: comDerrotas(geral),
    entreVoces: comDerrotas(entreVoces),
    conquistas: { recebidas: recebidas.results.map((r) => r.conquista), contagem: { ...lerProgresso(amigo.progresso), convites } },
  })
}

// --- presença ----------------------------------------------------------------------------
/** O jogo está aberto e à vista nesse aparelho. */
async function marcarPresenca(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const agora = Date.now()
  await env.DB.prepare('UPDATE usuarios SET visto_em = ?1 WHERE id = ?2 AND (visto_em IS NULL OR visto_em < ?3)').bind(agora, usuario.id, agora - PRESENCA_GRAVA_MS).run()
  return responder({ ok: true })
}

/** O aparelho saiu do jogo. Vem pelo sendBeacon, que não manda cabeçalho: o token vem no corpo. */
async function sairDaPresenca(pedido: Request, env: Ambiente) {
  const { token } = await lerCorpo<{ token?: unknown }>(pedido)
  const usuario = await usuarioDoToken(env, typeof token === 'string' ? token : null)
  if (!usuario) throw new Falha(401, 'sessao')
  await env.DB.prepare('UPDATE usuarios SET visto_em = 0 WHERE id = ?1').bind(usuario.id).run()
  return responder({ ok: true })
}

// --- perfil ------------------------------------------------------------------------------
async function lerMeuPerfil(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const [eu, geral, itens, recebidas] = await Promise.all([
    env.DB.prepare('SELECT id_jogador, nome, avatar, moldura, criado_em, tudo_liberado, personalizacao FROM usuarios WHERE id = ?1')
      .bind(usuario.id)
      .first<LinhaDeJogador & { criado_em: number; tudo_liberado: number; personalizacao: string | null }>(),
    env.DB.prepare(RETROSPECTO).bind(usuario.id).first<Retrospecto>(),
    env.DB.prepare('SELECT item FROM itens WHERE usuario_id = ?1').bind(usuario.id).all<{ item: string }>(),
    env.DB.prepare('SELECT conquista FROM conquistas WHERE usuario_id = ?1').bind(usuario.id).all<{ conquista: string }>(),
  ])
  if (!eu) throw new Falha(401, 'sessao')
  return responder({
    ...jogadorPublico(eu),
    desde: eu.criado_em,
    geral: comDerrotas(geral),
    tudoLiberado: eu.tudo_liberado === 1,
    personalizacao: lerPersonalizacao(eu.personalizacao),
    itens: itens.results.map((i) => i.item),
    conquistas: recebidas.results.map((c) => c.conquista),
  })
}

// --- personalização das peças ------------------------------------------------------------
type Personalizacao = Record<string, Record<string, string>>

const lerPersonalizacao = (texto: string | null): Personalizacao => {
  try {
    return JSON.parse(texto ?? '{}') as Personalizacao
  } catch {
    return {}
  }
}

/** O que a parte aceita naquela peça; a primeira opção é a de sempre. Só o cavalo tem montaria, e ele não tem arma. */
function opcoesDaParte(peca: string, parte: string): string[] | undefined {
  if (!personalizacao.pecas.includes(peca)) return undefined
  if (Object.hasOwn(personalizacao.corpo, parte)) return personalizacao.corpo[parte as keyof typeof personalizacao.corpo]
  if (parte === 'arma' && Object.hasOwn(personalizacao.armas, peca)) return personalizacao.armas[peca as keyof typeof personalizacao.armas]
  if (peca === 'n' && Object.hasOwn(personalizacao.montaria, parte)) return personalizacao.montaria[parte as keyof typeof personalizacao.montaria]
  return undefined
}

/** Equipamentos que saem por conquista: valem pra toda peça que usa aquela parte. */
const POR_CONQUISTA = personalizacao.itens as Record<string, { conquista: string }>
/** O que cada peça compra na Loja, com o preço em óticoins: a compra vale só pra aquela peça. O que não está nem aqui
 * nem em POR_CONQUISTA é livre. */
const NA_LOJA = personalizacao.loja as Record<string, Record<string, number>>

function precoNaLoja(peca: string, parte: string, opcao: string): number | undefined {
  const daPeca = Object.hasOwn(NA_LOJA, peca) ? NA_LOJA[peca] : undefined
  return daPeca && Object.hasOwn(daPeca, `${parte}:${opcao}`) ? daPeca[`${parte}:${opcao}`] : undefined
}

/** Livre, liberado pela conquista ou comprado; a conta com tudo liberado usa tudo. Guarda só o que foge do padrão. */
async function mudarPersonalizacao(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { peca, parte, opcao } = await lerCorpo<{ peca?: unknown; parte?: unknown; opcao?: unknown }>(pedido)
  const opcoes = typeof peca === 'string' && typeof parte === 'string' ? opcoesDaParte(peca, parte) : undefined
  if (!opcoes || typeof opcao !== 'string' || !opcoes.includes(opcao)) throw new Falha(422, 'opcao-invalida')
  const conta = await env.DB.prepare('SELECT tudo_liberado, personalizacao FROM usuarios WHERE id = ?1')
    .bind(usuario.id)
    .first<{ tudo_liberado: number; personalizacao: string | null }>()
  if (!conta) throw new Falha(401, 'sessao')
  if (conta.tudo_liberado !== 1) {
    const doCatalogo = `${parte}:${opcao}`
    if (precoNaLoja(peca as string, parte as string, opcao) !== undefined) {
      const comprado = await env.DB.prepare('SELECT 1 AS sim FROM itens WHERE usuario_id = ?1 AND item = ?2').bind(usuario.id, `${peca}:${doCatalogo}`).first()
      if (!comprado) throw new Falha(403, 'item-bloqueado')
    } else if (Object.hasOwn(POR_CONQUISTA, doCatalogo)) {
      const pelaConquista = await env.DB.prepare('SELECT 1 AS sim FROM conquistas WHERE usuario_id = ?1 AND conquista = ?2')
        .bind(usuario.id, POR_CONQUISTA[doCatalogo].conquista)
        .first()
      if (!pelaConquista) throw new Falha(403, 'item-bloqueado')
    }
  }

  const atual = lerPersonalizacao(conta.personalizacao)
  const daPeca = { ...atual[peca as string] }
  if (opcao === opcoes[0]) delete daPeca[parte as string]
  else daPeca[parte as string] = opcao
  if (Object.keys(daPeca).length > 0) atual[peca as string] = daPeca
  else delete atual[peca as string]
  await env.DB.prepare('UPDATE usuarios SET personalizacao = ?1 WHERE id = ?2').bind(JSON.stringify(atual), usuario.id).run()
  return responder({ personalizacao: atual })
}

/** Escolher um avatar do jogo apaga a foto: ela não fica guardada à toa. As molduras, por enquanto, só pra conta com
 * tudo liberado; tirar a moldura qualquer um pode. */
async function mudarAparencia(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { avatar, moldura } = await lerCorpo<{ avatar?: unknown; moldura?: unknown }>(pedido)
  if (avatar !== undefined && !aparencia.avatares.includes(avatar as string)) throw new Falha(422, 'avatar-invalido')
  if (moldura !== undefined && !aparencia.molduras.includes(moldura as string)) throw new Falha(422, 'moldura-invalida')
  if (moldura !== undefined && moldura !== 'nenhuma') {
    const conta = await env.DB.prepare('SELECT tudo_liberado FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ tudo_liberado: number }>()
    if (conta?.tudo_liberado !== 1) throw new Falha(403, 'moldura-bloqueada')
  }
  const instrucoes = []
  if (moldura !== undefined) instrucoes.push(env.DB.prepare('UPDATE usuarios SET moldura = ?1 WHERE id = ?2').bind(moldura, usuario.id))
  if (avatar !== undefined) {
    instrucoes.push(env.DB.prepare('UPDATE usuarios SET avatar = ?1 WHERE id = ?2').bind(avatar, usuario.id))
    instrucoes.push(env.DB.prepare('DELETE FROM fotos WHERE usuario_id = ?1').bind(usuario.id))
  }
  if (instrucoes.length > 0) await env.DB.batch(instrucoes)
  return responder({ ok: true })
}

/** O site reduz a foto e manda só JPEG (`/9j/` é como o início do arquivo sai em base64): fora isso nada é aceito. */
async function enviarFoto(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { foto } = await lerCorpo<{ foto?: unknown }>(pedido)
  if (typeof foto !== 'string' || foto.length > MAXIMO_FOTO_BASE64 || !foto.startsWith('/9j/') || !/^[A-Za-z0-9+/]+={0,2}$/.test(foto)) throw new Falha(422, 'foto-invalida')
  if ((await somarTentativa(env, `foto:${usuario.id}`, UMA_HORA)) > FOTOS_POR_HORA) throw new Falha(429, 'muitas-tentativas')

  const agora = Date.now()
  const avatar = `foto:${agora}`
  await env.DB.batch([
    env.DB.prepare('INSERT INTO fotos (usuario_id, dados, atualizada_em) VALUES (?1, ?2, ?3) ON CONFLICT(usuario_id) DO UPDATE SET dados = excluded.dados, atualizada_em = excluded.atualizada_em').bind(usuario.id, foto, agora),
    env.DB.prepare('UPDATE usuarios SET avatar = ?1 WHERE id = ?2').bind(avatar, usuario.id),
  ])
  return responder({ avatar })
}

/** Uma `<img>` não manda sessão: a foto é aberta pra quem tem o ID. A versão na URL é que vence o cache. */
async function verFoto(env: Ambiente, idJogador: string) {
  const foto = await env.DB.prepare('SELECT f.dados FROM fotos f JOIN usuarios u ON u.id = f.usuario_id WHERE u.id_jogador = ?1').bind(idJogador).first<{ dados: string }>()
  if (!foto) throw new Falha(404, 'sem-foto')
  return new Response(deBase64(foto.dados), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': `public, max-age=${FOTO_NO_CACHE_S}`, 'X-Content-Type-Options': 'nosniff' },
  })
}

// --- loja ---------------------------------------------------------------------------------
/** Compra um equipamento de uma peça com óticoins: o item é 'peça:parte:opção', como 'p:cabeca:elmo'. Quem já tem não paga
 * de novo. */
async function comprarItem(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { item } = await lerCorpo<{ item?: unknown }>(pedido)
  const [peca, parte, opcao] = typeof item === 'string' ? item.split(':') : []
  const preco = peca && parte && opcao && item === `${peca}:${parte}:${opcao}` ? precoNaLoja(peca, parte, opcao) : undefined
  if (preco === undefined) throw new Falha(422, 'item-invalido')
  const jaTem = async () => Boolean(await env.DB.prepare('SELECT 1 AS sim FROM itens WHERE usuario_id = ?1 AND item = ?2').bind(usuario.id, item).first())
  if (await jaTem()) throw new Falha(409, 'ja-tem')

  // o item só entra se havia saldo, e a moeda só sai se o item entrou: as duas coisas na mesma transação
  const [entrada] = await env.DB.batch([
    env.DB.prepare('INSERT INTO itens (usuario_id, item, comprado_em) SELECT ?1, ?2, ?3 WHERE (SELECT oticoins FROM usuarios WHERE id = ?1) >= ?4 ON CONFLICT DO NOTHING').bind(
      usuario.id,
      item,
      Date.now(),
      preco,
    ),
    env.DB.prepare('UPDATE usuarios SET oticoins = oticoins - ?1 * changes() WHERE id = ?2').bind(preco, usuario.id),
  ])
  if (!entrada.meta.changes) {
    // ou faltou saldo, ou outro pedido comprou o mesmo item no meio tempo
    const tem = await jaTem()
    throw new Falha(tem ? 409 : 402, tem ? 'ja-tem' : 'saldo-insuficiente')
  }
  const [conta, itens] = await Promise.all([
    env.DB.prepare('SELECT oticoins FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ oticoins: number }>(),
    env.DB.prepare('SELECT item FROM itens WHERE usuario_id = ?1').bind(usuario.id).all<{ item: string }>(),
  ])
  return responder({ oticoins: conta?.oticoins ?? 0, itens: itens.results.map((i) => i.item) })
}

// --- conquistas e óticoins --------------------------------------------------------------
const CONQUISTAS_POR_ID = new Map(conquistas.conquistas.map((c) => [c.id, c]))

/** Amigos que a pessoa convidou e que aceitaram: é o que vale nas conquistas de convite. */
const convitesAceitos = async (env: Ambiente, usuarioId: string) =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM amizades WHERE solicitante_id = ?1 AND status = 'aceita'").bind(usuarioId).first<{ n: number }>())?.n ?? 0

/** O que o aparelho conta nas partidas; os convites aceitos, o servidor conta. */
const MEDIDAS_DO_APARELHO = [...new Set(conquistas.conquistas.map((c) => c.medida))].filter((medida) => medida !== 'convites')

function lerProgresso(texto: string | null): Record<string, number> {
  let lido: Record<string, unknown> = {}
  try {
    lido = JSON.parse(texto ?? '{}') as Record<string, unknown>
  } catch {
    // progresso estragado vale zero
  }
  return Object.fromEntries(MEDIDAS_DO_APARELHO.map((medida) => [medida, Number.isInteger(lido[medida]) ? (lido[medida] as number) : 0]))
}

/**
 * O progresso contado no aparelho, pros amigos verem no perfil. Fica sempre o maior de cada medida: um aparelho novo
 * que ainda não baixou todas as partidas não apaga o que já foi contado. Só grava quando muda.
 */
async function guardarProgresso(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { contagem } = await lerCorpo<{ contagem?: unknown }>(pedido)
  if (!contagem || typeof contagem !== 'object' || Array.isArray(contagem)) throw new Falha(422, 'progresso-invalido')
  const enviada = contagem as Record<string, unknown>
  const valida = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAXIMO_NA_CONTAGEM
  if (Object.keys(enviada).length !== MEDIDAS_DO_APARELHO.length || !MEDIDAS_DO_APARELHO.every((medida) => valida(enviada[medida]))) throw new Falha(422, 'progresso-invalido')

  const conta = await env.DB.prepare('SELECT progresso FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ progresso: string | null }>()
  const antes = lerProgresso(conta?.progresso ?? null)
  const depois = Object.fromEntries(MEDIDAS_DO_APARELHO.map((medida) => [medida, Math.max(antes[medida], enviada[medida] as number)]))
  const texto = JSON.stringify(depois)
  if (texto !== conta?.progresso) await env.DB.prepare('UPDATE usuarios SET progresso = ?1 WHERE id = ?2').bind(texto, usuario.id).run()
  return responder({ contagem: depois })
}

async function lerConquistas(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const [conta, recebidas, convites] = await Promise.all([
    env.DB.prepare('SELECT oticoins FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ oticoins: number }>(),
    env.DB.prepare('SELECT conquista FROM conquistas WHERE usuario_id = ?1').bind(usuario.id).all<{ conquista: string }>(),
    convitesAceitos(env, usuario.id),
  ])
  return responder({ oticoins: conta?.oticoins ?? 0, recebidas: recebidas.results.map((r) => r.conquista), convites })
}

/**
 * O aparelho diz o que alcançou: capturas, xeques, roques e vitórias saem das partidas contra a máquina, jogadas nele,
 * e refazer todas aqui não cabe no limite de processamento. Por isso cada conquista paga uma vez só: o máximo que uma
 * conta junta é a soma do catálogo. Os convites, o servidor confere.
 */
async function receberConquistas(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { ids } = await lerCorpo<{ ids?: unknown }>(pedido)
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > CONQUISTAS_POR_ID.size) throw new Falha(422, 'conquistas-invalidas')
  const pedidas = [...new Set(ids)].map((id) => (typeof id === 'string' ? CONQUISTAS_POR_ID.get(id) : undefined))
  if (pedidas.some((c) => !c)) throw new Falha(422, 'conquistas-invalidas')
  if ((await somarTentativa(env, `conquistas:${usuario.id}`, UMA_HORA)) > RECEBIMENTOS_POR_HORA) throw new Falha(429, 'muitas-tentativas')

  const convites = await convitesAceitos(env, usuario.id)
  const valem = pedidas.filter((c) => c && (c.medida !== 'convites' || convites >= c.meta)) as (typeof conquistas.conquistas)[number][]
  let novas: string[] = []
  if (valem.length > 0) {
    const agora = Date.now()
    // a moeda só entra se o recibo entrou: changes() é o que a instrução anterior gravou, na mesma transação
    const resultados = await env.DB.batch(
      valem.flatMap((c) => [
        env.DB.prepare('INSERT INTO conquistas (usuario_id, conquista, recebida_em) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING').bind(usuario.id, c.id, agora),
        env.DB.prepare('UPDATE usuarios SET oticoins = oticoins + ?1 * changes() WHERE id = ?2').bind(c.oticoins, usuario.id),
      ]),
    )
    novas = valem.filter((_, i) => (resultados[i * 2].meta.changes ?? 0) > 0).map((c) => c.id)
  }
  // a lista inteira do que já foi pago: outro pedido pode ter pago alguma no meio tempo
  const [conta, recebidas] = await Promise.all([
    env.DB.prepare('SELECT oticoins FROM usuarios WHERE id = ?1').bind(usuario.id).first<{ oticoins: number }>(),
    env.DB.prepare('SELECT conquista FROM conquistas WHERE usuario_id = ?1').bind(usuario.id).all<{ conquista: string }>(),
  ])
  return responder({ oticoins: conta?.oticoins ?? 0, novas, recebidas: recebidas.results.map((r) => r.conquista) })
}

// --- salas -------------------------------------------------------------------------------
const stubDaSala = (env: Ambiente, codigo: string) => env.SALAS.get(env.SALAS.idFromName(codigo))
const codigoDeSalaValido = (codigo: string) => /^[A-Z2-9]{8}$/.test(codigo)

type CorPedida = 'w' | 'b' | 'sorteio'
const corValida = (cor: unknown): cor is CorPedida => cor === 'w' || cor === 'b' || cor === 'sorteio'

async function criarSala(pedido: Request, env: Ambiente) {
  const usuario = await exigirUsuario(pedido, env)
  const { cor, amigo } = await lerCorpo<{ cor?: unknown; amigo?: unknown }>(pedido)
  if (!corValida(cor)) throw new Falha(422, 'cor-invalida')
  const linhaDoAmigo = typeof amigo === 'string' ? await amigoPeloId(env, usuario.id, amigo) : null
  if (!linhaDoAmigo) throw new Falha(403, 'nao-e-amigo')
  const sala = await abrirPartidaAmistosa(env, usuario, { id: linhaDoAmigo.id, nome: linhaDoAmigo.nome }, cor)
  return responder({ codigo: sala.codigo, cor: sala.cor }, sala.nova ? 201 : 200)
}

/** "Novo jogo" no fim de uma partida amistosa chama o mesmo amigo, e ele fica sabendo pela partida aberta na tela. */
async function pedirRevanche(pedido: Request, env: Ambiente, codigo: string) {
  const usuario = await exigirUsuario(pedido, env)
  const { cor } = await lerCorpo<{ cor?: unknown }>(pedido)
  if (!corValida(cor)) throw new Falha(422, 'cor-invalida')
  const sala = codigoDeSalaValido(codigo)
    ? await env.DB.prepare('SELECT brancas_id, pretas_id FROM salas WHERE codigo = ?1').bind(codigo).first<{ brancas_id: string | null; pretas_id: string | null }>()
    : null
  const outroId = sala?.brancas_id === usuario.id ? sala.pretas_id : sala?.pretas_id === usuario.id ? sala.brancas_id : null
  const outro = outroId ? await env.DB.prepare('SELECT id_jogador FROM usuarios WHERE id = ?1').bind(outroId).first<{ id_jogador: string }>() : null
  const amigo = outro ? await amigoPeloId(env, usuario.id, outro.id_jogador) : null
  if (!amigo) throw new Falha(403, 'nao-e-amigo')

  // os dois pediram ao mesmo tempo: quem chega depois entra na partida que o outro já abriu
  const doOutro = await env.DB.prepare("SELECT codigo FROM salas WHERE criador_id = ?1 AND status = 'aguardando' AND (brancas_id = ?2 OR pretas_id = ?2)")
    .bind(amigo.id, usuario.id)
    .first<{ codigo: string }>()
  if (doOutro) {
    const entrou = await stubDaSala(env, doOutro.codigo).entrar(usuario)
    if (entrou.ok) return responder({ codigo: doOutro.codigo, cor: entrou.cor })
  }

  const nova = await abrirPartidaAmistosa(env, usuario, { id: amigo.id, nome: amigo.nome }, cor)
  await stubDaSala(env, codigo).avisarRevanche(usuario.id, nova.codigo)
  return responder({ codigo: nova.codigo, cor: nova.cor }, nova.nova ? 201 : 200)
}

async function abrirPartidaAmistosa(env: Ambiente, usuario: Usuario, convidado: Usuario, cor: CorPedida): Promise<{ codigo: string; cor: 'w' | 'b'; nova: boolean }> {
  // chamar de novo quem ainda não respondeu volta pra mesma partida
  const aberta = await env.DB.prepare("SELECT codigo, brancas_id FROM salas WHERE criador_id = ?1 AND status = 'aguardando' AND (brancas_id = ?2 OR pretas_id = ?2)")
    .bind(usuario.id, convidado.id)
    .first<{ codigo: string; brancas_id: string }>()
  if (aberta) return { codigo: aberta.codigo, cor: aberta.brancas_id === usuario.id ? 'w' : 'b', nova: false }

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
  return { codigo, cor: minhaCor, nova: true }
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
  const sala = caminho.match(/^\/salas\/([^/]+)(\/entrar|\/recusar|\/revanche|\/ws)?$/)
  const amigo = caminho.match(/^\/amigos\/([A-Z2-9]{8})(\/remover)?$/)
  const foto = caminho.match(/^\/fotos\/([A-Z2-9]{8})$/)
  const convite = caminho.match(/^\/convites\/([A-Z2-9]{12})$/)

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
  if (metodo === 'GET' && caminho === '/perfil') return lerMeuPerfil(pedido, env)
  if (metodo === 'POST' && caminho === '/perfil/aparencia') return mudarAparencia(pedido, env)
  if (metodo === 'POST' && caminho === '/perfil/foto') return enviarFoto(pedido, env)
  if (metodo === 'POST' && caminho === '/perfil/personalizacao') return mudarPersonalizacao(pedido, env)
  if (foto && metodo === 'GET') return verFoto(env, foto[1])
  if (metodo === 'POST' && caminho === '/loja/comprar') return comprarItem(pedido, env)
  if (metodo === 'GET' && caminho === '/conquistas') return lerConquistas(pedido, env)
  if (metodo === 'POST' && caminho === '/conquistas/receber') return receberConquistas(pedido, env)
  if (metodo === 'POST' && caminho === '/conquistas/progresso') return guardarProgresso(pedido, env)
  if (metodo === 'POST' && caminho === '/presenca') return marcarPresenca(pedido, env)
  if (metodo === 'POST' && caminho === '/presenca/sair') return sairDaPresenca(pedido, env)
  if (metodo === 'GET' && caminho === '/amigos') return listarAmigos(pedido, env)
  if (metodo === 'POST' && caminho === '/amigos') return convidarAmigo(pedido, env)
  if (metodo === 'POST' && caminho === '/amigos/convite') return receberConvite(pedido, env)
  if (convite && metodo === 'GET') return verConvite(pedido, env, convite[1])
  if (amigo && metodo === 'GET' && !amigo[2]) return verPerfil(pedido, env, amigo[1])
  if (amigo && metodo === 'POST' && amigo[2]) return removerAmigo(pedido, env, amigo[1])
  if (metodo === 'GET' && caminho === '/salas') return listarSalas(pedido, env)
  if (metodo === 'POST' && caminho === '/salas') return criarSala(pedido, env)
  if (sala && metodo === 'POST' && sala[2] === '/entrar') return entrarNaSala(pedido, env, sala[1])
  if (sala && metodo === 'POST' && sala[2] === '/recusar') return recusarSala(pedido, env, sala[1])
  if (sala && metodo === 'POST' && sala[2] === '/revanche') return pedirRevanche(pedido, env, sala[1])
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
