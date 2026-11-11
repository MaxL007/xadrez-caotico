// Fotos da vitrine da Personalização, peça por peça, com o 3D ligado: é como se confere se as armaduras e as armas
// encaixam no corpo. Cria uma conta, liga "tudo liberado" nela direto no banco do simulador e escolhe as opções pela
// tela. Precisa do simulador e do site no ar. As fotos ficam em testes/saidas/personalizacao.
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const FOTOS = path.join(AQUI, 'saidas', 'personalizacao')
fs.mkdirSync(FOTOS, { recursive: true })
const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
const API = 'http://127.0.0.1:8787'
const ORIGEM = 'http://127.0.0.1:5184'

const nome = `Vitrine ${Date.now().toString(36).slice(-5)}`
const chave = crypto.pbkdf2Sync('senha-da-vitrine', `xadrez-caotico:v1:${nome.toLowerCase()}`, 1000, 32, 'sha256').toString('base64')
const conta = await (await fetch(`${API}/contas`, { method: 'POST', headers: { Origin: ORIGEM, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, chave }) })).json()
const pastaDoServidor = path.join(AQUI, '..', 'worker')
execFileSync(process.execPath, [path.join(pastaDoServidor, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'd1', 'execute', 'xadrez-caotico', '--local', '--command', `UPDATE usuarios SET tudo_liberado = 1 WHERE nome_busca = '${nome.toLowerCase()}'`], { cwd: pastaDoServidor, stdio: 'pipe' })

// por peça: o que vestir em cada foto (a peça começa sem arma), parte por parte (o quadrado da parte, depois a opção)
const CORPO_1 = [['cabeca', 'Elmo'], ['ombros', 'Placas'], ['maos', 'Manoplas'], ['peito', 'Brasão'], ['calca', 'Grevas'], ['botas', 'De ferro']]
const CORPO_2 = [['cabeca', 'Padrão'], ['ombros', 'Espinhos'], ['maos', 'Garras'], ['peito', 'Padrão'], ['calca', 'Padrão'], ['botas', 'Padrão']]
const PECAS = [
  ['Peão', [[...CORPO_1, ['arma', 'Espada']], [...CORPO_2, ['arma', 'Katana']]]],
  ['Torre', [[...CORPO_1, ['arma', 'Machado']], [...CORPO_2, ['arma', 'Maça']]]],
  ['Cavalo', [[...CORPO_1, ['cavalo', 'Armadura'], ['sela', 'De guerra'], ['cabresto', 'De guerra']], [...CORPO_2, ['cavalo', 'Padrão'], ['sela', 'Padrão'], ['cabresto', 'Padrão']]]],
  ['Bispo', [[...CORPO_1, ['arma', 'Cristal']], [...CORPO_2, ['arma', 'Lua']]]],
  ['Rainha', [[...CORPO_1, ['arma', 'Cetro']], [...CORPO_2, ['arma', 'Cristal']]]],
  ['Rei', [[...CORPO_1, ['arma', 'Lua']], [...CORPO_2, ['arma', 'Cetro']]]],
]

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
  page.setDefaultTimeout(150000)
  page.on('pageerror', (e) => console.log('erro na página:', e.message.slice(0, 200)))
  await page.addInitScript((sessao) => {
    localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
    localStorage.setItem('xadrezCaotico:sessao', JSON.stringify(sessao))
  }, { token: conta.token, usuario: conta.usuario })
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 150000, polling: 500 })
  await page.locator('main').getByRole('button', { name: 'Personalização', exact: true }).click()
  await page.locator('[data-vitrine]').waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-vitrine]')?.textContent?.includes('Carregando'), null, { timeout: 150000, polling: 500 })
  await page.waitForTimeout(2500)
  await page.locator('section[role=dialog]').screenshot({ path: path.join(FOTOS, 'painel.png'), timeout: 150000 })

  // SO=Peão,Cavalo tira só dessas peças
  const so = process.env.SO?.split(',')
  for (const [peca, conjuntos] of PECAS.filter(([nome]) => !so || so.includes(nome))) {
    await page.getByRole('tab', { name: peca, exact: true }).click()
    await page.waitForTimeout(1500)
    await page.locator('[data-vitrine]').screenshot({ path: path.join(FOTOS, `${peca}-padrao.png`), timeout: 150000 })
    for (const [n, opcoes] of conjuntos.entries()) {
      for (const [parte, opcao] of opcoes) {
        await page.locator(`[data-caixa="${parte}"]`).click()
        await page.locator(`[data-opcoes="${parte}"]`).getByRole('radio', { name: opcao, exact: true }).click()
      }
      await page.waitForTimeout(1800)
      await page.locator('section[role=dialog]').screenshot({ path: path.join(FOTOS, `${peca}-${n + 1}.png`), timeout: 150000 })
      console.log('foto', peca, n + 1)
    }
  }

  // a Loja: os expositores de cada peça e um equipamento aberto
  await page.locator('main').getByRole('button', { name: 'Voltar', exact: true }).click()
  await page.locator('main').getByRole('button', { name: 'Loja', exact: true }).click()
  await page.locator('[data-loja] [data-item]').first().waitFor()
  for (const [peca] of PECAS.filter(([nome]) => !so || so.includes(nome))) {
    await page.getByRole('tab', { name: peca, exact: true }).click()
    await page.waitForTimeout(2500)
    await page.locator('section[role=dialog]').screenshot({ path: path.join(FOTOS, `loja-${peca}.png`), timeout: 150000 })
    console.log('foto loja', peca)
  }
  await page.locator('[data-loja] [data-item] button').first().click()
  await page.locator('[data-item-aberto]').waitFor()
  await page.waitForTimeout(2500)
  await page.locator('section[role=dialog]').screenshot({ path: path.join(FOTOS, 'loja-aberto.png'), timeout: 150000 })
  console.log('foto loja aberto')
} finally {
  await browser.close()
}
