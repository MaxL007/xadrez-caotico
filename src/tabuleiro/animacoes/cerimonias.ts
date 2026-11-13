import * as THREE from 'three'
import { DESENHO_NA_MEMORIA } from '../casas'
import { explodirPoder, spriteDeBrilho } from '../combate/poderes'

// As cenas especiais: as pétalas da rendição com honra e a ascensão da promoção.

// ---------------------------------------------------------------------------
// Pétalas de cerejeira (sakura) — caem devagar balançando em volta do peão que se rende com honra.
// ---------------------------------------------------------------------------
function criarTexturaPetala(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  const gradiente = ctx.createRadialGradient(32, 40, 2, 32, 32, 30)
  gradiente.addColorStop(0, '#fff3f7')
  gradiente.addColorStop(0.6, '#f7b6cc')
  gradiente.addColorStop(1, '#e98aab')
  ctx.fillStyle = gradiente
  ctx.beginPath()
  // pétala: gota com um entalhe na ponta
  ctx.moveTo(32, 60)
  ctx.bezierCurveTo(6, 44, 10, 10, 26, 6)
  ctx.lineTo(32, 13)
  ctx.lineTo(38, 6)
  ctx.bezierCurveTo(54, 10, 58, 44, 32, 60)
  ctx.fill()
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}
const texturaPetala = criarTexturaPetala()

