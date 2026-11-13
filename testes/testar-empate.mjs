// A tela de partida: o pedido de empate à máquina (aceito quando ela está perdendo, recusado quando está ganhando), o
// resultado no centro da tela (a taça na vitória), a aba flutuante de lances e, na tela cheia, o menu no alto e a
// situação da partida embaixo, sem o botão de som. Precisa do site no ar (npm run dev); o 3D fica desligado.
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage()
page.setDefaultTimeout(120000)
const erros = []
page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
await page.addInitScript(() => {
  window.__semDesenho = true
  if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
})
const h = (fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })
const esperarParar = () => page.waitForFunction(() => !window.__xadrez.ocupado(), null, { timeout: 120000, polling: 300 })
// na tela cheia, os botões que valem são os de cima do tabuleiro (os da barra normal ficam escondidos atrás)
const botaoDeEmpate = () => page.locator('[data-pedir-empate]').last()

try {
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })

  // =================== cliques seguidos na peça fora da vez ===================
  // a máquina (pretas) está pensando; cada clique num peão branco faz ele recusar, e um clique no meio da recusa
  // fazia ele terminar fora do centro da casa
  // fora do livro de aberturas: a máquina pensa mais de um segundo, e os cliques caem todos na vez dela
  await h('carregarTeste', '1. h4 a5 2. h5 a4 3. h6', 'w')
  let mexeu = 0
  for (let i = 0; i < 7; i++) {
    await h('clicarCasa', 'd2')
    await page.waitForTimeout(110)
    const noMeio = await h('descansoDaPeca', 'd2')
    mexeu = Math.max(mexeu, noMeio.distancia + noMeio.giro)
  }
  conferir('os cliques fora da vez fazem a peça recusar', mexeu > 0.05, mexeu.toFixed(3))
  await esperarParar()
  await page.waitForTimeout(1500)
  const lugar = await h('descansoDaPeca', 'd2')
  conferir('cliques seguidos na peça fora da vez: ela volta ao centro da casa, de frente', lugar && lugar.distancia < 0.005 && lugar.giro < 0.01, JSON.stringify(lugar))

  // =================== a máquina perdendo aceita o empate ===================
  // a máquina (pretas) entregou a dama
  await h('carregarTeste', '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qxd2+ 4. Bxd2 Nc6', 'w')
  await esperarParar()
  conferir('a tela de partida não tem mais o botão de som', (await page.getByRole('button', { name: /🔊|🔇/ }).count()) === 0)

  // a aba de lances
  conferir('a aba de lances fica na borda, com quantos lances já foram', (await page.locator('[data-aba-lances]').innerText()).replace(/\s+/g, ' ').includes('Lances · 8'))
  await page.locator('[data-aba-lances]').click()
  const lista = page.locator('[data-lista-lances]')
  await lista.waitFor()
  const textoDaLista = await lista.innerText()
  conferir('a aba abre os lances de cada lado: você e a máquina', textoDaLista.includes('Você') && textoDaLista.includes('Máquina') && textoDaLista.includes('♕xd2+') && textoDaLista.includes('♗xd2'), textoDaLista.replace(/\s+/g, ' '))
  conferir('o último lance fica destacado', (await lista.locator('.bg-\\[\\#c9a24a\\]').innerText()) === '♘c6')
  await page.locator('[data-aba-lances]').click()
  conferir('e a aba fecha de novo', (await lista.count()) === 0)

  // a tela é sempre a cheia: sem botão de tela normal, o menu no alto à esquerda e a situação da partida embaixo
  conferir('não existe mais tela normal', (await page.getByRole('button', { name: /Expandir|Tela normal/ }).count()) === 0)
  await page.locator('[data-status-partida]').waitFor()
  const menu = await page.locator('main').getByRole('button', { name: 'Menu', exact: true }).last().boundingBox()
  const situacao = await page.locator('[data-status-partida]').boundingBox()
  conferir('na tela cheia, o menu fica no alto à esquerda', menu && menu.x < 40 && menu.y < 40, JSON.stringify(menu))
  conferir('e a situação da partida fica embaixo', situacao && situacao.y > 800 * 0.8, JSON.stringify(situacao))

  await botaoDeEmpate().click()
  await page.locator('[data-resultado="empate"]').waitFor({ timeout: 30000 })
  conferir('a máquina perdendo aceita o empate', (await page.locator('[data-resultado="empate"]').innerText()).includes('Empate'))
  conferir('a partida fica empatada por acordo', (await page.locator('[data-resultado="empate"]').innerText()).includes('Empate por acordo.'))
  conferir('e não dá mais pra pedir empate nem desistir', (await page.locator('[data-pedir-empate]').count()) === 0 && (await page.locator('main').getByRole('button', { name: 'Desistir', exact: true }).count()) === 0)

  // =================== a máquina ganhando recusa ===================
  // agora quem entregou a dama foi você
  await h('carregarTeste', '1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5', 'w')
  await esperarParar()
  await botaoDeEmpate().click()
  const aviso = page.locator('[data-aviso-empate]').last()
  await aviso.getByText('A máquina recusou o empate').waitFor({ timeout: 30000 })
  conferir('a máquina ganhando recusa o empate', (await page.locator('[data-resultado]').count()) === 0)
  conferir('no mesmo lance, não dá pra pedir de novo', (await page.locator('[data-pedir-empate]').count()) === 0)
  await h('jogar', 'g1', 'f3')
  await page.waitForFunction(() => window.__xadrez.fen().split(' ')[1] === 'w' && !window.__xadrez.ocupado(), null, { timeout: 120000, polling: 300 })
  await botaoDeEmpate().waitFor({ timeout: 30000 })
  conferir('depois do próximo lance, dá pra pedir de novo', true)

  // =================== a vitória: a taça no centro ===================
  await h('carregarTeste', '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6', 'w')
  await esperarParar()
  await h('jogar', 'h5', 'f7')
  const vitoria = page.locator('[data-resultado="venceu"]')
  await vitoria.waitFor({ timeout: 60000 })
  conferir('xeque-mate: a vitória aparece no centro, com a taça e "Vitória" embaixo', (await vitoria.locator('[data-taca]').count()) === 1 && (await vitoria.innerText()).includes('Vitória'))
  const caixa = await vitoria.locator('[data-taca]').boundingBox()
  conferir('no meio da tela', caixa && Math.abs(caixa.x + caixa.width / 2 - 550) < 60 && caixa.y > 150 && caixa.y < 450, JSON.stringify(caixa))
  conferir('o aviso do canto não existe mais', (await page.getByText('Você venceu!', { exact: true }).count()) === 0)
  // o "Novo jogo" da taça (na tela cheia, é o que aparece): a escolha de cor não pode ficar embaixo dela
  await vitoria.getByRole('button', { name: 'Novo jogo', exact: true }).click()
  await page.getByRole('heading', { name: 'Com qual peça você quer jogar?' }).waitFor()
  await page.getByRole('button', { name: /Brancas/ }).first().click({ trial: true, timeout: 10000 })
  conferir('o novo jogo tira a taça e deixa escolher a cor', (await vitoria.count()) === 0)
  await page.getByRole('button', { name: 'Cancelar e voltar pra partida atual' }).click()
  await h('carregarTeste', '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6', 'w')
  await esperarParar()
  await h('jogar', 'h5', 'f7')
  await vitoria.waitFor({ timeout: 60000 })
  await vitoria.getByRole('button', { name: 'Fechar' }).click()
  conferir('fechar tira a taça e deixa o novo jogo no alto', (await vitoria.count()) === 0 && (await page.locator('main').getByRole('button', { name: 'Novo jogo', exact: true }).last().isVisible()))
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
