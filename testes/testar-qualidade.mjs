// A qualidade do jogo: a média é o padrão, também pra quem já tinha a alta gravada sem nunca ter escolhido; a escolha
// feita nas Configurações vale; e a resolução do desenho de cada qualidade, no computador e no celular. Precisa do site
// no ar (npm run dev); o desenho 3D fica desligado, mas o tamanho do canvas é o que ele teria.
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')

const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
let falhas = 0
const conferir = (nome, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra ? ' — ' + extra : ''}`)
  if (!cond) falhas++
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const erros = []

/** Abre o jogo com a configuração gravada antes (null: aparelho novo) e devolve a página. */
async function abrir(contexto, gravada) {
  const page = await contexto.newPage()
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 300)))
  await page.addInitScript((gravada) => {
    window.__semDesenho = true
    if (gravada && !sessionStorage.getItem('gravou')) {
      localStorage.setItem('xadrez:config', JSON.stringify(gravada))
      sessionStorage.setItem('gravou', '1')
    }
  }, gravada)
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  return page
}

/** A qualidade marcada nas Configurações. */
async function marcada(page) {
  await page.locator('main').getByRole('button', { name: 'Perfil', exact: true }).click()
  await page.getByRole('tab', { name: 'Configurações', exact: true }).click()
  const escolhida = await page.getByRole('radiogroup', { name: 'Qualidade do jogo' }).locator('[aria-checked="true"]').innerText()
  return escolhida
}

/** O botão de uma qualidade, nas Configurações. */
const qualidade = (page, nome) => page.getByRole('radiogroup', { name: 'Qualidade do jogo' }).getByRole('radio', { name: nome, exact: true })

/** Quantos pixels o desenho tem por pixel da tela. */
const resolucao = (page) =>
  page.waitForFunction(() => {
    const canvas = document.querySelector('main canvas')
    return canvas && canvas.clientWidth > 0 ? Math.round((canvas.width / canvas.clientWidth) * 100) / 100 : false
  }, null, { timeout: 30000, polling: 300 }).then((r) => r.jsonValue())

try {
  // =================== no computador ===================
  let contexto = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  let page = await abrir(contexto, null)
  conferir('aparelho novo: o jogo abre na média', (await marcada(page)) === 'Média')
  conferir('a média no computador: um pouco mais que a tela, perto de Full HD', Math.abs((await resolucao(page)) - 1.4) < 0.05, String(await resolucao(page)))
  conferir('a explicação da média aparece', (await page.locator('[data-configuracoes]').innerText()).includes('O padrão: boa de jogar'))
  await qualidade(page, 'Baixa').click()
  conferir('a baixa no computador: abaixo da resolução da tela', Math.abs((await resolucao(page)) - 0.8) < 0.05, String(await resolucao(page)))
  conferir('a explicação da baixa fala dos aparelhos fracos', (await page.locator('[data-configuracoes]').innerText()).includes('celulares e computadores mais fracos'))
  await qualidade(page, 'Alta').click()
  conferir('a alta continua no mínimo Full HD', Math.abs((await resolucao(page)) - 1.75) < 0.05, String(await resolucao(page)))
  conferir('a escolha fica gravada como escolha', (await page.evaluate(() => JSON.parse(localStorage.getItem('xadrez:config')).qualidadeEscolhida)) === true)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { timeout: 120000, polling: 300 })
  conferir('escolhida, a alta volta ao abrir de novo', (await marcada(page)) === 'Alta')
  await contexto.close()

  // quem já jogava tinha a alta gravada sem ter escolhido (o aparelho grava a configuração inteira na primeira vez)
  contexto = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  page = await abrir(contexto, { qualidade: 'alta', som: true, volume: 0.6, ambiente: true, toque: true, registro: true, telaMovel: true, idioma: 'pt-BR' })
  conferir('quem tinha a alta gravada sem escolher passa pra média', (await marcada(page)) === 'Média')
  await contexto.close()

  // =================== no celular ===================
  contexto = await browser.newContext({ ...devices['Pixel 7'] })
  page = await abrir(contexto, null)
  const media = await resolucao(page)
  conferir('a média no celular: 1,6 vez a tela, bem menos que a alta', Math.abs(media - 1.6) < 0.05, String(media))
  await marcada(page)
  await qualidade(page, 'Baixa').click()
  const baixa = await resolucao(page)
  conferir('a baixa no celular: a resolução da própria tela, sem passar', Math.abs(baixa - 1) < 0.05, String(baixa))
  await qualidade(page, 'Alta').click()
  const alta = await resolucao(page)
  conferir('a alta no celular continua como estava', alta > 2.5, String(alta))
  conferir('a baixa desenha bem menos pixels que a média', (baixa / media) ** 2 < 0.45, `${Math.round((baixa / media) ** 2 * 100)}% dos pixels`)
  await contexto.close()
  conferir('sem erros de JavaScript', erros.length === 0, erros.join(' | '))
} catch (e) {
  falhas++
  console.log('FALHOU (parou):', e.message.split('\n')[0])
} finally {
  await browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
