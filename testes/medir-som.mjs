// Mede cada som do jogo do jeito que ele sai no alto-falante: renderiza fora da tela (OfflineAudioContext), pela
// mesma cadeia de saída do jogo (cadeiaDeSaida, em src/som/sons.ts), e confere que nenhum estoura (pico abaixo de
// 0,98), nem com o volume no máximo, nem com vários juntos. Compara também com a cadeia de antes, pra mostrar quanto
// ficou mais alto. O ruído é sorteado: cada som é medido três vezes e vale o maior pico.
// Precisa do site no ar (npm run dev).
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const SITE = 'http://127.0.0.1:5184/xadrez-caotico/'
const browser = await chromium.launch()
let falhas = 0
try {
  const page = await browser.newPage()
  // o 3D não importa aqui
  await page.addInitScript(() => (window.__semDesenho = true))
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 })
  const resultado = await page.evaluate(async () => {
    const sons = await import('/xadrez-caotico/src/som/sons.ts')
    const TAXA = 44100
    /** A cadeia de antes: volume geral e um limitador a -9 dB, sem reforço. */
    const cadeiaAntiga = (ctx, volume) => {
      const geral = ctx.createGain()
      geral.gain.value = volume
      const limite = ctx.createDynamicsCompressor()
      limite.threshold.value = -9
      limite.ratio.value = 10
      limite.attack.value = 0.003
      limite.release.value = 0.2
      geral.connect(limite).connect(ctx.destination)
      return { efeitos: geral }
    }
    async function medir(nomes, volume, antiga = false) {
      let pico = 0
      let rms = 0
      for (let vez = 0; vez < 3; vez++) {
        const ctx = new OfflineAudioContext(1, TAXA * 4, TAXA)
        const { efeitos } = antiga ? cadeiaAntiga(ctx, volume) : sons.cadeiaDeSaida(ctx, volume)
        for (const nome of nomes) sons.SONS[nome]({ ctx, destino: efeitos, t: 0.01, v: 1 })
        const dados = (await ctx.startRendering()).getChannelData(0)
        let soma = 0
        for (const x of dados) {
          pico = Math.max(pico, Math.abs(x))
          soma += x * x
        }
        rms = Math.max(rms, Math.sqrt(soma / dados.length))
      }
      return { pico, rms }
    }
    const nomes = Object.keys(sons.SONS)
    const porSom = []
    for (const nome of nomes) {
      const novo = await medir([nome], 1)
      const antigo = await medir([nome], 0.6, true)
      const padrao = await medir([nome], 0.8)
      porSom.push({ nome, pico: novo.pico, ganhoDb: 20 * Math.log10((padrao.rms + 1e-9) / (antigo.rms + 1e-9)) })
    }
    // os juntos que mais pesam: a marretada com a queda, o xeque com o golpe, a fuga do cavalo com a maça
    const juntos = [
      ['marreta:impacto', 'esmagado', 'queda:r'],
      ['xeque', 'golpe:p', 'queda:p'],
      ['maca:espinhos', 'fuga:n', 'tornado'],
      ['cavalo:chega', 'promocao', 'encaixe'],
    ]
    const emGrupo = []
    for (const grupo of juntos) emGrupo.push({ nome: grupo.join(' + '), pico: (await medir(grupo, 1)).pico })
    return { porSom, emGrupo }
  })
  const ganhos = resultado.porSom.map((s) => s.ganhoDb).filter((g) => Number.isFinite(g))
  const media = ganhos.reduce((a, b) => a + b, 0) / ganhos.length
  for (const s of [...resultado.porSom, ...resultado.emGrupo]) {
    const ok = s.pico < 0.98
    if (!ok) falhas++
    console.log(`${ok ? 'ok  ' : 'FALHOU'} ${s.nome.padEnd(40)} pico ${s.pico.toFixed(3)}${s.ganhoDb !== undefined ? `  ${s.ganhoDb >= 0 ? '+' : ''}${s.ganhoDb.toFixed(1)} dB` : ''}`)
  }
  console.log(`\nno volume padrão (0,8) contra o de antes (0,6 na cadeia antiga): em média ${media >= 0 ? '+' : ''}${media.toFixed(1)} dB`)
  if (media < 3) {
    falhas++
    console.log('FALHOU o som não ficou mais alto o bastante')
  }
} finally {
  await browser.close()
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
process.exit(falhas ? 1 : 0)
