// A insígnia das notificações: o ícone pequeno que o Android mostra na barra de cima e no canto do aviso (o `badge` do
// service worker). O Android usa só a transparência dele e pinta tudo de branco: o ícone colorido, que é opaco, virava
// um quadrado branco (visto pelo usuário, 27/11). Esta é a óticoin em silhueta: o aro da moeda, os pontos em volta e o
// peão no meio, brancos sobre o fundo transparente, nas proporções do icone-512.png.
//
//   node scripts/gerar-insignia.mjs   →   public/icones/insignia-96.png
//
// Não precisa de navegador nem de biblioteca: desenha com supersampling e grava o PNG com o zlib do Node.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const LADO = 96
/** Amostras por pixel, em cada direção (o antisserrilhado). */
const AMOSTRAS = 4

// as medidas na escala do icone-512.png (centro 256,256)
const ARO = { externo: 214, interno: 190 }
const PONTOS = { raio: 165, tamanho: 6.5, quantos: 28 }
/** O peão: a cabeça, o colar (com as abas), o corpo (um trapézio de lados curvos) e a base. */
function dentroDoPeao(x, y) {
  if ((x - 256) ** 2 + (y - 180) ** 2 <= 33 ** 2) return true
  if (y >= 196 && y <= 214 && Math.abs(x - 256) <= 44) return true
  if (y >= 214 && y <= 318) {
    const u = (y - 214) / (318 - 214)
    // estreito embaixo do colar, abrindo em curva até a base
    const meia = 20 + 52 * u ** 1.6
    if (Math.abs(x - 256) <= meia) return true
  }
  if (y >= 314 && y <= 352 && Math.abs(x - 256) <= 78) return true
  return false
}

function preenchido(x, y) {
  const r = Math.hypot(x - 256, y - 256)
  if (r <= ARO.externo && r >= ARO.interno) return true
  for (let i = 0; i < PONTOS.quantos; i++) {
    const a = (i / PONTOS.quantos) * Math.PI * 2
    if (Math.hypot(x - (256 + PONTOS.raio * Math.cos(a)), y - (256 + PONTOS.raio * Math.sin(a))) <= PONTOS.tamanho) return true
  }
  return dentroDoPeao(x, y)
}

// a imagem: branco, com a transparência vinda da cobertura de cada pixel
const linhas = []
for (let py = 0; py < LADO; py++) {
  const linha = Buffer.alloc(1 + LADO * 4)
  linha[0] = 0 // sem filtro
  for (let px = 0; px < LADO; px++) {
    let dentro = 0
    for (let sy = 0; sy < AMOSTRAS; sy++)
      for (let sx = 0; sx < AMOSTRAS; sx++) {
        const x = ((px + (sx + 0.5) / AMOSTRAS) / LADO) * 512
        const y = ((py + (sy + 0.5) / AMOSTRAS) / LADO) * 512
        if (preenchido(x, y)) dentro++
      }
    const o = 1 + px * 4
    linha[o] = linha[o + 1] = linha[o + 2] = 255
    linha[o + 3] = Math.round((255 * dentro) / (AMOSTRAS * AMOSTRAS))
  }
  linhas.push(linha)
}

const crcTabela = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (dados) => {
  let c = 0xffffffff
  for (const b of dados) c = crcTabela[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const pedaco = (tipo, dados) => {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const fim = Buffer.alloc(4)
  fim.writeUInt32BE(crc(corpo))
  return Buffer.concat([tamanho, corpo, fim])
}
const cabecalho = Buffer.alloc(13)
cabecalho.writeUInt32BE(LADO, 0)
cabecalho.writeUInt32BE(LADO, 4)
cabecalho[8] = 8 // bits por canal
cabecalho[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pedaco('IHDR', cabecalho),
  pedaco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
  pedaco('IEND', Buffer.alloc(0)),
])
const destino = new URL('../public/icones/insignia-96.png', import.meta.url)
writeFileSync(destino, png)
console.log('gravado', destino.pathname, png.length, 'bytes')
