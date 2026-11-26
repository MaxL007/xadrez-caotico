// O adversário automático na tela, com duas pessoas em dois navegadores: as duas procuram no mesmo ritmo e caem na
// mesma partida, com o relógio do servidor (o nome do outro no lugar de "Máquina"); quem não faz o primeiro lance a
// tempo perde no relógio; denunciar e bloquear pelo menu do adversário, e desbloquear na aba Amigos. Também: a partida
// amistosa em blitz (o convite chega com o ritmo e a partida abre com o relógio) e o bilhete da partida contra a máquina.
// Precisa do site (npm run dev) e do servidor local (npm run dev em worker/) com ACELERAR_RELOGIO=30 em worker/.dev.vars.
import { createRequire } from 'module'
import crypto from 'crypto'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

// a partida automática fica fora da aba Amigos (um modo pra mais tarde): ?avancado=1 a mostra
const SITE = 'http://127.0.0.1:5184/xadrez-caotico/?avancado=1'
const API = 'http://127.0.0.1:8787'
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

async function api(metodo, caminho, { token, corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      Origin: 'http://127.0.0.1:5184',
      'CF-Connecting-IP': `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}
const derivar = (nome, senha) =>
  crypto.pbkdf2Sync(senha.normalize('NFC'), `xadrez-caotico:v1:${nome.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()}`, 1000, 32, 'sha256').toString('base64')
const novaConta = async (nome) => (await api('POST', '/contas', { corpo: { nome, chave: derivar(nome, 'senha-de-teste') } })).json

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const erros = []

async function jogador(conta) {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 760 } })).newPage()
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
  await page.addInitScript((sessao) => {
    window.__semDesenho = true
    localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
    localStorage.setItem('xadrezCaotico:sessao', JSON.stringify(sessao))
  }, { token: conta.token, usuario: conta.usuario })
  await page.goto(SITE, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { polling: 300 })
  return page
}
const abrirAmigos = (page) => page.locator('main').getByRole('button', { name: /^Amigos/ }).click()
const h = (page, fn, ...args) => page.evaluate(({ fn, args }) => window.__xadrez[fn](...args), { fn, args })

const sufixo = Date.now().toString(36).slice(-5)
const nomeA = `Auto A ${sufixo}`
const nomeB = `Auto B ${sufixo}`
const contaA = await novaConta(nomeA)
const contaB = await novaConta(nomeB)

let a
let b
try {
  a = await jogador(contaA)
  b = await jogador(contaB)

  // =================== as duas procuram e caem na mesma partida ===================
  await abrirAmigos(a)
  await abrirAmigos(b)
  await a.locator('[data-ritmo-automatico="5+0"]').click()
  await a.locator('[data-procurar]').click()
  await a.locator('[data-procurando]').waitFor()
  conferir('quem procura sozinho fica esperando, com o ritmo', (await a.locator('[data-procurando]').innerText()).includes('5+0'))
  await b.locator('[data-ritmo-automatico="5+0"]').click()
  await b.locator('[data-procurar]').click()
  await Promise.all([a.locator('[data-relogio="5+0"]').waitFor({ timeout: 30000 }), b.locator('[data-relogio="5+0"]').waitFor({ timeout: 30000 })])
  conferir('as duas entram na mesma partida, com o relógio da blitz', true)
  const salaA = await h(a, 'sala')
  const salaB = await h(b, 'sala')
  conferir('a mesma sala, com cores diferentes', salaA?.codigo === salaB?.codigo && salaA.minhaCor !== salaB.minhaCor && salaA.automatica === true, `${salaA?.codigo} ${salaA?.minhaCor} / ${salaB?.codigo} ${salaB?.minhaCor}`)
  const relogioA = await a.locator('[data-relogio]').innerText()
  conferir('o relógio mostra o nome de quem joga do outro lado', relogioA.includes(nomeB) && !relogioA.includes('Máquina'), relogioA.replace(/\s+/g, ' '))

  // ninguém joga: as brancas não fazem o primeiro lance a tempo (1 minuto, 2 s no relógio acelerado) e perdem
  const [brancas, pretas, nomeDasBrancas] = salaA.minhaCor === 'w' ? [a, b, nomeA] : [b, a, nomeB]
  // com o relógio acelerado a partida pode acabar antes de a segunda pessoa conectar: aí ela vê a partida terminada (o
  // texto, sem a taça). Por isso confere pelo estado da sala e fecha a taça só se ela estiver na tela
  for (const page of [brancas, pretas]) await page.waitForFunction(() => window.__xadrez.sala()?.status === 'fim', null, { timeout: 30000, polling: 300 })
  const fimDaSala = await h(pretas, 'sala')
  conferir('quem não jogou perde no relógio, e quem esperou vence', fimDaSala.motivo === 'tempo' && fimDaSala.resultado === 'pretas', JSON.stringify({ motivo: fimDaSala.motivo, resultado: fimDaSala.resultado }))
  for (const page of [brancas, pretas]) {
    const fechar = page.locator('[data-resultado]').getByRole('button', { name: 'Fechar', exact: true })
    if (await fechar.count()) await fechar.click()
  }
  await pretas.locator('[data-status-partida]').waitFor()
  const textoDasPretas = await pretas.locator('[data-status-partida]').innerText()
  conferir('a tela diz que o tempo do outro acabou', textoDasPretas.includes(`O tempo de ${nomeDasBrancas} acabou`), textoDasPretas.replace(/\s+/g, ' '))
  conferir('e contra quem foi a partida', (await pretas.locator('[data-adversario]').innerText()).includes(nomeDasBrancas))

  // =================== denunciar e bloquear ===================
  await pretas.locator('[data-menu-adversario]').click()
  await pretas.locator('[data-denunciar]').click()
  await pretas.locator('[data-motivo="comportamento"]').click()
  await pretas.locator('[data-denunciado]').waitFor()
  conferir('a denúncia sai pelo menu do adversário', true)
  await pretas.getByRole('button', { name: 'Fechar', exact: true }).click()
  await pretas.locator('[data-menu-adversario]').click()
  await pretas.locator('[data-bloquear]').click()
  await pretas.locator('[data-confirmar-bloqueio]').click()
  await pretas.locator('[data-bloqueado]').waitFor()
  conferir('e o bloqueio também', true)
  await pretas.getByRole('button', { name: 'Menu', exact: true }).click()
  await abrirAmigos(pretas)
  await pretas.locator('[data-bloqueados]').waitFor()
  conferir('quem foi bloqueado aparece em Amigos, com Desbloquear', (await pretas.locator('[data-bloqueados]').innerText()).includes(nomeDasBrancas))
  await pretas.locator('[data-desbloquear]').first().click()
  await pretas.locator('[data-bloqueados]').waitFor({ state: 'detached' })
  conferir('desbloquear tira da lista', true)

  // =================== blitz entre amigos ===================
  const idA = (await api('GET', '/amigos', { token: contaA.token })).json.meuId
  const idB = (await api('GET', '/amigos', { token: contaB.token })).json.meuId
  await api('POST', '/amigos', { token: contaA.token, corpo: { busca: idB } })
  await api('POST', '/amigos', { token: contaB.token, corpo: { busca: idA } })
  for (const page of [a, b]) {
    await page.goto(SITE, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { polling: 300 })
    await abrirAmigos(page)
  }
  await a.locator(`[data-amigo="${idB}"]`).getByRole('button', { name: 'Partida amistosa' }).click()
  await a.locator('[data-ritmo-amistosa] [data-ritmo="3+2"]').click()
  await a.locator(`[data-amigo="${idB}"]`).getByRole('button', { name: 'Brancas' }).click()
  await a.locator('[data-convite]').waitFor()
  conferir('quem chama em blitz espera com o relógio na tela', (await a.locator('[data-relogio="3+2"]').count()) === 1)
  await b.getByRole('button', { name: 'Voltar', exact: true }).click()
  await abrirAmigos(b)
  const recebida = b.getByText(`${nomeA} chamou você`)
  await recebida.waitFor({ timeout: 30000 })
  conferir('o convite chega dizendo o ritmo', (await recebida.innerText()).includes('Blitz 3+2'), await recebida.innerText())
  await b.getByRole('button', { name: 'Jogar', exact: true }).first().click()
  await b.locator('[data-relogio="3+2"]').waitFor()
  conferir('quem aceita entra na partida com o relógio', true)
  await b.getByRole('button', { name: 'Menu', exact: true }).click()
  await a.getByRole('button', { name: 'Menu', exact: true }).click()

  // =================== o bilhete da partida contra a máquina ===================
  await a.locator('main').getByRole('button', { name: 'Novo jogo', exact: true }).click()
  await a.locator('[data-modo-opcao="normal"]').click()
  await a.getByRole('button', { name: /Brancas/ }).first().click()
  await a.waitForFunction(() => window.__xadrez.partidaAtual()?.bilhete === true, null, { timeout: 30000, polling: 300 })
  conferir('a partida contra a máquina pede o bilhete ao começar', true)

  conferir('nenhum erro na página', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
  // a tela das duas no momento da falha, pra ver o que faltou
  for (const [nome, page] of [['a', a], ['b', b]]) {
    if (!page) continue
    await page.screenshot({ path: `testes/saidas/adversario-falha-${nome}.png` }).catch(() => undefined)
    console.log(`  tela ${nome}:`, (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400))
  }
} finally {
  await browser.close()
}
console.log(falhas ? `\n${falhas} conferência(s) falharam` : '\ntudo certo')
process.exit(falhas ? 1 : 0)
