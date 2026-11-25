// A blitz contra a máquina: a escolha do modo e do ritmo no "Novo jogo", o relógio de cada lado (corre só o de quem tem
// a vez, o acréscimo a cada lance, para fora da partida e volta no "Continuar"), e o fim no tempo pelas regras da FIDE:
// quem zera perde, a não ser que o outro não tenha peças para dar mate (empate). Precisa do site no ar (npm run dev); o
// 3D fica desligado. A parte da taça (se a vitória paga, no máximo 3 recompensas por hora) precisa também do servidor
// local (npm run dev em worker/).
import { createRequire } from 'module'
import crypto from 'crypto'
import { bilhetesAntigos, MATE } from './vitorias-de-teste.mjs'

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
const esperarParar = () => page.waitForFunction(() => !window.__xadrez.ocupado(), null, { timeout: 120000, polling: 200 })
const relogio = () => h('relogio')
/** A partida aberta terminou (a taça da anterior pode ainda estar na tela por um instante). O prazo é largo: logo depois
 * de recarregar com a conta aberta, a página sincroniza com o servidor enquanto a máquina pensa, e na máquina do GitHub
 * sobrecarregada isso passava dos 20 s de vez em quando (falha intermitente, sem defeito no jogo). */
const esperarFim = () => page.waitForFunction(() => window.__xadrez.partidaAtual()?.status === 'FINALIZADA', null, { timeout: 60000, polling: 100 })
/** Uma posição, com quem joga e as casas, num PGN que o tabuleiro aceita. */
const posicao = (fen) => `[SetUp "1"]\n[FEN "${fen}"]\n\n*`

