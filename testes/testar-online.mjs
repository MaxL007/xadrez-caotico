// Testa o jogo de verdade: dois navegadores, duas contas e uma partida inteira entre elas, do convite
// ao xeque-mate, mais a queda de conexão, e o jogador sem conta salvando no aparelho e levando as
// partidas pra conta ao entrar.
// Precisa do simulador (worker: npm run dev) e do site (npm run dev) no ar.
import { createRequire } from 'module'
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
    if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', som: false, ambiente: false }))
  })
  return page
}

const botao = (page, nome) => page.locator('main').getByRole('button', { name: nome, exact: true })
const foto = (page, nome) => page.screenshot({ path: path.join(FOTOS, nome), timeout: 150000 }).catch((e) => console.log(`  (sem foto ${nome}: ${e.message.split('\n')[0]})`))
const h = (page, fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })

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

  // =================== convite ===================
  await botao(ana, 'Jogar com um amigo').click()
  await botao(ana, 'Brancas').click()
  await ana.locator('[data-convite]').waitFor()
  await foto(ana, 'online-convite.png')
  const link = await ana.locator('[data-convite] .font-mono').first().innerText()
  conferir('o convite vira um link', link.includes('?sala='), link)
  conferir('sem adversário a partida espera', (await ana.getByText('Esperando o adversário entrar…').count()) === 1)
  await h(ana, 'jogar', 'f2', 'f3')
  await ana.waitForTimeout(600)
  conferir('sem adversário não dá pra mexer', (await h(ana, 'fen')).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'))

  const bia = await novoJogador({ width: 390, height: 844 })
  await abrir(bia, link)
  await bia.getByText('Você recebeu um convite').waitFor()
  conferir('quem abre o link sem conta recebe o convite e pode criar conta ali', true)
  await criarConta(bia, nomeBia, 'senha-da-bia')
  await bia.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  conferir('criou a conta e já caiu na partida, com a outra cor', (await h(bia, 'sala')).minhaCor === 'b')
  conferir('o link sai da barra de endereço', !bia.url().includes('sala='), bia.url())
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  conferir('a criadora vê o adversário chegar', (await h(ana, 'sala')).pretas === nomeBia)
  await ana.locator('[data-convite]').waitFor({ state: 'detached' })
  conferir('o convite some quando a partida começa', true)
  await bia.waitForFunction(() => !window.__xadrez.camera().girando, null, { timeout: 30000, polling: 300 })
  conferir('o tabuleiro de quem joga de pretas fica virado', (await h(bia, 'camera')).z < 0, String((await h(bia, 'camera')).z))

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
  await ana.getByText('Você perdeu').first().waitFor({ timeout: 60000 })
  await bia.getByText('Você venceu!').first().waitFor({ timeout: 60000 })
  conferir('xeque-mate: um vê que venceu e o outro que perdeu', true)
  const pecasAna = await h(ana, 'problemasDoTabuleiro')
  const pecasBia = await h(bia, 'problemasDoTabuleiro')
  conferir('depois das animações, cada peça está na casa certa nos dois lados', pecasAna.length === 0 && pecasBia.length === 0, [...pecasAna, ...pecasBia].join('; '))
  conferir('os dois tabuleiros terminam iguais', (await h(ana, 'fen')) === (await h(bia, 'fen')), await h(ana, 'fen'))
  await foto(bia, 'online-fim.png')

  // nova partida: desistência e lista
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await botao(ana, 'Jogar com um amigo').click()
  await ana.getByText('Minhas partidas').waitFor()
  conferir('a partida aparece na lista, com o resultado', (await ana.getByText('Perdeu', { exact: true }).count()) === 1)
  await botao(ana, 'Pretas').click()
  await ana.locator('[data-convite]').waitFor()
  const link2 = await ana.locator('[data-convite] .font-mono').first().innerText()
  await bia.goto(link2, { waitUntil: 'load' })
  await bia.waitForFunction(() => window.__xadrez?.sala?.()?.status === 'andamento', null, { timeout: 60000, polling: 300 })
  conferir('quem já tem conta entra direto pelo link', (await h(bia, 'sala')).minhaCor === 'w')
  await ana.waitForFunction(() => window.__xadrez.sala()?.status === 'andamento', null, { timeout: 30000, polling: 300 })
  await ana.locator('main').getByRole('button', { name: 'Desistir', exact: true }).first().click()
  await ana.locator('main').getByRole('button', { name: 'Sim, desistir', exact: true }).first().click()
  await bia.waitForFunction(() => window.__xadrez.sala()?.motivo === 'desistencia', null, { timeout: 60000, polling: 300 })
  await bia.getByText('desistiu. Você venceu!').first().waitFor({ timeout: 30000 })
  await ana.getByText('Você desistiu').first().waitFor({ timeout: 30000 })
  conferir('desistir: os dois veem o fim', true)

  // contra a máquina continua igual, depois de uma partida online
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
  await botao(ana, 'Continuar partida').click()
  await ana.waitForFunction(() => window.__xadrez.sala() === null && !window.__xadrez.ocupado(), null, { polling: 300 })
  conferir('a partida contra a máquina continua de onde parou', (await h(ana, 'fen')).includes('4P3'), await h(ana, 'fen'))

  // sair da conta
  await ana.locator('main').getByRole('button', { name: 'Menu', exact: true }).first().click()
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
