// A dificuldade da máquina: a escolha no "Novo jogo", guardada na partida e lembrada pro próximo, e a máquina jogando
// conforme ela. A força é medida numa posição com a dama branca de graça: o difícil sempre pega, o intermediário quase
// sempre, o fácil se distrai bem mais. Precisa do site no ar (npm run dev); o desenho 3D fica desligado.
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
const botao = (nome) => page.locator('main').getByRole('button', { name: nome, exact: true })
const abrir = async () => {
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
}

try {
  await abrir()

  // =================== a máquina em cada dificuldade ===================
  // o cavalo preto pode tomar a dama branca, que ninguém defende
  const DAMA_DE_GRACA = '4k3/8/5n2/3Q4/8/8/8/4K3 b - - 0 1'
  async function quantasVezesPega(dificuldade, vezes) {
    let pegou = 0
    for (let i = 0; i < vezes; i++) if ((await h('lanceDaMaquina', DAMA_DE_GRACA, dificuldade)) === 'Nxd5') pegou++
    return pegou
  }
  const dificil = await quantasVezesPega('dificil', 15)
  conferir('no difícil, a máquina nunca deixa a dama de graça', dificil === 15, `${dificil}/15`)
  // as contas: o intermediário pega em uns 87% (no descuido, sorteia entre os 3 melhores); o fácil, em uns 64%
  const intermediario = await quantasVezesPega('intermediario', 60)
  conferir('no intermediário, quase sempre pega', intermediario >= 42, `${intermediario}/60`)
  const facil = await quantasVezesPega('facil', 60)
  conferir('no fácil, se distrai bem mais', facil >= 20 && facil <= 50 && facil < intermediario, `${facil}/60`)
  const MATE_EM_UM = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
  const mates = []
  for (let i = 0; i < 5; i++) mates.push(await h('lanceDaMaquina', MATE_EM_UM, 'dificil'))
  conferir('no difícil, não perde o mate em um', mates.every((lance) => lance === 'Ra8#'), mates.join(' '))
  const MATE_EM_UM_DE_PRETAS = 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1'
  const matesDePretas = []
  for (let i = 0; i < 3; i++) matesDePretas.push(await h('lanceDaMaquina', MATE_EM_UM_DE_PRETAS, 'dificil'))
  conferir('nem jogando de pretas', matesDePretas.every((lance) => lance === 'Ra1#'), matesDePretas.join(' '))

  // =================== a escolha no "Novo jogo" ===================
  await botao('Novo jogo').click()
  await page.getByRole('heading', { name: 'Com qual peça você quer jogar?' }).waitFor()
  const opcoes = await page.locator('[data-dificuldade] [role=radio]').allInnerTexts()
  conferir('o novo jogo pergunta a dificuldade: fácil, intermediário e difícil', opcoes.join('|') === 'Fácil|Intermediário|Difícil', opcoes.join('|'))
  conferir('começa marcado no intermediário', (await page.getByRole('radio', { name: 'Intermediário' }).getAttribute('aria-checked')) === 'true')
  await page.getByRole('radio', { name: 'Fácil' }).click()
  conferir('a explicação muda com a escolha', (await page.locator('[data-dificuldade]').innerText()).includes('bom para aprender'))
  await page.getByRole('button', { name: /Brancas/ }).first().click()
  await page.waitForFunction(() => !window.__xadrez.cena().menu && !window.__xadrez.ocupado() && window.__xadrez.lancesDoJogador().length === 20, null, { timeout: 120000, polling: 300 })
  conferir('a partida guarda a dificuldade escolhida', (await h('dificuldadeDaPartida')) === 'facil')
  await h('jogar', 'e2', 'e4')
  await page.waitForFunction(() => window.__xadrez.fen().split(' ')[1] === 'w' && !window.__xadrez.ocupado(), null, { timeout: 120000, polling: 300 })
  conferir('a máquina responde no fácil', (await h('fen')).split(' ')[0] !== 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')

  // fechou e voltou: a partida continua no fácil, e o próximo novo jogo já vem marcado no fácil
  await page.waitForTimeout(1500)
  await abrir()
  await botao('Continuar partida').click()
  await page.waitForFunction(() => window.__xadrez.dificuldadeDaPartida() === 'facil', null, { timeout: 60000, polling: 300 })
  conferir('continuar a partida mantém a dificuldade', true)
  await page.locator('main').getByRole('button', { name: 'Novo jogo', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Com qual peça você quer jogar?' }).waitFor()
  conferir('o próximo novo jogo lembra a última dificuldade', (await page.getByRole('radio', { name: 'Fácil' }).getAttribute('aria-checked')) === 'true')
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
