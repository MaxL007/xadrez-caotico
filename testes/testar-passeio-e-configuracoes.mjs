// O passeio da primeira vez (6 passos, cada botão em destaque, Pular, não volta depois e some para quem já jogou), a
// página de privacidade (pelas Configurações e na criação de conta, sem perder o que foi digitado) e os volumes por
// categoria nas Configurações. Precisa do site no ar (npm run dev); o 3D fica desligado.
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

async function abrir({ comPasseio = true, viewport = { width: 1100, height: 760 } } = {}) {
  const contexto = await browser.newContext({ viewport })
  const page = await contexto.newPage()
  page.setDefaultTimeout(120000)
  await page.addInitScript((com) => {
    window.__semDesenho = true
    window.__comPasseio = com
    if (!localStorage.getItem('xadrez:config')) localStorage.setItem('xadrez:config', JSON.stringify({ qualidade: 'baixa', qualidadeEscolhida: true, som: false, ambiente: false }))
  }, comPasseio)
  await page.goto(SITE, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { polling: 500 })
  return { contexto, page }
}

try {
  // --- o passeio, do começo ao fim -----------------------------------------------------------------------------------
  {
    const { contexto, page } = await abrir()
    await page.locator('[data-passeio-passo="0"]').waitFor({ timeout: 15000 })
    conferir('o passeio aparece sozinho na primeira vez', true)
    const alvos = [null, 'novoJogo', 'amigos', 'loja', 'perfil', null]
    for (let passo = 0; passo < alvos.length; passo++) {
      await page.locator(`[data-passeio-passo="${passo}"]`).waitFor()
      const alvo = alvos[passo]
      if (alvo) {
        await page.waitForTimeout(450) // o anel desliza até o botão
        // o anel em destaque fica em volta do botão do passo
        const caixa = await page.locator(`[data-passeio="${alvo}"]`).boundingBox()
        const anel = await page.locator('[data-passeio-passo] .ring-2').boundingBox()
        const emVolta = caixa && anel && anel.x <= caixa.x && anel.y <= caixa.y && anel.x + anel.width >= caixa.x + caixa.width && anel.y + anel.height >= caixa.y + caixa.height
        conferir(`passo ${passo + 1}: destaque em "${alvo}"`, !!emVolta)
      }
      await page.locator('[data-passeio-proximo]').click()
    }
    await page.locator('[data-passeio-passo]').waitFor({ state: 'detached' })
    conferir('"Começar a jogar" fecha o passeio', true)
    conferir('fica marcado como visto', (await page.evaluate(() => localStorage.getItem('xadrez:passeioVisto'))) === '1')
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__xadrez?.carregarTeste, null, { polling: 500 })
    await page.waitForTimeout(2500)
    conferir('não volta ao abrir de novo', (await page.locator('[data-passeio-passo]').count()) === 0)

    // Configurações: rever o passeio, a privacidade e os volumes
    const abaConfiguracoes = () => page.getByRole('tab', { name: 'Configurações' }).click()
    await page.locator('[data-passeio="perfil"]').click()
    await abaConfiguracoes()
    await page.locator('[data-rever-passeio]').click()
    await page.locator('[data-passeio-passo="0"]').waitFor()
    conferir('"Ver de novo" nas Configurações abre o passeio', true)
    await page.locator('[data-passeio-pular]').click()
    await page.locator('[data-passeio-passo]').waitFor({ state: 'detached' })
    conferir('Pular fecha', true)

    await page.locator('[data-passeio="perfil"]').click()
    await abaConfiguracoes()
    const volumes = page.locator('[data-volumes] input[type=range]')
    conferir('três volumes por categoria', (await volumes.count()) === 3)
    conferir('sem som, os volumes ficam desligados', await volumes.nth(1).isDisabled())
    await page.getByRole('switch', { name: 'Som', exact: true }).click()
    await volumes.nth(1).fill('0.3')
    const config = await page.evaluate(() => JSON.parse(localStorage.getItem('xadrez:config')))
    conferir('o volume dos passos fica guardado', config.volumePassos === 0.3, String(config.volumePassos))
    await page.locator('[data-abrir-privacidade]').click()
    await page.locator('[data-privacidade]').waitFor()
    const titulos = await page.locator('[data-privacidade] h4').allTextContents()
    conferir('a privacidade abre pelas Configurações', titulos.length >= 8, titulos.join(' / '))
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    conferir('Voltar leva de volta às Configurações do Perfil', (await page.locator('[data-rever-passeio]').count()) === 1)
    await contexto.close()
  }

  // --- a privacidade na criação de conta, sem perder o que foi digitado ----------------------------------------------
  {
    const { contexto, page } = await abrir({ comPasseio: false })
    await page.getByRole('button', { name: 'Entrar', exact: true }).first().click()
    await page.getByRole('button', { name: 'Criar uma conta' }).click()
    await page.getByLabel('Nome de jogador').fill('Leitor')
    await page.locator('[data-aceite-privacidade] [data-abrir-privacidade]').click()
    await page.locator('[data-privacidade]').waitFor()
    conferir('a criação de conta abre a privacidade ali mesmo', true)
    await page.locator('[data-voltar-conta]').click()
    conferir('volta com o nome digitado', (await page.getByLabel('Nome de jogador').inputValue()) === 'Leitor')
    conferir('e ainda criando conta', (await page.locator('[data-aceite-privacidade]').count()) === 1)
    await contexto.close()
  }

  // --- quem já jogou não vê o passeio --------------------------------------------------------------------------------
  {
    // começa uma partida sem o passeio; depois o passeio fica liberado e a página abre de novo
    const { contexto, page } = await abrir({ comPasseio: false })
    await page.locator('[data-passeio="novoJogo"]').click()
    await page.getByRole('button', { name: /Brancas/ }).first().click()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar partida' }).waitFor()
    await page.evaluate(() => localStorage.removeItem('xadrez:passeioVisto'))
    await page.addInitScript(() => (window.__comPasseio = true))
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-passeio="novoJogo"]').waitFor()
    await page.waitForTimeout(3000)
    conferir('com partida, o passeio não aparece', (await page.locator('[data-passeio-passo]').count()) === 0)
    conferir('e fica marcado como visto', (await page.evaluate(() => localStorage.getItem('xadrez:passeioVisto'))) === '1')
    await contexto.close()
  }

  // --- no celular, o cartão cabe na tela -----------------------------------------------------------------------------
  {
    const { contexto, page } = await abrir({ viewport: { width: 360, height: 740 } })
    for (let passo = 0; passo < 6; passo++) {
      await page.locator(`[data-passeio-passo="${passo}"]`).waitFor({ timeout: 15000 })
      const cartao = await page.locator('[data-passeio-passo] [aria-live]').boundingBox()
      conferir(`celular, passo ${passo + 1}: o cartão cabe na tela`, !!cartao && cartao.x >= 0 && cartao.y >= 0 && cartao.x + cartao.width <= 360 && cartao.y + cartao.height <= 740, JSON.stringify(cartao))
      await page.locator('[data-passeio-proximo]').click()
    }
    await contexto.close()
  }
} finally {
  await browser.close()
}

console.log(falhas ? `\n${falhas} conferência(s) falharam` : '\ntudo certo')
process.exit(falhas ? 1 : 0)
