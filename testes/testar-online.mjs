// Testa o jogo de verdade: dois navegadores, duas contas e uma partida inteira entre elas, do convite de
// amizade ao xeque-mate, mais a queda de conexão, e o jogador sem conta salvando no aparelho e levando as
// partidas pra conta ao entrar.
// Precisa do simulador (worker: npm run dev) e do site (npm run dev) no ar.
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const FOTOS = path.join(AQUI, 'saidas')
fs.mkdirSync(FOTOS, { recursive: true })
const SITE = process.env.SITE ?? 'http://127.0.0.1:5184/xadrez-caotico/'

let falhas = 0
let certos = 0
function conferir(nome, ok, detalhe = '') {
  if (ok) certos++
  else falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const erros = []

async function novoJogador(viewport = { width: 1100, height: 760 }) {
  const contexto = await browser.newContext({ viewport })
  const page = await contexto.newPage()
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
  // sem placa de vídeo, dois tabuleiros 3D ao mesmo tempo travam a máquina: aqui importa a lógica, e a
  // aparência é conferida à parte
  await page.addInitScript(() => {
    window.__semDesenho = true
    if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
  })
  return page
}

const botao = (page, nome) => page.locator('main').getByRole('button', { name: nome, exact: true })

/** Liga "tudo liberado" na conta direto no banco do simulador, do mesmo jeito que se faz na conta do dono do jogo. */
function liberarTudo(nome) {
  const pastaDoServidor = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker')
  const comando = `UPDATE usuarios SET tudo_liberado = 1 WHERE nome_busca = '${nome.toLowerCase()}'`
  execFileSync(process.execPath, [path.join(pastaDoServidor, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'xadrez-caotico', '--local', '--command', comando], { cwd: pastaDoServidor, stdio: 'pipe' })
}
// o botão ganha um número quando há novidade
const abrirAmigos = (page) => page.locator('main').getByRole('button', { name: /^Amigos/ }).click()
const foto = (page, nome) => page.screenshot({ path: path.join(FOTOS, nome), timeout: 150000 }).catch((e) => console.log(`  (sem foto ${nome}: ${e.message.split('\n')[0]})`))
const h = (page, fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })

/** A tela inicial preenche a página inteira. */
const ocupaAPagina = (page) =>
  page.evaluate(() => {
    const quadro = document.querySelector('canvas').getBoundingClientRect()
    return quadro.left === 0 && quadro.top === 0 && quadro.width === innerWidth && quadro.height === innerHeight && document.documentElement.scrollTop === 0
  })

async function abrir(page, url = SITE) {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
}

async function criarConta(page, nome, senha) {
  await page.getByRole('button', { name: 'Criar uma conta' }).click()
  await page.getByLabel('Nome de jogador').fill(nome)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByLabel('Repita a senha').fill(senha)
  await botao(page, 'Criar conta').click()
  await page.locator('[data-codigo-recuperacao]').waitFor()
  const codigo = await page.locator('[data-codigo-recuperacao]').innerText()
  await botao(page, 'Já guardei').click()
  return codigo
}

async function esperarVez(page, n) {
  for (let t = 0; t < 120000; t += 200) {
    const pronto = await page.evaluate((n) => {
      const x = window.__xadrez
      return !x.ocupado() && x.sala()?.lances.length === n
    }, n)
    if (pronto) return
    await page.waitForTimeout(200)
  }
  throw new Error(`não chegou ao lance ${n}`)
}

try {
  const sufixo = Date.now().toString(36).slice(-5)
  const nomeAna = `Ana ${sufixo}`
  const nomeBia = `Bia ${sufixo}`

  // =================== sem conta: joga e salva neste aparelho ===================
  const ana = await novoJogador()
  await abrir(ana)
  conferir('abre no título do jogo', (await ana.getByRole('heading', { name: 'Xadrez Caótico' }).count()) === 1)
  conferir('a tela inicial preenche a página', await ocupaAPagina(ana))

  // o que as conquistas contam: só os lances de quem joga, contra a máquina
  const partida = (id, pgn, corJogador, status, resultado) => ({ id, pgn, corJogador, status, resultado, jogador: 'x', criadaEm: 1, atualizadaEm: 1 })
  const contagem = await h(ana, 'contarConquistas', [
    partida('pastor', '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#', 'w', 'FINALIZADA', 'Você venceu (xeque-mate)'),
    partida('roque', '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. Nf3 Nf6 5. d4 c6 6. Bc4 Bf5 7. O-O e6 8. Bd2 Bb4 9. a3 Bxc3 10. Bxc3', 'w', 'EM_ANDAMENTO'),
    partida('de-pretas', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6', 'b', 'FINALIZADA', 'A máquina venceu (você desistiu)'),
  ])
  const esperado = { peoes: 2, torres: 0, cavalos: 0, bispos: 2, rainhas: 0, roques: 1, xeques: 1, vitorias: 1, convites: 0 }
  conferir('as conquistas contam capturas, xeques, roques e vitórias só de quem joga', JSON.stringify(contagem) === JSON.stringify(esperado), JSON.stringify(contagem))
  conferir('as partidas finalizadas saíram da tela inicial', (await ana.getByText('Partidas finalizadas').count()) === 0)
  await botao(ana, 'Perfil').click()
  await ana.getByText('Entre na sua conta para ter ID').waitFor()
  await ana.getByText('Nenhuma partida terminada ainda.').waitFor()
  conferir('sem conta, o perfil mostra os números do aparelho e convida a entrar', (await ana.locator('[data-placar]').count()) === 1)
  await ana.getByRole('tab', { name: 'Configurações', exact: true }).click()
  conferir('as configurações são uma aba dentro do perfil', (await ana.locator('[data-configuracoes]').getByText('Qualidade do jogo').count()) === 1)
  await botao(ana, 'Voltar').click()
  conferir('o menu troca Configurações por Personalização', (await botao(ana, 'Configurações').count()) === 0 && (await botao(ana, 'Personalização').count()) === 1)
  await botao(ana, 'Personalização').click()
  await ana.locator('[data-vitrine="p"]').waitFor()
  await ana.waitForFunction(() => !document.querySelector('[data-vitrine]').textContent.includes('Carregando'), null, { timeout: 120000, polling: 300 })
  conferir('a personalização mostra a peça em 3D com um quadrado por parte', (await ana.locator('[data-vitrine] canvas').count()) === 1 && (await ana.locator('[data-caixa]').count()) === 7)
  conferir('sem nada vestido, o quadrado fica vazio', (await ana.locator('[data-caixa="cabeca"]').getByText('Vazio').count()) === 1)
  await ana.getByText('Entre na sua conta para personalizar').waitFor()
  conferir('sem conta, as opções ficam trancadas', await ana.locator('[data-opcoes]').getByRole('radio', { name: '🔒 Elmo', exact: true }).isDisabled())
  await ana.getByRole('tab', { name: 'Cavalo', exact: true }).click()
  await ana.locator('[data-vitrine="n"]').waitFor()
  conferir('o cavalo tem a montaria e a lança: cavalo, sela, cabresto e arma', (await ana.locator('[data-caixa]').count()) === 10 && (await ana.locator('[data-caixa="cabresto"]').count()) === 1 && (await ana.locator('[data-caixa="arma"]').count()) === 1)
  await botao(ana, 'Voltar').click()
  await botao(ana, 'Loja').click()
  await ana.locator('[data-loja] [data-item]').first().waitFor()
  await ana.getByRole('tab', { name: 'Rainha', exact: true }).click()
  await ana.locator('[data-item="q:cabeca:elmo"]').waitFor()
  conferir('a loja tem o preço da tabela de cada peça', (await ana.locator('[data-item="q:cabeca:elmo"]').innerText()).includes('50') && (await ana.locator('[data-item="q:maos:manoplas"]').innerText()).includes('25'))
  conferir('sem conta, a loja não vende', await ana.locator('[data-item="q:cabeca:elmo"]').getByRole('button', { name: /Comprar/ }).isDisabled())
  await ana.getByRole('tab', { name: 'Cavalo', exact: true }).click()
  await ana.locator('[data-item="n:sela:guerra"]').waitFor()
  conferir('o cavalo vende também a armadura, a sela, o cabresto e a lança', (await ana.locator('[data-loja] [data-item]').count()) === 12 && (await ana.locator('[data-item="n:cavalo:armadura"]').innerText()).includes('40') && (await ana.locator('[data-item="n:cabresto:guerra"]').innerText()).includes('15'))
  await botao(ana, 'Voltar').click()
  conferir('joga sem conta: o menu oferece entrar, sem obrigar', (await botao(ana, 'Entrar').count()) === 1 && (await botao(ana, 'Novo jogo').count()) === 1)
  await botao(ana, 'Novo jogo').click()
  await ana.getByRole('heading', { name: 'Com qual peça você quer jogar?' }).waitFor()
  await ana.getByRole('button', { name: /Brancas/ }).first().click()
  await ana.waitForFunction(() => !window.__xadrez.cena().menu && !window.__xadrez.ocupado() && window.__xadrez.lancesDoJogador().length === 20, null, { timeout: 120000, polling: 300 })
  await h(ana, 'jogar', 'e2', 'e4')
  await ana.waitForFunction(() => window.__xadrez.fen().includes(' b ') || window.__xadrez.fen().split(' ')[5] === '2', null, { timeout: 120000, polling: 300 })
  await ana.waitForTimeout(1500)
  await ana.reload({ waitUntil: 'load' })
  await ana.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  await botao(ana, 'Continuar partida').waitFor()
  conferir('sem conta, a partida fica salva neste aparelho', true)

  // =================== conta ===================
  await botao(ana, 'Entrar').click()
  const codigo = await criarConta(ana, nomeAna, 'senha-da-ana')
  conferir('criar conta mostra o código de recuperação', /^[A-Z0-9-]{19}$/.test(codigo), codigo)
  await ana.waitForFunction(() => window.__dadosJogo.resumo().estado === 'conectado' && window.__dadosJogo.resumo().pendentes === 0, null, { timeout: 30000, polling: 300 })
  conferir('a partida de convidado foi junto pra conta e subiu pra nuvem', (await botao(ana, 'Continuar partida').count()) === 1)
  conferir('o nome aparece no menu', (await botao(ana, nomeAna).count()) === 1)

  // outro aparelho da mesma pessoa
  const anaOutro = await novoJogador()
  await abrir(anaOutro)
  await botao(anaOutro, 'Entrar').click()
  await anaOutro.getByLabel('Nome de jogador').fill(nomeAna)
  await anaOutro.getByLabel('Senha', { exact: true }).fill('senha-errada')
  await anaOutro.locator('main form').getByRole('button', { name: 'Entrar', exact: true }).click()
  await anaOutro.getByRole('alert').waitFor()
  conferir('senha errada avisa', (await anaOutro.getByRole('alert').innerText()).includes('incorretos'))
  await anaOutro.getByLabel('Senha', { exact: true }).fill('senha-da-ana')
  await anaOutro.locator('main form').getByRole('button', { name: 'Entrar', exact: true }).click()
  await botao(anaOutro, 'Continuar partida').waitFor({ timeout: 30000 })
  conferir('em outro aparelho, a mesma conta traz a partida', true)
  await anaOutro.context().close()

  // =================== amigos ===================
  await abrirAmigos(ana)
  await ana.locator('[data-meu-id]').waitFor()
  const idAna = await ana.locator('[data-meu-id]').innerText()
  conferir('Jogar com um amigo virou Amigos, com o ID do jogador', /^[A-Z2-9]{8}$/.test(idAna), idAna)
  await ana.getByText('Você ainda não tem amigos').waitFor()
  conferir('sem amigos, a lista explica como convidar', true)

  const bia = await novoJogador({ width: 390, height: 844 })
  await abrir(bia)
  conferir('no celular em pé a tela inicial também preenche a página', await ocupaAPagina(bia))
  conferir('no celular em pé o tabuleiro aparece de lado, como no computador', Math.abs((await h(bia, 'camera')).z) < 0.5, String((await h(bia, 'camera')).z))
  await abrirAmigos(bia)
  await bia.getByText('Entre na sua conta para adicionar amigos').waitFor()
  conferir('sem conta, Amigos pede a conta e deixa criar ali', true)
  await criarConta(bia, nomeBia, 'senha-da-bia')
  await bia.locator('[data-meu-id]').waitFor()
  const idBia = await bia.locator('[data-meu-id]').innerText()
  conferir('cada um tem o seu ID', idBia !== idAna, idBia)

  await ana.getByPlaceholder('Nome ou ID do jogador').fill('Ninguem Com Esse Nome')
  await botao(ana, 'Convidar').click()
  await ana.getByText('Não achei nenhum jogador com esse nome ou ID.').waitFor()
  conferir('nome errado avisa', true)
  await ana.getByPlaceholder('Nome ou ID do jogador').fill(nomeBia)
  await botao(ana, 'Convidar').click()
  await ana.getByText(`Convite enviado para ${nomeBia}.`).waitFor()
  await ana.getByText('Convites enviados').waitFor()
  conferir('convida pelo nome', true)

  await bia.getByText('Pedidos de amizade').waitFor({ timeout: 30000 })
  conferir('o convite chega sozinho, sem recarregar a página', true)
  await botao(bia, 'Confirmar').click()
  await bia.locator(`[data-amigo="${idAna}"]`).waitFor()
  await ana.locator(`[data-amigo="${idBia}"]`).waitFor({ timeout: 30000 })
  conferir('aceitou: os dois se veem na lista de amigos', true)
  await ana.locator(`[data-amigo="${idBia}"] [data-online="sim"]`).waitFor({ timeout: 30000 })
  conferir('a bolinha verde mostra que a amiga está com o jogo aberto', true)
  conferir('cada amigo tem partida amistosa e ver perfil', (await botao(ana, 'Partida amistosa').count()) === 1 && (await botao(ana, 'Ver perfil').count()) === 1)

  await botao(ana, 'Ver perfil').click()
  await ana.locator('[data-perfil]').getByText(`ID: ${idBia}`).waitFor()
  await ana.locator('[data-perfil]').getByText('Joga desde').waitFor()
  conferir('o perfil mostra o ID e desde quando joga', true)
  conferir('o perfil do amigo também tem a bolinha verde', (await ana.locator('[data-perfil] [data-online="sim"]').count()) === 1)
  await ana.locator('[data-perfil]').getByRole('tab', { name: /^Conquistas \(\d+\/22\)$/ }).click()
  await ana.locator('[data-conquistas="amigo"]').waitFor()
  conferir(
    'o perfil do amigo mostra as conquistas dele, com o progresso e sem o saldo',
    (await ana.locator('[data-conquistas="amigo"] [data-conquista]').count()) === 22 && (await ana.locator('[data-conquistas="amigo"] [data-saldo]').count()) === 0,
  )
  await ana.locator('[data-perfil]').getByRole('tab', { name: 'Perfil', exact: true }).click()
  await foto(ana, 'amigos-perfil.png')
  await botao(ana, 'Voltar para os amigos').click()
  await foto(ana, 'amigos-lista.png')

  // =================== partida amistosa ===================
  await botao(ana, 'Partida amistosa').click()
  await botao(ana, 'Brancas').click()
  await ana.locator('[data-convite]').waitFor()
  await foto(ana, 'amigos-esperando.png')
  await ana.getByText(`Esperando ${nomeBia} aceitar a partida…`).first().waitFor()
  conferir('quem chamou espera o amigo aceitar', true)
  await h(ana, 'jogar', 'f2', 'f3')
  await ana.waitForTimeout(600)
  conferir('sem o amigo não dá pra mexer', (await h(ana, 'fen')).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'))

  await botao(bia, 'Voltar').click()
  await bia.locator('main').getByRole('button', { name: 'Amigos 1', exact: true }).waitFor({ timeout: 30000 })
  conferir('a chamada aparece como novidade no botão Amigos', true)
  await abrirAmigos(bia)
  await bia.getByText(`${nomeAna} chamou você`).waitFor()
  await foto(bia, 'amigos-chamada-celular.png')
  await botao(bia, 'Jogar').click()
  await bia.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  conferir('aceitou e já caiu na partida, com a outra cor', (await h(bia, 'sala')).minhaCor === 'b')
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  conferir('quem chamou vê o amigo chegar', (await h(ana, 'sala')).pretas === nomeBia)
  await ana.locator('[data-convite]').waitFor({ state: 'detached' })
  conferir('a espera some quando a partida começa', true)
  await bia.waitForFunction(() => !window.__xadrez.camera().girando, null, { timeout: 30000, polling: 300 })
  conferir('o tabuleiro de quem joga de pretas fica virado', (await h(bia, 'camera')).z < 0, String((await h(bia, 'camera')).z))
  const vista = await h(bia, 'camera')
  conferir('saindo da tela cheia do menu, o tabuleiro fica do tamanho certo', Math.abs(vista.distancia - vista.distanciaIdeal) < 0.6, `${vista.distancia.toFixed(1)} / ${vista.distanciaIdeal.toFixed(1)}`)

  // =================== partida ===================
  await h(bia, 'jogar', 'e7', 'e5')
  await bia.waitForTimeout(500)
  conferir('fora da vez o tabuleiro não mexe', (await h(bia, 'fen')).split(' ')[1] === 'w')

  await esperarVez(ana, 0)
  await h(ana, 'jogar', 'f2', 'f3')
  await esperarVez(bia, 1)
  conferir('o lance chega no outro navegador', (await h(bia, 'fen')).startsWith('rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP'), await h(bia, 'fen'))
  conferir('nome do adversário na vez', (await bia.getByText('Sua vez').count()) >= 1)

  await h(bia, 'jogar', 'e7', 'e5')
  await esperarVez(ana, 2)
  conferir('e volta', (await h(ana, 'fen')).includes('4p3'), await h(ana, 'fen'))
  await foto(bia, 'online-celular.png')

  // internet cai no meio: o lance feito enquanto isso entra quando voltar
  await bia.context().setOffline(true)
  await h(ana, 'jogar', 'g2', 'g4')
  await bia.waitForTimeout(2500)
  await bia.context().setOffline(false)
  await esperarVez(bia, 3)
  conferir('caiu a internet: ao voltar, o lance perdido aparece sozinho', (await h(bia, 'fen')).split(' ')[1] === 'b', await h(bia, 'fen'))

  await h(bia, 'jogar', 'd8', 'h4')
  await bia.waitForFunction(() => window.__xadrez.sala()?.status === 'fim', null, { timeout: 120000, polling: 300 })
  await esperarVez(ana, 4)
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'fim', null, { timeout: 120000, polling: 300 })
  await ana.waitForFunction(() => !window.__xadrez.ocupado(), null, { polling: 300 })
  await ana.locator('[data-resultado="perdeu"]').getByText('Derrota').waitFor({ timeout: 60000 })
  await bia.locator('[data-resultado="venceu"]').getByText('Vitória').waitFor({ timeout: 60000 })
  conferir('xeque-mate: no centro da tela, um vê a taça da vitória e o outro a derrota', (await bia.locator('[data-resultado="venceu"] [data-taca]').count()) === 1)
  const pecasAna = await h(ana, 'problemasDoTabuleiro')
  const pecasBia = await h(bia, 'problemasDoTabuleiro')
  conferir('depois das animações, cada peça está na casa certa nos dois lados', pecasAna.length === 0 && pecasBia.length === 0, [...pecasAna, ...pecasBia].join('; '))
  conferir('os dois tabuleiros terminam iguais', (await h(ana, 'fen')) === (await h(bia, 'fen')), await h(ana, 'fen'))
  await foto(bia, 'online-fim.png')

  // nova partida, chamada pelo perfil: desistência e lista
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  conferir('voltando ao menu, ele preenche a página de novo', await ocupaAPagina(ana))
  await ana.locator('[data-aviso-conquista]').waitFor({ timeout: 30000 })
  conferir('convidar um amigo que aceitou rende uma conquista, com aviso no menu', (await ana.locator('[data-aviso-conquista]').innerText()).includes('Convidar um amigo'), await ana.locator('[data-aviso-conquista]').innerText())

  // =================== perfil ===================
  await botao(ana, 'Perfil').click()
  await ana.locator('[data-meu-id]').waitFor()
  await ana.locator('[data-saldo-perfil]').waitFor()
  conferir('o perfil mostra o saldo de óticoins', (await ana.locator('[data-saldo-perfil]').innerText()).includes('5 óticoins'), await ana.locator('[data-saldo-perfil]').innerText())
  await ana.getByRole('tab', { name: /^Conquistas/ }).click()
  await ana.locator('[data-conquista="convite-1"]').getByText('✓', { exact: false }).waitFor()
  conferir('as conquistas aparecem nos três níveis, com a do convite recebida', (await ana.locator('[data-nivel]').count()) === 3 && (await ana.locator('[data-conquista]').count()) === 22)
  await ana.getByRole('tab', { name: 'Perfil', exact: true }).click()
  conferir('o perfil mostra o nome e o ID', (await ana.locator('[data-meu-id]').innerText()) === idAna && (await ana.getByText(nomeAna, { exact: true }).count()) >= 1)
  await ana.locator('[data-historico]').getByText(`Contra ${nomeBia}`).waitFor()
  conferir('a partida amistosa está no histórico, com o resultado', (await ana.locator('[data-historico]').getByText('Perdeu', { exact: true }).count()) === 1)
  conferir('e nos números', (await ana.locator('[data-placar-amistosas]').innerText()).includes('derrotas: 1'), await ana.locator('[data-placar-amistosas]').innerText())

  await botao(ana, 'Mudar foto e moldura').click()
  await ana.locator('[data-editor-perfil]').waitFor()
  await foto(ana, 'perfil-editor.png')
  const quadroDaFoto = await ana.screenshot({ type: 'png', timeout: 150000 })
  await ana.locator('[data-editor-perfil] input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: quadroDaFoto })
  const retrato = ana.locator('section[role=dialog] img').first()
  await ana.waitForFunction(() => document.querySelector('section[role=dialog] img')?.src.includes('/fotos/'), null, { timeout: 30000, polling: 300 })
  await ana.waitForFunction(() => document.querySelector('section[role=dialog] img').naturalWidth > 0, null, { timeout: 30000, polling: 300 })
  conferir('a foto do aparelho vira a foto do perfil, reduzida', (await retrato.evaluate((img) => img.naturalWidth)) === 256, String(await retrato.evaluate((img) => img.naturalWidth)))
  await ana.locator('[data-editor-perfil] input[type=file]').setInputFiles({ name: 'texto.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem') })
  await ana.getByText('Não consegui usar essa imagem').waitFor()
  conferir('arquivo que não é imagem avisa, sem trocar a foto', (await retrato.getAttribute('src')).includes('/fotos/'))

  await ana.getByText('Molduras bloqueadas por enquanto.').waitFor()
  conferir('as molduras aparecem trancadas pra conta comum', await botao(ana, 'Ouro (bloqueada)').isDisabled())
  liberarTudo(nomeAna)
  await botao(ana, 'Voltar').click()
  await botao(ana, 'Perfil').click()
  await botao(ana, 'Mudar foto e moldura').click()
  await botao(ana, 'Ouro').click()
  await ana.locator('section[role=dialog] [data-moldura="ouro"]').first().waitFor()
  conferir('com tudo liberado na conta, as molduras abrem', (await ana.getByText('Molduras bloqueadas por enquanto.').count()) === 0)
  await ana.waitForTimeout(500)
  await botao(ana, 'Usar o avatar 11').click()
  await ana.waitForFunction(() => document.querySelector('section[role=dialog] img').src.includes('rei-brancas'), null, { timeout: 30000, polling: 300 })
  conferir('escolhe uma sugestão do jogo e uma moldura', true)
  await foto(ana, 'perfil-pronto.png')
  await ana.reload({ waitUntil: 'load' })
  await ana.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  await botao(ana, 'Perfil').click()
  await ana.locator('section[role=dialog] [data-moldura="ouro"]').first().waitFor()
  conferir('a aparência continua depois de recarregar', (await ana.locator('section[role=dialog] img').first().getAttribute('src')).includes('rei-brancas'))
  await ana.locator('[data-historico] button').first().click()
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'fim', null, { timeout: 30000, polling: 300 })
  conferir('clicar no histórico abre a partida terminada', true)
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()

  // =================== personalização ===================
  await botao(ana, 'Personalização').click()
  await ana.locator('[data-vitrine="p"]').waitFor()
  conferir('com tudo liberado, até os equipamentos da Loja abrem', !(await ana.locator('[data-opcoes]').getByRole('radio', { name: 'Elmo', exact: true }).isDisabled()))
  conferir('sem escolha, o peão do tabuleiro fica sem arma', (await h(ana, 'vestimentaDaCasa', 'a2')).length === 0 && (await h(ana, 'katanaDaCasa', 'a2')).length === 0)
  await ana.locator('[data-opcoes]').getByRole('radio', { name: 'Elmo', exact: true }).click()
  await ana.locator('[data-caixa="arma"]').click()
  await ana.locator('[data-opcoes="arma"]').getByRole('radio', { name: 'Espada', exact: true }).click()
  await ana.waitForFunction(() => window.__xadrez.vestimentaDaCasa('a2').length > 0, null, { timeout: 30000, polling: 300 })
  const vestida = await h(ana, 'vestimentaDaCasa', 'a2')
  conferir('o peão do tabuleiro veste na hora o que foi escolhido', vestida.includes('vestimenta:fixa:armadura') && vestida.includes('vestimenta:naMao:lamina'), vestida.join(', '))
  conferir('a peça do outro lado não veste', (await h(ana, 'vestimentaDaCasa', 'a7')).length === 0)
  await ana.waitForTimeout(800)
  await ana.reload({ waitUntil: 'load' })
  await ana.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  await ana.waitForFunction(() => window.__xadrez.vestimentaDaCasa('a2').length > 0, null, { timeout: 60000, polling: 300 })
  conferir('a escolha fica na conta e volta depois de recarregar', (await h(ana, 'vestimentaDaCasa', 'a2')).includes('vestimenta:fixa:armadura'))
  await botao(ana, 'Personalização').click()
  await ana.locator('[data-caixa="cabeca"]').click()
  await ana.locator('[data-opcoes="cabeca"]').getByRole('radio', { name: 'Padrão', exact: true }).click()
  await ana.waitForFunction(() => !window.__xadrez.vestimentaDaCasa('a2').includes('vestimenta:fixa:armadura'), null, { timeout: 30000, polling: 300 })
  conferir('voltar ao padrão tira a peça nova', true)
  await botao(ana, 'Voltar').click()
  await botao(ana, 'Loja').click()
  await ana.locator('[data-loja] [data-item]').first().waitFor()
  conferir('a loja do peão lista os equipamentos, as armas e o retalhamento, em 3D, com o saldo de óticoins', (await ana.locator('[data-loja] [data-item]').count()) === 11 && (await ana.locator('[data-loja] > canvas').count()) === 1 && (await ana.locator('[data-saldo-loja]').count()) === 1)
  await ana.locator('[data-item="p:ombros:espinhos"] button').first().click()
  await ana.locator('[data-item-aberto="p:ombros:espinhos"]').waitFor()
  conferir('tocar no equipamento abre ele grande', (await ana.locator('[data-loja] [data-item]').count()) === 0)
  await botao(ana, 'Voltar para a Loja').click()
  await ana.locator('[data-loja] [data-item]').first().waitFor()
  await botao(ana, 'Voltar').click()

  await abrirAmigos(ana)
  await botao(ana, 'Ver perfil').click()
  await ana.getByText(`Entre vocês: você 0, ${nomeBia} 1, empates 0`).waitFor()
  conferir('o perfil mostra o placar entre os dois', true)
  await botao(ana, 'Partida amistosa').click()
  await botao(ana, 'Pretas').click()
  await ana.locator('[data-convite]').waitFor()
  await bia.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await abrirAmigos(bia)
  await botao(bia, 'Jogar').click({ timeout: 30000 })
  await bia.waitForFunction(() => window.__xadrez?.sala?.()?.status === 'andamento', null, { timeout: 60000, polling: 300 })
  conferir('do perfil também dá pra chamar, e o amigo pega a outra cor', (await h(bia, 'sala')).minhaCor === 'w')
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  await ana.locator('main').getByRole('button', { name: 'Desistir', exact: true }).first().click()
  await ana.locator('main').getByRole('button', { name: 'Sim, desistir', exact: true }).first().click()
  await bia.waitForFunction(() => window.__xadrez.sala()?.motivo === 'desistencia', null, { timeout: 60000, polling: 300 })
  await bia.getByText('desistiu. Você venceu!').first().waitFor({ timeout: 30000 })
  await ana.getByText('Você desistiu').first().waitFor({ timeout: 30000 })
  conferir('desistir: os dois veem o fim', true)

  // "Novo jogo" numa partida amistosa chama o mesmo amigo, não a máquina
  const novoJogoDaBia = bia.locator('main').getByRole('button', { name: 'Novo jogo', exact: true }).first()
  await novoJogoDaBia.click({ timeout: 30000 }).catch(async (erro) => {
    await foto(bia, 'online-novo-jogo-erro.png')
    const caixa = await novoJogoDaBia.boundingBox()
    const porCima = caixa && (await bia.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 300), { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }))
    throw new Error(`Novo jogo não clicável: ${JSON.stringify(caixa)} | por cima: ${porCima} | ${erro.message.split('\n')[0]}`)
  })
  await bia.getByText(`Nova partida contra ${nomeAna}`).waitFor()
  await botao(bia, 'Brancas').click()
  await bia.waitForFunction(() => window.__xadrez.sala()?.status === 'aguardando', null, { timeout: 30000, polling: 300 })
  conferir('novo jogo numa partida amistosa chama o amigo, não a máquina', (await h(bia, 'sala')).minhaCor === 'w')
  await ana.locator('[data-revanche]').getByText(`${nomeBia} chamou você pra outra partida.`).waitFor({ timeout: 30000 })
  conferir('o amigo vê o pedido na hora, ainda na partida', true)
  await ana.locator('[data-revanche]').getByRole('button', { name: 'Jogar', exact: true }).click()
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  await bia.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  conferir('aceitou: os dois na partida nova, com as cores trocadas', (await h(ana, 'sala')).minhaCor === 'b')

  // empate combinado entre os dois
  const pedirEmpate = (page) => page.locator('[data-pedir-empate]').first().click()
  await pedirEmpate(bia)
  const pedidoNaAna = ana.locator('[data-pedido-empate]')
  await pedidoNaAna.waitFor({ timeout: 30000 })
  conferir('o pedido de empate chega ao amigo na hora', (await pedidoNaAna.innerText()).includes(`${nomeBia} propõe empate.`))
  conferir(
    'quem pediu vê que foi enviado, e não pede de novo no mesmo lance',
    (await bia.locator('[data-aviso-empate]').first().innerText()).includes(`Pedido de empate enviado para ${nomeAna}.`) && (await bia.locator('[data-pedir-empate]').count()) === 0,
  )
  await pedidoNaAna.getByRole('button', { name: 'Recusar', exact: true }).click()
  await bia.locator('[data-aviso-empate]').getByText(`${nomeAna} recusou o empate.`).first().waitFor({ timeout: 30000 })
  conferir('a recusa avisa quem pediu', (await pedidoNaAna.count()) === 0)
  await h(bia, 'jogar', 'e2', 'e4')
  await esperarVez(ana, 1)
  await pedirEmpate(ana)
  await bia.locator('[data-pedido-empate]').getByRole('button', { name: 'Aceitar empate', exact: true }).click({ timeout: 30000 })
  await ana.waitForFunction(() => window.__xadrez.sala()?.motivo === 'acordo', null, { timeout: 60000, polling: 300 })
  await bia.waitForFunction(() => window.__xadrez.sala()?.motivo === 'acordo', null, { timeout: 60000, polling: 300 })
  await ana.locator('[data-resultado="empate"]').waitFor({ timeout: 30000 })
  await bia.locator('[data-resultado="empate"]').waitFor({ timeout: 30000 })
  conferir('aceito, os dois veem o empate por acordo no centro da tela', (await ana.getByText(`Empate por acordo com ${nomeBia}.`).count()) >= 1)

  // recusar e cancelar
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await abrirAmigos(ana)
  await botao(ana, 'Partida amistosa').click()
  await botao(ana, 'Brancas').click()
  await ana.locator('[data-convite]').waitFor()
  await bia.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await abrirAmigos(bia)
  await botao(bia, 'Recusar').click({ timeout: 30000 })
  await ana.getByText(`${nomeBia} não aceitou a partida.`).first().waitFor({ timeout: 30000 })
  conferir('recusar avisa quem chamou, na hora', (await ana.locator('[data-convite]').count()) === 0)
  conferir('recusada, a partida não oferece desistir', (await ana.locator('main').getByRole('button', { name: 'Desistir', exact: true }).count()) === 0)
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await abrirAmigos(ana)
  await botao(ana, 'Partida amistosa').click()
  await botao(ana, 'Sortear').click()
  await ana.locator('[data-convite]').waitFor()
  await botao(ana, 'Cancelar convite').click()
  await abrirAmigos(ana)
  await ana.locator('[data-meu-id]').waitFor()
  await ana.waitForTimeout(1000)
  conferir('cancelar volta ao menu e a partida some', (await ana.getByText('Aguardando', { exact: true }).count()) === 0)
  await botao(ana, 'Voltar').click()

  // contra a máquina continua igual, depois de uma partida online
  await botao(ana, 'Continuar partida').click()
  await ana.waitForFunction(() => window.__xadrez.sala() === null && !window.__xadrez.ocupado(), null, { polling: 300 })
  conferir('a partida contra a máquina continua de onde parou', (await h(ana, 'fen')).includes('4P3'), await h(ana, 'fen'))
  await ana.locator('main').getByRole('button', { name: 'Desistir', exact: true }).first().click()
  await ana.locator('main').getByRole('button', { name: 'Sim, desistir', exact: true }).first().click()
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await botao(ana, 'Perfil').click()
  await ana.locator('[data-historico]').getByText('Contra a máquina').waitFor()
  conferir('a partida contra a máquina entra no histórico e nos números', (await ana.locator('[data-placar-maquina]').innerText()).includes('derrotas: 1'), await ana.locator('[data-placar-maquina]').innerText())
  await ana.locator('[data-historico]').getByText('Contra a máquina').click()
  await ana.waitForFunction(() => window.__xadrez.cena().menu === false, null, { timeout: 30000, polling: 300 })
  conferir('e abre ao clicar', (await h(ana, 'fen')).includes('4P3'), await h(ana, 'fen'))

  // remover um amigo pede confirmação
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await abrirAmigos(ana)
  await botao(ana, 'Ver perfil').click()
  await botao(ana, 'Remover amigo').click()
  await ana.waitForTimeout(300)
  conferir('o primeiro clique em remover não remove', (await botao(ana, 'Clique de novo para remover').count()) === 1)
  await botao(ana, 'Clique de novo para remover').click()
  await ana.getByText('Você ainda não tem amigos').waitFor()
  conferir('removeu: o amigo sai da lista', true)
  await botao(ana, 'Voltar').click()

  // sair da conta
  await botao(ana, nomeAna).click()
  await botao(ana, 'Sair da conta').click()
  await botao(ana, 'Voltar').click()
  await botao(ana, 'Entrar').waitFor()
  await ana.waitForTimeout(800)
  conferir('ao sair, as partidas da conta somem da tela', (await botao(ana, 'Continuar partida').count()) === 0)

  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
  console.log('erros JS:', erros.join(' | ').slice(0, 400))
} finally {
  await browser.close()
}
console.log(falhas ? `\n${falhas} FALHA(S), ${certos} certos` : `\nTUDO OK (${certos} verificações)`)
process.exit(falhas ? 1 : 0)