try {
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })

  // =================== a escolha no "Novo jogo" ===================
  await botao('Novo jogo').click()
  const modos = await page.locator('[data-modo] [data-modo-opcao]').allInnerTexts()
  conferir('o "Novo jogo" oferece os modos normal e blitz', modos.join(',') === 'Normal,Blitz', modos.join(','))
  conferir('o normal vem marcado e não mostra ritmos', (await page.locator('[data-modo-opcao="normal"]').getAttribute('aria-checked')) === 'true' && (await page.locator('[data-ritmos]').count()) === 0)
  await page.locator('[data-modo-opcao="blitz"]').click()
  const ritmos = await page.locator('[data-ritmos] [data-ritmo]').allInnerTexts()
  conferir('a blitz mostra os ritmos 3+2, 5+0 e 5+3, com o 3+2 marcado', ritmos.join(',') === '3+2,5+0,5+3' && (await page.locator('[data-ritmo="3+2"]').getAttribute('aria-checked')) === 'true', ritmos.join(','))
  await page.locator('[data-ritmo="5+3"]').click()
  conferir('a explicação diz o tempo e o acréscimo', (await page.locator('[data-modo]').innerText()).includes('5 min para cada um e +3 s a cada lance'))
  await page.getByRole('button', { name: /Brancas/ }).first().click()
  await page.locator('[data-relogio="5+3"]').waitFor()
  const salva = await h('partidaAtual')
  conferir('a partida nasce com o relógio de 5 minutos pra cada lado', salva?.relogio?.ritmo === '5+3' && salva.relogio.w === 300000 && salva.relogio.b === 300000, JSON.stringify(salva?.relogio))
  const noRelogio = await page.locator('[data-relogio]').innerText()
  conferir('o relógio aparece com a máquina em cima e você embaixo', /Blitz 5\+3[\s\S]*Máquina[\s\S]*5:00[\s\S]*Você[\s\S]*[45]:\d\d/i.test(noRelogio), noRelogio.replace(/\s+/g, ' '))

  // =================== corre só o tempo de quem tem a vez ===================
  await page.waitForTimeout(1600)
  const depoisDeEsperar = await relogio()
  conferir('o seu tempo corre na sua vez', depoisDeEsperar.w < 300000 - 1200, JSON.stringify(depoisDeEsperar))
  conferir('e o da máquina fica parado', depoisDeEsperar.b === 300000)
  conferir('o seu lado aparece aceso e correndo', (await page.locator('[data-relogio-lado="w"]').getAttribute('data-ativo')) === 'correndo')
  const antesDoLance = (await relogio()).w
  await h('jogar', 'e2', 'e4')
  // a margem cobre o tempo entre ler o relógio e o lance entrar (que corre de verdade): num aparelho lento passa de meio segundo
  const depoisDoLance = await relogio()
  conferir('quem joga ganha o acréscimo de 3 s', depoisDoLance.w > antesDoLance + 1500 && depoisDoLance.w <= antesDoLance + 3000, `${antesDoLance} → ${depoisDoLance.w}`)
  await esperarParar()
  const depoisDaMaquina = await relogio()
  conferir('a máquina gasta o tempo dela pensando e também ganha o acréscimo', depoisDaMaquina.b !== 300000 && depoisDaMaquina.b > 300000 - 5000, JSON.stringify(depoisDaMaquina))
  conferir('o seu tempo não correu enquanto a máquina jogava', Math.abs(depoisDaMaquina.w - depoisDoLance.w) < 1500, `${depoisDoLance.w} → ${depoisDaMaquina.w}`)

  // =================== fora da partida o relógio para ===================
  const aoSair = (await relogio()).w
  await botao('Menu').click()
  // 5 s no menu: se contassem, o relógio voltaria com 5 s a menos (a margem cobre o clique e a volta da partida)
  await page.waitForTimeout(5000)
  await botao('Continuar partida').click()
  await page.locator('[data-relogio="5+3"]').waitFor()
  const aoVoltar = await relogio()
  conferir('no menu o relógio para, e a partida volta com o tempo de quando saiu', aoVoltar && aoSair - aoVoltar.w < 2500, `${aoSair} → ${aoVoltar?.w}`)
  await botao('Menu').click()

  // =================== o seu tempo zera: a máquina vence ===================
  await h('carregarTeste', '1. e4 e5', 'w', 'facil', '3+2')
  await esperarParar()
  await h('ajustarRelogio', 'w', 600)
  await esperarFim()
  await page.locator('[data-resultado="perdeu"]').waitFor({ timeout: 20000 })
  let partida = await h('partidaAtual')
  conferir('o seu tempo zerou: derrota no tempo', partida.status === 'FINALIZADA' && partida.resultado === 'A máquina venceu (tempo)', partida.resultado)
  conferir('a tela diz que o tempo acabou', (await page.locator('[data-resultado="perdeu"]').innerText()).includes('Seu tempo acabou'))
  conferir('o relógio mostra 0:00.0 do seu lado', (await page.locator('[data-relogio-lado="w"] [data-tempo]').innerText()) === '0:00.0')
  const fenNoFim = await h('fen')
  await h('jogar', 'g1', 'f3')
  await page.waitForTimeout(300)
  conferir('e não deixa mais jogar', (await h('fen')) === fenNoFim)

  // =================== o tempo da máquina zera: você vence ===================
  await h('carregarTeste', '1. e4', 'w', 'facil', '3+2')
  await h('ajustarRelogio', 'b', 50)
  await esperarFim()
  await page.locator('[data-resultado="venceu"]').waitFor({ timeout: 20000 })
  partida = await h('partidaAtual')
  conferir('o tempo da máquina zerou: vitória no tempo', partida.resultado === 'Você venceu (tempo)', partida.resultado)
  conferir('o lance que a máquina pensava não entra', !(await h('fen')).includes(' w '), await h('fen'))
  await page.waitForTimeout(1500)
  conferir('nem depois', !(await h('fen')).includes(' w '))

  // =================== sem peças para dar mate: empate ===================
  // você só com o rei: a máquina zera o tempo, mas você não teria como dar mate
  await h('carregarTeste', posicao('4k3/8/8/8/8/8/3q4/4K3 b - - 0 1'), 'w', 'facil', '3+2')
  await h('ajustarRelogio', 'b', 50)
  await esperarFim()
  await page.locator('[data-resultado="empate"]').waitFor({ timeout: 20000 })
  partida = await h('partidaAtual')
  conferir('a máquina zera o tempo, mas você só tem o rei: empate', partida.resultado === 'Empate (tempo esgotado, sem peças para dar mate)', partida.resultado)
  // rei e bispo contra rei e dama: existe um mate (com a dama tapando a fuga do próprio rei), então é vitória
  await h('carregarTeste', posicao('4k3/8/8/8/8/8/3q4/4K1B1 b - - 0 1'), 'w', 'facil', '3+2')
  await h('ajustarRelogio', 'b', 50)
  await esperarFim()
  conferir('rei e bispo contra rei e dama: o mate existe, vitória no tempo', (await h('partidaAtual')).resultado === 'Você venceu (tempo)', (await h('partidaAtual')).resultado)
  // com um peão já dá: vitória
  await h('carregarTeste', posicao('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1'), 'w', 'facil', '3+2')
  await h('ajustarRelogio', 'b', 50)
  await esperarFim()
  await page.locator('[data-resultado="venceu"]').waitFor({ timeout: 20000 })
  conferir('com um peão, o tempo da máquina zerado é vitória', (await h('partidaAtual')).resultado === 'Você venceu (tempo)')

  // =================== a partida normal não tem relógio ===================
  await h('carregarTeste', '1. e4 e5', 'w', 'facil')
  await esperarParar()
  conferir('a partida normal não mostra relógio', (await page.locator('[data-relogio]').count()) === 0 && (await relogio()) === null)

  // =================== a taça diz se a vitória paga: no máximo 3 recompensas por hora ===================
  const API = 'http://127.0.0.1:8787'
  const api = async (metodo, caminho, { token, corpo, endereco } = {}) => {
    const r = await fetch(`${API}${caminho}`, {
      method: metodo,
      headers: {
        Origin: 'http://127.0.0.1:5184',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(endereco ? { 'CF-Connecting-IP': endereco } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const derivar = (nome, senha) =>
    crypto.pbkdf2Sync(senha.normalize('NFC'), `xadrez-caotico:v1:${nome.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()}`, 1000, 32, 'sha256').toString('base64')
  const novaConta = async (nome) => (await api('POST', '/contas', { corpo: { nome, chave: derivar(nome, 'senha-de-teste') }, endereco: `198.51.100.${Math.floor(Math.random() * 250) + 1}` })).json
  // o aparelho limpo antes de entrar: as vitórias de teste de antes (de convidado) podiam ir pra conta e ocupar as vagas
  // da hora, e a taça dizia "sem prêmio" ou não, conforme a velocidade da máquina
  async function entrarComo(conta) {
    await page.evaluate(
      async (sessao) => {
        for (const banco of await indexedDB.databases()) {
          if (banco.name) indexedDB.deleteDatabase(banco.name)
        }
        for (const chave of Object.keys(localStorage)) if (chave !== 'xadrez:config') localStorage.removeItem(chave)
        localStorage.setItem('xadrezCaotico:sessao', JSON.stringify(sessao))
      },
      { token: conta.token, usuario: conta.usuario },
    )
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  }
  async function vencerNoTempo() {
    await h('carregarTeste', '1. e4', 'w', 'facil', '3+2')
    await h('ajustarRelogio', 'b', 50)
    await esperarFim()
    await page.locator('[data-resultado="venceu"]').waitFor({ timeout: 60000 })
  }
  const sufixo = Date.now().toString(36)
  const comVaga = await novaConta(`Blitz ${sufixo}`)
  await entrarComo(comVaga)
  await vencerNoTempo()
  // o prêmio ou o aviso de sem prêmio: o que vier diz o que aconteceu
  await page.locator('[data-premio], [data-sem-premio]').first().waitFor({ timeout: 20000 })
  const naTaca = await page.locator('[data-premio], [data-sem-premio]').first().innerText()
  conferir('com vaga na hora, a taça mostra o prêmio da vitória', naTaca.includes('+1 pela vitória'), naTaca)

  const semVaga = await novaConta(`Blitz cheia ${sufixo}`)
  const vitoria = (id) => ({ store: 'xadrezPartidas', dados: { id, jogador: 'x', ...MATE, status: 'FINALIZADA', resultado: 'Você venceu (xeque-mate)', dificuldade: 'facil', criadaEm: Date.now(), atualizadaEm: Date.now() } })
  await api('POST', '/registros', { token: semVaga.token, corpo: { registros: ['ja-1', 'ja-2', 'ja-3'].map(vitoria) } })
  bilhetesAntigos(`Blitz cheia ${sufixo}`, ['ja-1', 'ja-2', 'ja-3'].map((id) => ({ id, dificuldade: 'facil' })))
  const pagas = (await api('POST', '/vitorias/receber', { token: semVaga.token, corpo: { partidas: ['ja-1', 'ja-2', 'ja-3'] } })).json
  conferir('a conta já recebeu as 3 recompensas da hora', pagas?.pagas?.length === 3, JSON.stringify(pagas))
  await entrarComo(semVaga)
  await vencerNoTempo()
  await page.locator('[data-sem-premio]').waitFor({ timeout: 20000 })
  const aviso = await page.locator('[data-sem-premio]').innerText()
  conferir('sem vaga, a taça diz que não paga e a que horas volta', aviso.includes('no máximo 3 recompensas por hora') && /\d\d:\d\d/.test(aviso) && (await page.locator('[data-premio]').count()) === 0, aviso)
  await page.evaluate(() => localStorage.removeItem('xadrezCaotico:sessao'))

  conferir('nenhum erro na página', erros.length === 0, erros.join(' | '))
} finally {
  await browser.close()
}
console.log(falhas ? `\n${falhas} conferência(s) falharam` : '\ntudo certo')
process.exit(falhas ? 1 : 0)