/** Pétalas caindo em volta de `centro` durante `duracaoMs`. */
export function animarPetalas(cena: THREE.Object3D, centro: THREE.Vector3, duracaoMs: number) {
  interface Petala {
    sprite: THREE.Sprite
    inicio: number
    vida: number
    x: number
    z: number
    altura: number
    fase: number
  }
  const petalas: Petala[] = []
  const inicio = performance.now()
  let ultima = 0
  function passo(agora: number) {
    const decorrido = agora - inicio
    if (decorrido < duracaoMs - 1200 && agora - ultima > 90) {
      ultima = agora
      const material = new THREE.SpriteMaterial({ map: texturaPetala, transparent: true, depthWrite: false })
      const sprite = new THREE.Sprite(material)
      sprite.scale.setScalar(0.07 + Math.random() * 0.04)
      cena.add(sprite)
      const angulo = Math.random() * Math.PI * 2
      const raio = 0.2 + Math.random() * 0.7
      petalas.push({
        sprite,
        inicio: agora,
        vida: 2600 + Math.random() * 1200,
        x: centro.x + Math.cos(angulo) * raio,
        z: centro.z + Math.sin(angulo) * raio,
        altura: 1.3 + Math.random() * 0.6,
        fase: Math.random() * Math.PI * 2,
      })
    }
    for (let i = petalas.length - 1; i >= 0; i--) {
      const p = petalas[i]
      const t = (agora - p.inicio) / p.vida
      if (t >= 1) {
        cena.remove(p.sprite)
        p.sprite.material.dispose()
        petalas.splice(i, 1)
        continue
      }
      // cai devagar, balançando de um lado pro outro e girando
      p.sprite.position.set(
        p.x + Math.sin(t * 6 + p.fase) * 0.12,
        Math.max(0.03, p.altura * (1 - t)),
        p.z + Math.cos(t * 5 + p.fase) * 0.08,
      )
      p.sprite.material.rotation = p.fase + t * 4
      p.sprite.material.opacity = t > 0.8 ? (1 - t) / 0.2 : 1
    }
    if (decorrido < duracaoMs || petalas.length) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

// ---------------------------------------------------------------------------
// Ascensão do peão que chega ao outro lado (promoção): uma coluna de luz o envolve, anéis sobem
// em volta e partículas sobem girando em espiral; ele levita girando devagar, um clarão e ele
// vira a peça nova, que desce de volta pra casa enquanto a luz se desfaz.
// ---------------------------------------------------------------------------
function criarTexturaColuna(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  const gradiente = ctx.createLinearGradient(0, 256, 0, 0)
  gradiente.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradiente.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  gradiente.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradiente
  ctx.fillRect(0, 0, 4, 256)
  return new THREE.CanvasTexture(canvas)
}
const texturaColuna = criarTexturaColuna()
const geoColunaAscensao = new THREE.CylinderGeometry(0.42, 0.42, 3.2, 40, 1, true)
const geoAnelAscensao = new THREE.TorusGeometry(0.38, 0.014, 8, 64)

const DURACAO_SUBIDA_ASCENSAO_MS = 1700
const DURACAO_DESCIDA_ASCENSAO_MS = 900
const ALTURA_ASCENSAO = 0.45

/**
 * `aoClarao` troca a peça (o peão vira a nova) e devolve a peça nova — que desce de volta pra casa;
 * `aoTerminar` roda quando ela pousa.
 */
export function animarAscensao(
  cena: THREE.Object3D,
  peao: THREE.Object3D,
  cor: THREE.ColorRepresentation,
  aoClarao: () => THREE.Object3D | undefined,
  aoTerminar: () => void,
) {
  const base = new THREE.Vector3(peao.position.x, 0, peao.position.z)
  const yPeca = peao.position.y
  const efeito = new THREE.Group()
  efeito.position.copy(base)
  cena.add(efeito)
  const materialColuna = new THREE.MeshBasicMaterial({
    map: texturaColuna,
    color: cor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const coluna = new THREE.Mesh(geoColunaAscensao, materialColuna)
  coluna.position.y = 1.6
  efeito.add(coluna)
  const aneis = [0, 1, 2].map((i) => {
    const anel = new THREE.Mesh(
      geoAnelAscensao,
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffe08a : cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    anel.rotation.x = Math.PI / 2
    efeito.add(anel)
    return anel
  })
  const luz = new THREE.PointLight(cor, 0, 3.5, 2)
  luz.position.y = 0.6
  efeito.add(luz)

  // partículas subindo em espiral
  interface Faisca {
    sprite: THREE.Sprite
    inicio: number
    angulo: number
    raio: number
  }
  const faiscas: Faisca[] = []
  let ultimaFaisca = 0

  let pecaNova: THREE.Object3D | undefined
  let fase: 'subindo' | 'descendo' = 'subindo'
  let inicioFase = performance.now()
  const rumoInicial = peao.rotation.y

  function atualizarFaiscas(agora: number, criando: boolean) {
    if (criando && agora - ultimaFaisca > 30) {
      ultimaFaisca = agora
      const sprite = spriteDeBrilho(Math.random() < 0.35 ? 0xffe08a : cor, 0.09)
      efeito.add(sprite)
      faiscas.push({ sprite, inicio: agora, angulo: Math.random() * Math.PI * 2, raio: 0.3 + Math.random() * 0.15 })
    }
    for (let i = faiscas.length - 1; i >= 0; i--) {
      const f = faiscas[i]
      const t = (agora - f.inicio) / 1400
      if (t >= 1) {
        efeito.remove(f.sprite)
        f.sprite.material.dispose()
        faiscas.splice(i, 1)
        continue
      }
      const angulo = f.angulo + t * Math.PI * 3
      const raio = f.raio * (1 - t * 0.5)
      f.sprite.position.set(Math.cos(angulo) * raio, t * 1.8, Math.sin(angulo) * raio)
      f.sprite.material.opacity = t < 0.15 ? t / 0.15 : 1 - t
    }
  }

  function passo(agora: number) {
    const t = Math.min(1, (agora - inicioFase) / (fase === 'subindo' ? DURACAO_SUBIDA_ASCENSAO_MS : DURACAO_DESCIDA_ASCENSAO_MS))
    atualizarFaiscas(agora, fase === 'subindo')
    if (fase === 'subindo') {
      const suave = t * t * (3 - 2 * t)
      peao.position.y = yPeca + ALTURA_ASCENSAO * suave
      peao.rotation.y = rumoInicial + suave * Math.PI * 2
      materialColuna.opacity = 0.85 * Math.min(1, t * 2)
      coluna.scale.set(1 - 0.25 * t, Math.min(1, t * 1.5), 1 - 0.25 * t)
      luz.intensity = 6 * t
      aneis.forEach((anel, i) => {
        const ti = (t * 1.4 + i * 0.25) % 1
        anel.position.y = ti * 1.3
        anel.scale.setScalar(1.1 - ti * 0.45)
        ;(anel.material as THREE.MeshBasicMaterial).opacity = Math.sin(ti * Math.PI) * Math.min(1, t * 3)
      })
      if (t >= 1) {
        // clarão: o peão vira a peça nova, que começa lá em cima e desce
        explodirPoder(cena, new THREE.Vector3(base.x, yPeca + ALTURA_ASCENSAO + 0.45, base.z), cor)
        pecaNova = aoClarao()
        if (pecaNova) pecaNova.position.y = yPeca + ALTURA_ASCENSAO
        fase = 'descendo'
        inicioFase = agora
      }
    } else {
      const suave = 1 - Math.pow(1 - t, 3)
      if (pecaNova) pecaNova.position.y = yPeca + ALTURA_ASCENSAO * (1 - suave)
      materialColuna.opacity = 0.85 * (1 - t)
      luz.intensity = 6 * (1 - t)
      aneis.forEach((anel) => {
        ;(anel.material as THREE.MeshBasicMaterial).opacity *= 0.9
      })
      if (t >= 1) {
        if (pecaNova) pecaNova.position.y = yPeca
        cena.remove(efeito)
        materialColuna.dispose()
        aneis.forEach((anel) => (anel.material as THREE.Material).dispose())
        for (const f of faiscas) f.sprite.material.dispose()
        aoTerminar()
        return
      }
    }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}
