import * as THREE from 'three'
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Os ataques de cada arma na captura, como o usuário descreveu: o retalhamento da katana (a peça em pedaços), o
// machado que corta a peça ao meio, as rachaduras e o tremor da marreta, o cristal convocado a 75°, a gravidade do
// cetro que afunda a peça no chão e o tornado da lua que a arremessa longe. A maça (a peça presa nos espinhos) mora
// na marretada, em marreta.ts, porque segue o braço da torre; aqui fica só o cavalo que foge quando ela pega o
// cavaleiro.
// Cada efeito chama `aoTerminar` quando a vítima já sumiu: aí o lance segue.

/** O tabuleiro: as peças pisam em y = 0,05 e o tampo das casas fica logo abaixo. */
const CHAO_DAS_CASAS = 0.03
/** A mesa, embaixo do tabuleiro (pra peça que cai fora dele). */
const CHAO_DA_MESA = -0.36
const METADE_DO_TABULEIRO = 4.4

/** Roda `passo(t)` com t de 0 a 1 ao longo de `duracao` e chama `fim` no último quadro. */
function animar(duracao: number, passo: (t: number, decorrido: number) => void, fim?: () => void) {
  const inicio = performance.now()
  const quadro = (agora: number) => {
    const decorrido = agora - inicio
    const t = Math.min(1, decorrido / duracao)
    passo(t, decorrido)
    if (t < 1) requestAnimationFrame(quadro)
    else fim?.()
  }
  requestAnimationFrame(quadro)
}

const suave = (t: number) => t * t * (3 - 2 * t)

let texturaDoBrilho: THREE.CanvasTexture | null = null
function brilho(cor: THREE.ColorRepresentation, tamanho: number, opacidade = 1): THREE.Sprite {
  if (!texturaDoBrilho) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    const gradiente = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradiente.addColorStop(0, 'rgba(255,255,255,1)')
    gradiente.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    gradiente.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradiente
    ctx.fillRect(0, 0, 64, 64)
    texturaDoBrilho = new THREE.CanvasTexture(canvas)
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texturaDoBrilho, color: cor, transparent: true, opacity: opacidade, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  sprite.scale.setScalar(tamanho)
  return sprite
}

/** Os materiais da peça são compartilhados entre todas da mesma cor: a vítima ganha cópias, que podem sumir ou ser
 * cortadas sem mexer nas outras. Devolve a função que muda a opacidade. */
function materiaisSoDela(peca: THREE.Object3D, planos?: THREE.Plane[], doisLados = false): (opacidade: number) => void {
  const materiais: THREE.Material[] = []
  peca.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const copiar = (m: THREE.Material) => {
      const copia = m.clone()
      copia.transparent = true
      if (planos) copia.clippingPlanes = planos
      if (doisLados) copia.side = THREE.DoubleSide
      materiais.push(copia)
      return copia
    }
    obj.material = Array.isArray(obj.material) ? obj.material.map(copiar) : copiar(obj.material)
  })
  return (opacidade) => materiais.forEach((m) => (m.opacity = opacidade))
}

function liberar(objeto: THREE.Object3D) {
  objeto.removeFromParent()
  objeto.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
      const material = obj.material as THREE.Material | THREE.Material[]
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }
  })
}

/** Altura da peça (as peças têm uns 0,9 de altura na escala 1). */
const alturaDa = (peca: THREE.Object3D) => 0.9 * peca.scale.y

// ---------------------------------------------------------------------------------------------------------------
// Katana — retalhamento: o rastro de cada corte e a peça em pedaços que caem no tabuleiro e somem
// ---------------------------------------------------------------------------------------------------------------

/** Um corte da katana no ar: um arco fino e brilhante que passa pela peça e some. */
export function rastroDeCorte(cena: THREE.Object3D, peca: THREE.Object3D, cor: THREE.ColorRepresentation) {
  const altura = alturaDa(peca)
  const arco = new THREE.Mesh(
    new THREE.TorusGeometry(0.36 * peca.scale.y, 0.024, 6, 32, Math.PI * 0.8),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  const nucleo = new THREE.Mesh(
    new THREE.TorusGeometry(0.36 * peca.scale.y, 0.009, 4, 32, Math.PI * 0.8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  const corte = new THREE.Group()
  corte.add(arco, nucleo)
  corte.position.set(peca.position.x, peca.position.y + altura * (0.35 + Math.random() * 0.35), peca.position.z)
  // cada corte num ângulo diferente: diagonal, horizontal, de baixo pra cima
  corte.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI)
  cena.add(corte)
  animar(
    260,
    (t) => {
      corte.rotation.z += 0.32
      corte.scale.setScalar(0.85 + t * 0.35)
      ;(arco.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t)
      ;(nucleo.material as THREE.MeshBasicMaterial).opacity = 1 - t
    },
    () => {
      ;[arco, nucleo].forEach((m) => m.geometry.dispose())
      liberar(corte)
    },
  )
}

/** A peça se desfaz em pedacinhos do material dela, que caem e quicam no tabuleiro e somem aos poucos. */
export function despedacar(cena: THREE.Object3D, peca: THREE.Object3D, aoTerminar: () => void) {
  const materiais: THREE.Material[] = []
  peca.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.visible) return
    for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) if (!materiais.includes(m)) materiais.push(m)
  })
  const deles = materiais.length ? materiais.map((m) => Object.assign(m.clone(), { transparent: true })) : [new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true })]
  const altura = alturaDa(peca)
  const largura = 0.36 * peca.scale.x
  const centro = peca.position.clone()
  peca.visible = false

  const pedacos: { malha: THREE.Mesh; velocidade: THREE.Vector3; giro: THREE.Vector3; chao: number; parado: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const tamanho = 0.025 + Math.random() * 0.055
    const geo = Math.random() < 0.5 ? new THREE.BoxGeometry(tamanho, tamanho * (0.6 + Math.random()), tamanho * (0.5 + Math.random())) : new THREE.TetrahedronGeometry(tamanho * 0.8)
    const malha = new THREE.Mesh(geo, deles[i % deles.length])
    malha.castShadow = true
    malha.position.set(centro.x + (Math.random() - 0.5) * largura, centro.y + Math.random() * altura, centro.z + (Math.random() - 0.5) * largura)
    malha.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    const fora = new THREE.Vector3(malha.position.x - centro.x, 0, malha.position.z - centro.z).normalize()
    const velocidade = fora.multiplyScalar(0.4 + Math.random() * 0.9).add(new THREE.Vector3(0, 0.6 + Math.random() * 1.2, 0))
    const longe = Math.abs(malha.position.x) > METADE_DO_TABULEIRO || Math.abs(malha.position.z) > METADE_DO_TABULEIRO
    cena.add(malha)
    pedacos.push({ malha, velocidade, giro: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), chao: longe ? CHAO_DA_MESA : CHAO_DAS_CASAS, parado: false })
  }
  let anterior = performance.now()
  animar(
    1900,
    (t) => {
      const agora = performance.now()
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      for (const p of pedacos) {
        if (!p.parado) {
          p.velocidade.y -= 6 * dt
          p.malha.position.addScaledVector(p.velocidade, dt)
          p.malha.rotation.x += p.giro.x * dt
          p.malha.rotation.y += p.giro.y * dt
          p.malha.rotation.z += p.giro.z * dt
          if (p.malha.position.y <= p.chao) {
            // quica baixo e para, deitado no chão
            p.malha.position.y = p.chao
            p.velocidade.y = Math.abs(p.velocidade.y) * 0.3
            p.velocidade.x *= 0.5
            p.velocidade.z *= 0.5
            p.giro.multiplyScalar(0.4)
            if (p.velocidade.y < 0.15) p.parado = true
          }
        }
      }
      const opacidade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      deles.forEach((m) => (m.opacity = opacidade))
    },
    () => {
      for (const p of pedacos) {
        p.malha.geometry.dispose()
        p.malha.removeFromParent()
      }
      deles.forEach((m) => m.dispose())
      aoTerminar()
    },
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Machado — a peça cortada ao meio: a metade de cima escorrega pelo corte e tomba, e as duas somem
// ---------------------------------------------------------------------------------------------------------------

export function cortarAoMeio(cena: THREE.Object3D, peca: THREE.Object3D, rumo: { x: number; z: number }, aoTerminar: () => void) {
  const altura = alturaDa(peca)
  const tamanho = Math.hypot(rumo.x, rumo.z) || 1
  const frente = new THREE.Vector3(rumo.x / tamanho, 0, rumo.z / tamanho)
  // o corte é diagonal, de cima pra baixo na direção do golpe
  const normal = new THREE.Vector3(0, 1, 0).addScaledVector(frente, -0.45).normalize()
  const pontoDoCorte = peca.position.clone().add(new THREE.Vector3(0, altura * 0.5, 0))
  const planoDeCima = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pontoDoCorte)
  const planoDeBaixo = planoDeCima.clone().negate()

  // a metade de cima é uma cópia parada da peça na pose em que estava; a de baixo é a própria peça
  peca.updateMatrixWorld(true)
  // copiar a peça copia os dados dela, e os da animação (o mixer) não se copiam: a cópia sai sem eles
  const dadosGuardados: [THREE.Object3D, Record<string, unknown>][] = []
  peca.traverse((obj) => {
    dadosGuardados.push([obj, obj.userData])
    obj.userData = {}
  })
  const deCima = clonarComEsqueleto(peca)
  for (const [obj, dados] of dadosGuardados) obj.userData = dados
  cena.add(deCima)
  deCima.updateMatrixWorld(true)
  const planoLocal = planoDeCima.clone().applyMatrix4(deCima.matrixWorld.clone().invert())
  const sumirCima = materiaisSoDela(deCima, [planoDeCima], true)
  const sumirBaixo = materiaisSoDela(peca, [planoDeBaixo], true)

  // o fio do corte brilha um instante
  const fio = new THREE.Mesh(
    new THREE.CircleGeometry(0.26 * peca.scale.x, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  fio.position.copy(pontoDoCorte)
  fio.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  cena.add(fio)

  const inicio = deCima.position.clone()
  const giroInicial = deCima.quaternion.clone()
  // escorrega pela inclinação do corte, pra frente, e tomba pro lado do golpe
  const escorrega = new THREE.Vector3().crossVectors(normal, new THREE.Vector3().crossVectors(frente, normal)).normalize()
  const eixoDoTombo = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frente).normalize()
  const pivo = pontoDoCorte.clone().addScaledVector(frente, 0.1 * peca.scale.x)
  // as duas metades ficam um tempo à vista: a de cima escorrega, tomba e cai no tabuleiro, a de baixo continua em pé
  animar(
    2000,
    (t, decorrido) => {
      ;(fio.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.max(0, 1 - decorrido / 320)
      const desliza = suave(Math.min(1, t / 0.4))
      const cai = Math.min(1, Math.max(0, (t - 0.18) / 0.42))
      // tomba girando na beirada do corte (não nos pés, senão afundaria no tabuleiro) e cai até deitar no chão
      const giro = new THREE.Quaternion().setFromAxisAngle(eixoDoTombo, suave(cai) * 1.45)
      deCima.position.copy(inicio).sub(pivo).applyQuaternion(giro).add(pivo)
      deCima.position.addScaledVector(escorrega, desliza * 0.2 * peca.scale.x)
      deCima.position.y -= cai * cai * (altura * 0.5 - 0.07 * peca.scale.y)
      deCima.quaternion.copy(giro).multiply(giroInicial)
      deCima.updateMatrixWorld(true)
      planoDeCima.copy(planoLocal).applyMatrix4(deCima.matrixWorld)
      const opacidade = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28
      sumirCima(opacidade)
      sumirBaixo(opacidade)
    },
    () => {
      liberar(fio)
      liberar(deCima)
      peca.visible = false
      aoTerminar()
    },
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Marreta — rachaduras de verdade na madeira e o tabuleiro tremendo
// ---------------------------------------------------------------------------------------------------------------

/** Rachaduras novas a cada pancada: um afundamento no meio, rachas que se afinam e se ramificam, com a borda da
 * madeira clara de um lado, e lascas soltas. */
function desenharRachaduras(): THREE.CanvasTexture {
  const tamanho = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = tamanho
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  const centro = tamanho / 2
  const afundado = ctx.createRadialGradient(centro, centro, 4, centro, centro, 70)
  afundado.addColorStop(0, 'rgba(12,7,3,0.92)')
  afundado.addColorStop(0.55, 'rgba(25,14,6,0.45)')
  afundado.addColorStop(1, 'rgba(25,14,6,0)')
  ctx.fillStyle = afundado
  ctx.fillRect(0, 0, tamanho, tamanho)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const racha = (x: number, y: number, angulo: number, comprimento: number, largura: number, nivel: number) => {
    const passos = 9
    let px = x
    let py = y
    for (let i = 0; i < passos; i++) {
      angulo += (Math.random() - 0.5) * 0.65
      const nx = px + (Math.cos(angulo) * comprimento) / passos
      const ny = py + (Math.sin(angulo) * comprimento) / passos
      const espessura = largura * (1 - i / passos) + 0.6
      // a borda clara da madeira lascada, um pouco ao lado, e a fenda escura por cima
      ctx.strokeStyle = 'rgba(255,226,180,0.28)'
      ctx.lineWidth = espessura + 1.4
      ctx.beginPath()
      ctx.moveTo(px + 1.2, py + 1.2)
      ctx.lineTo(nx + 1.2, ny + 1.2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(14,8,3,0.95)'
      ctx.lineWidth = espessura
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(nx, ny)
      ctx.stroke()
      if (nivel < 2 && Math.random() < 0.28) racha(nx, ny, angulo + (Math.random() < 0.5 ? 0.7 : -0.7), comprimento * 0.45, espessura * 0.7, nivel + 1)
      px = nx
      py = ny
    }
  }
  const rachas = 8 + Math.floor(Math.random() * 4)
  for (let i = 0; i < rachas; i++) racha(centro, centro, (i / rachas) * Math.PI * 2 + Math.random() * 0.5, 120 + Math.random() * 110, 6 + Math.random() * 3, 0)
  // lascas e pó escuro em volta do afundamento
  for (let i = 0; i < 70; i++) {
    const angulo = Math.random() * Math.PI * 2
    const distancia = 20 + Math.random() * 90
    ctx.fillStyle = Math.random() < 0.3 ? 'rgba(230,200,150,0.5)' : 'rgba(20,11,5,0.7)'
    ctx.beginPath()
    ctx.arc(centro + Math.cos(angulo) * distancia, centro + Math.sin(angulo) * distancia, 1 + Math.random() * 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 4
  return textura
}

/** As rachaduras ficam um tempo no tabuleiro e somem aos poucos. `tamanho` em casas. */
export function rachadurasNoTabuleiro(cena: THREE.Object3D, x: number, z: number, tamanho = 1.5, ficaMs = 2200) {
  const textura = desenharRachaduras()
  const material = new THREE.MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const rachadura = new THREE.Mesh(new THREE.PlaneGeometry(tamanho, tamanho), material)
  rachadura.rotation.x = -Math.PI / 2
  rachadura.rotation.z = Math.random() * Math.PI * 2
  rachadura.position.set(x, CHAO_DAS_CASAS - 0.008, z)
  rachadura.renderOrder = 1
  cena.add(rachadura)
  // abre rápido, de dentro pra fora
  animar(
    ficaMs + 1000,
    (_t, decorrido) => {
      rachadura.scale.setScalar(0.35 + 0.65 * suave(Math.min(1, decorrido / 140)))
      material.opacity = decorrido < ficaMs ? 1 : 1 - (decorrido - ficaMs) / 1000
    },
    () => {
      rachadura.geometry.dispose()
      textura.dispose()
      liberar(rachadura)
    },
  )
}

/** O tabuleiro inteiro treme com a pancada: um solavanco pra baixo e uma vibração que se acalma. Quem pediu menos
 * movimento no sistema sente um tremor bem mais leve. */
export function tremerTabuleiro(cena: THREE.Object3D, forca = 0.16, duracao = 560) {
  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const intensidade = forca * (reduzido ? 0.3 : 1)
  animar(
    duracao,
    (t) => {
      const queda = intensidade * (1 - t) * (1 - t)
      cena.position.set(
        Math.sin(t * 70) * queda * 0.6 + (Math.random() - 0.5) * queda * 0.4,
        -Math.abs(Math.sin(t * 40)) * queda * 0.7,
        Math.cos(t * 63) * queda * 0.6 + (Math.random() - 0.5) * queda * 0.4,
      )
    },
    () => cena.position.set(0, 0, 0),
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Cristal — um cristal médio é convocado no alto e desce a 75° do tabuleiro, só dentro da casa da vítima
// ---------------------------------------------------------------------------------------------------------------

export function convocarCristal(
  cena: THREE.Object3D,
  vitima: THREE.Object3D,
  deOnde: THREE.Vector3,
  cor: THREE.ColorRepresentation,
  aoConvocar: () => void,
  aoAcertar: () => void,
) {
  const alvo = vitima.position.clone().add(new THREE.Vector3(0, alturaDa(vitima) * 0.45, 0))
  // vem do lado de quem atacou, inclinado 15° da vertical (75° do tabuleiro): sai do alto da própria casa
  const lado = new THREE.Vector3(deOnde.x - alvo.x, 0, deOnde.z - alvo.z)
  if (lado.lengthSq() < 1e-6) lado.set(0, 0, 1)
  lado.normalize()
  const angulo = THREE.MathUtils.degToRad(75)
  const descida = new THREE.Vector3().addScaledVector(lado, -Math.cos(angulo)).add(new THREE.Vector3(0, -Math.sin(angulo), 0)).normalize()
  const distancia = 1.25
  const inicio = alvo.clone().addScaledVector(descida, -distancia)

  const corDoCristal = new THREE.Color(cor).lerp(new THREE.Color(0xbfe9ff), 0.55)
  const material = new THREE.MeshStandardMaterial({
    color: corDoCristal,
    emissive: corDoCristal,
    emissiveIntensity: 0.55,
    roughness: 0.08,
    metalness: 0.15,
    flatShading: true,
    transparent: true,
    opacity: 0,
  })
  const geometria = new THREE.OctahedronGeometry(0.11, 0)
  geometria.scale(1, 3.4, 1)
  const cristal = new THREE.Mesh(geometria, material)
  cristal.castShadow = true
  const aura = brilho(corDoCristal, 0.55, 0)
  cristal.add(aura)
  cristal.position.copy(inicio)
  cristal.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), descida)
  cena.add(cristal)
  const luz = new THREE.PointLight(corDoCristal, 0, 2.2, 2)
  luz.position.copy(inicio)
  cena.add(luz)
  aoConvocar()

  // brilhinhos que se juntam onde o cristal nasce
  const faiscas: THREE.Sprite[] = []
  for (let i = 0; i < 10; i++) {
    const f = brilho(corDoCristal, 0.08)
    f.position.copy(inicio).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7))
    cena.add(f)
    faiscas.push(f)
  }
  const deOndeVem = faiscas.map((f) => f.position.clone())
  animar(
    520,
    (t) => {
      const e = suave(t)
      cristal.scale.setScalar(0.2 + 0.8 * e)
      material.opacity = 0.9 * e
      ;(aura.material as THREE.SpriteMaterial).opacity = 0.8 * e
      luz.intensity = 3 * e
      cristal.rotateOnAxis(new THREE.Vector3(0, 1, 0), 0.12)
      faiscas.forEach((f, i) => f.position.lerpVectors(deOndeVem[i], inicio, e))
    },
    () => {
      faiscas.forEach(liberar)
      // desce de uma vez pela linha de 75°
      animar(
        170,
        (t) => {
          cristal.position.copy(inicio).addScaledVector(descida, distancia * t * t)
          luz.position.copy(cristal.position)
        },
        () => {
          aoAcertar()
          estilhacarCristal(cena, cristal.position.clone(), corDoCristal)
          liberar(cristal)
          geometria.dispose()
          animar(
            350,
            (t) => (luz.intensity = 4 * (1 - t)),
            () => liberar(luz),
          )
        },
      )
    },
  )
}

/** O cristal se parte em estilhaços que não passam da casa: raio curto e queda rápida. */
function estilhacarCristal(cena: THREE.Object3D, onde: THREE.Vector3, cor: THREE.Color) {
  const material = new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.6, roughness: 0.1, flatShading: true, transparent: true })
  const estilhacos: { malha: THREE.Mesh; velocidade: THREE.Vector3 }[] = []
  for (let i = 0; i < 20; i++) {
    const malha = new THREE.Mesh(new THREE.OctahedronGeometry(0.03 + Math.random() * 0.04, 0), material)
    malha.position.copy(onde)
    const angulo = Math.random() * Math.PI * 2
    estilhacos.push({ malha, velocidade: new THREE.Vector3(Math.cos(angulo) * 0.55, 0.6 + Math.random() * 0.9, Math.sin(angulo) * 0.55) })
    cena.add(malha)
  }
  const clarao = brilho(cor, 0.9)
  clarao.position.copy(onde)
  cena.add(clarao)
  let anterior = performance.now()
  animar(
    650,
    (t) => {
      const agora = performance.now()
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      for (const e of estilhacos) {
        e.velocidade.y -= 7 * dt
        e.malha.position.addScaledVector(e.velocidade, dt)
        e.malha.position.y = Math.max(CHAO_DAS_CASAS, e.malha.position.y)
        e.malha.rotation.x += 0.3
      }
      material.opacity = 1 - t
      clarao.scale.setScalar(0.9 + t * 0.4)
      ;(clarao.material as THREE.SpriteMaterial).opacity = 1 - t
    },
    () => {
      estilhacos.forEach((e) => {
        e.malha.geometry.dispose()
        e.malha.removeFromParent()
      })
      material.dispose()
      liberar(clarao)
    },
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Cetro — gravidade: o chão vira um poço, a peça é esmagada pra baixo e afunda no tabuleiro até sumir
// ---------------------------------------------------------------------------------------------------------------

export function afundarPelaGravidade(cena: THREE.Object3D, peca: THREE.Object3D, cor: THREE.ColorRepresentation, aoTerminar: () => void) {
  const altura = alturaDa(peca)
  const centro = peca.position.clone()
  const corDaGravidade = new THREE.Color(cor).lerp(new THREE.Color(0x5b2a86), 0.6)
  // o que passa do tampo do tabuleiro pra baixo não aparece: é a peça entrando no chão
  const chao = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CHAO_DAS_CASAS)
  materiaisSoDela(peca, [chao])

  // o poço: um disco escuro no chão e anéis que se fecham pro centro
  const poco = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 48),
    new THREE.MeshBasicMaterial({ color: 0x0b0412, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  )
  poco.rotation.x = -Math.PI / 2
  poco.position.set(centro.x, CHAO_DAS_CASAS - 0.004, centro.z)
  cena.add(poco)
  const aneis = [0, 1, 2, 3].map(() => {
    const anel = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.44, 48),
      new THREE.MeshBasicMaterial({ color: corDaGravidade, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    anel.rotation.x = -Math.PI / 2
    anel.position.set(centro.x, CHAO_DAS_CASAS + 0.004, centro.z)
    cena.add(anel)
    return anel
  })
  // linhas de força caindo sobre a peça
  const linhas = Array.from({ length: 12 }, () => {
    const linha = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4),
      new THREE.MeshBasicMaterial({ color: corDaGravidade, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    const angulo = Math.random() * Math.PI * 2
    const raio = 0.12 + Math.random() * 0.28
    linha.position.set(centro.x + Math.cos(angulo) * raio, 0, centro.z + Math.sin(angulo) * raio)
    linha.userData.fase = Math.random()
    cena.add(linha)
    return linha
  })
  const luz = new THREE.PointLight(corDaGravidade, 0, 1.8, 2)
  luz.position.set(centro.x, 0.5, centro.z)
  cena.add(luz)

  const escalaInicial = peca.scale.clone()
  let rachou = false
  animar(
    1900,
    (t, decorrido) => {
      const entrada = Math.min(1, t / 0.15)
      ;(poco.material as THREE.MeshBasicMaterial).opacity = 0.75 * entrada * (t > 0.88 ? (1 - t) / 0.12 : 1)
      luz.intensity = 2.5 * entrada * (t > 0.88 ? (1 - t) / 0.12 : 1)
      aneis.forEach((anel, i) => {
        const ciclo = ((decorrido / 700 + i / aneis.length) % 1)
        anel.scale.setScalar(1 - ciclo * 0.9)
        ;(anel.material as THREE.MeshBasicMaterial).opacity = 0.8 * entrada * Math.sin(ciclo * Math.PI) * (t > 0.88 ? (1 - t) / 0.12 : 1)
      })
      for (const linha of linhas) {
        const ciclo = (decorrido / 380 + (linha.userData.fase as number)) % 1
        linha.position.y = altura * 1.5 * (1 - ciclo)
        ;(linha.material as THREE.MeshBasicMaterial).opacity = 0.7 * entrada * Math.sin(ciclo * Math.PI) * (t > 0.8 ? 0 : 1)
      }
      // primeiro a peça é espremida pra baixo, tremendo; depois afunda no tabuleiro, cada vez mais achatada
      const aperto = suave(Math.min(1, t / 0.3))
      const afunda = Math.max(0, (t - 0.3) / 0.6)
      const tremor = (1 - afunda) * 0.012
      peca.scale.set(escalaInicial.x * (1 + 0.1 * aperto), escalaInicial.y * (1 - 0.28 * aperto - 0.25 * afunda), escalaInicial.z * (1 + 0.1 * aperto))
      peca.position.set(centro.x + (Math.random() - 0.5) * tremor, centro.y - afunda * afunda * altura * 1.15, centro.z + (Math.random() - 0.5) * tremor)
      if (!rachou && t > 0.3) {
        rachou = true
        rachadurasNoTabuleiro(cena, centro.x, centro.z, 1.0, 1400)
      }
    },
    () => {
      peca.visible = false
      ;[poco, ...aneis, ...linhas].forEach((m) => {
        m.geometry.dispose()
        liberar(m)
      })
      liberar(luz)
      aoTerminar()
    },
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Lua — um tornado sobe do chão, levanta a peça girando e a arremessa longe, pra fora do tabuleiro
// ---------------------------------------------------------------------------------------------------------------

let texturaDoVento: THREE.CanvasTexture | null = null
function obterTexturaDoVento(): THREE.CanvasTexture {
  if (texturaDoVento) return texturaDoVento
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  // faixas inclinadas de vento, mais claras no meio
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * 256
    const gradiente = ctx.createLinearGradient(0, y, 256, y - 60)
    const forca = 0.15 + Math.random() * 0.45
    gradiente.addColorStop(0, 'rgba(255,255,255,0)')
    gradiente.addColorStop(0.5, `rgba(255,255,255,${forca})`)
    gradiente.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.strokeStyle = gradiente
    ctx.lineWidth = 2 + Math.random() * 7
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(256, y - 60)
    ctx.stroke()
  }
  texturaDoVento = new THREE.CanvasTexture(canvas)
  texturaDoVento.wrapS = texturaDoVento.wrapT = THREE.RepeatWrapping
  return texturaDoVento
}

export function tornadoDaLua(cena: THREE.Object3D, peca: THREE.Object3D, rumo: { x: number; z: number }, cor: THREE.ColorRepresentation, aoTerminar: () => void) {
  const altura = alturaDa(peca)
  const centro = peca.position.clone()
  const corDoVento = new THREE.Color(cor).lerp(new THREE.Color(0xdde8ff), 0.6)
  const tornado = new THREE.Group()
  tornado.position.copy(centro)
  cena.add(tornado)
  const camadas = [
    { topo: 0.5, base: 0.07, altura: 1.9, velocidade: 9, opacidade: 0.55 },
    { topo: 0.36, base: 0.05, altura: 1.75, velocidade: -12, opacidade: 0.45 },
    { topo: 0.24, base: 0.04, altura: 1.6, velocidade: 15, opacidade: 0.35 },
  ].map((c) => {
    const textura = obterTexturaDoVento().clone()
    textura.needsUpdate = true
    textura.repeat.set(2, 1)
    const malha = new THREE.Mesh(
      new THREE.CylinderGeometry(c.topo, c.base, c.altura, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: corDoVento, map: textura, alphaMap: textura, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    )
    malha.position.y = c.altura / 2
    tornado.add(malha)
    return { ...c, malha, textura }
  })
  // poeira girando na base e subindo
  const poeira = Array.from({ length: 22 }, () => {
    const p = brilho(corDoVento, 0.12 + Math.random() * 0.12, 0)
    p.userData.angulo = Math.random() * Math.PI * 2
    p.userData.subida = Math.random()
    tornado.add(p)
    return p
  })

  const tamanho = Math.hypot(rumo.x, rumo.z) || 1
  const fora = { x: rumo.x / tamanho, z: rumo.z / tamanho }
  // longe: pra fora do tabuleiro, na mesa
  const destino = new THREE.Vector3(centro.x + fora.x * 5.2, CHAO_DA_MESA, centro.z + fora.z * 5.2)
  const sumir = materiaisSoDela(peca)
  const giroInicial = peca.rotation.y
  const ALTO = altura * 1.5
  animar(
    2900,
    (_t, decorrido) => {
      const sobe = suave(Math.min(1, decorrido / 450))
      const dissipa = decorrido > 1700 ? Math.min(1, (decorrido - 1700) / 600) : 0
      tornado.scale.set(1 + dissipa * 0.6, sobe, 1 + dissipa * 0.6)
      for (const c of camadas) {
        c.malha.rotation.y += c.velocidade * 0.016
        c.textura.offset.y -= 0.025
        ;(c.malha.material as THREE.MeshBasicMaterial).opacity = c.opacidade * sobe * (1 - dissipa)
      }
      for (const p of poeira) {
        p.userData.subida = ((p.userData.subida as number) + 0.012) % 1
        p.userData.angulo = (p.userData.angulo as number) + 0.22
        const s = p.userData.subida as number
        const raio = 0.08 + s * 0.42
        p.position.set(Math.cos(p.userData.angulo as number) * raio, s * 1.8, Math.sin(p.userData.angulo as number) * raio)
        ;(p.material as THREE.SpriteMaterial).opacity = 0.6 * sobe * (1 - dissipa) * Math.sin(s * Math.PI)
      }
      // a peça sobe girando dentro do tornado
      if (decorrido < 1300) {
        const levanta = suave(Math.max(0, (decorrido - 250) / 1050))
        peca.position.set(centro.x + Math.sin(decorrido / 60) * 0.03, centro.y + levanta * ALTO, centro.z + Math.cos(decorrido / 60) * 0.03)
        peca.rotation.y = giroInicial + levanta * Math.PI * 6
        return
      }
      // e é arremessada longe, num arco, girando
      const voo = Math.min(1, (decorrido - 1300) / 900)
      const saida = new THREE.Vector3(centro.x, centro.y + ALTO, centro.z)
      peca.position.lerpVectors(saida, destino, voo)
      peca.position.y += Math.sin(voo * Math.PI) * 1.2
      peca.rotation.y = giroInicial + Math.PI * 6 + voo * Math.PI * 4
      peca.rotation.x = voo * Math.PI * 1.5
      if (decorrido > 2250) sumir(Math.max(0, 1 - (decorrido - 2250) / 600))
    },
    () => {
      peca.visible = false
      for (const c of camadas) {
        c.malha.geometry.dispose()
        c.textura.dispose()
      }
      liberar(tornado)
      aoTerminar()
    },
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Maça num cavalo: o cavaleiro fica preso nos espinhos e o cavalo, solto, foge do tabuleiro
// ---------------------------------------------------------------------------------------------------------------

/** O cavalo foge a essa velocidade (casas por segundo) e com o passo do clipe acelerado assim. */
const GALOPE = 2.6
const RITMO_DO_GALOPE = 2.2
/** Na beirada do tabuleiro, pula pra mesa; some entre essas distâncias do centro, já fora dele. */
const PULA_DA_BEIRADA = 4.2
const COMECA_A_SUMIR = 4.4
const SUMIU = 5.3

/** Divide a malha do cavalo montado em duas pelo osso que mais puxa cada vértice: os do Mixamo são do cavaleiro, os
 * outros (Cavalo, Cauda, as patas, o pescoço), do animal. As duas partes usam os mesmos dados dos vértices; só a lista
 * de triângulos muda, então a malha das outras peças, que é a mesma, fica inteira. */
function dividirCavaleiro(malha: THREE.SkinnedMesh): { cavalo: THREE.BufferGeometry; cavaleiro: THREE.BufferGeometry } {
  const geo = malha.geometry
  const ossos = geo.getAttribute('skinIndex')
  const pesos = geo.getAttribute('skinWeight')
  const total = geo.getAttribute('position').count
  const doCavalo = new Uint8Array(total)
  for (let v = 0; v < total; v++) {
    let maior = -1
    let osso = 0
    for (let k = 0; k < 4; k++) {
      const peso = pesos.getComponent(v, k)
      if (peso > maior) {
        maior = peso
        osso = ossos.getComponent(v, k)
      }
    }
    doCavalo[v] = malha.skeleton.bones[osso]?.name.startsWith('mixamorig') ? 0 : 1
  }
  const ordem = geo.index ? Array.from(geo.index.array) : Array.from({ length: total }, (_, i) => i)
  const cavalo: number[] = []
  const cavaleiro: number[] = []
  for (let i = 0; i + 2 < ordem.length; i += 3) {
    const [a, b, c] = [ordem[i], ordem[i + 1], ordem[i + 2]]
    ;(doCavalo[a] + doCavalo[b] + doCavalo[c] >= 2 ? cavalo : cavaleiro).push(a, b, c)
  }
  const parte = (triangulos: number[]) => {
    const nova = new THREE.BufferGeometry()
    for (const [nome, atributo] of Object.entries(geo.attributes)) nova.setAttribute(nome, atributo)
    nova.setIndex(triangulos)
    return nova
  }
  return { cavalo: parte(cavalo), cavaleiro: parte(cavaleiro) }
}

/** Pra que lado o cavalo foge: a borda do tabuleiro mais perto, sem voltar pro lado de quem bateu. */
function rumoDaFuga(de: THREE.Vector3, quemBateu: THREE.Vector3): THREE.Vector3 {
  const longe = de.clone().sub(quemBateu).setY(0).normalize()
  const rumos = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)]
  const ateABorda = (r: THREE.Vector3) => SUMIU - (r.x !== 0 ? de.x * r.x : de.z * r.z)
  const possiveis = rumos.filter((r) => r.dot(longe) > -0.2)
  return (possiveis.length ? possiveis : rumos).reduce((melhor, r) => (ateABorda(r) < ateABorda(melhor) ? r : melhor))
}

/** A maça pegou o cavaleiro: daqui em diante `peca` é só ele (preso nos espinhos), e uma cópia só do cavalo, sem
 * ninguém montado, vira, foge a galope pra fora do tabuleiro e some. `galope` é o clipe do passo do cavalo. */
export function soltarOCavalo(cena: THREE.Object3D, peca: THREE.Object3D, quemBateu: THREE.Vector3, galope: THREE.AnimationClip) {
  peca.updateMatrixWorld(true)
  // copiar a peça copia os dados dela, e os da animação (o mixer) não se copiam: a cópia sai sem eles
  const dadosGuardados: [THREE.Object3D, Record<string, unknown>][] = []
  peca.traverse((obj) => {
    dadosGuardados.push([obj, obj.userData])
    obj.userData = {}
  })
  const cavalo = clonarComEsqueleto(peca) as THREE.Object3D
  for (const [obj, dados] of dadosGuardados) obj.userData = dados
  cena.add(cavalo)
  peca.matrixWorld.decompose(cavalo.position, cavalo.quaternion, cavalo.scale)

  const malhasDaPeca: THREE.Mesh[] = []
  const malhasDoCavalo: THREE.Mesh[] = []
  peca.traverse((obj) => obj instanceof THREE.Mesh && malhasDaPeca.push(obj))
  cavalo.traverse((obj) => obj instanceof THREE.Mesh && malhasDoCavalo.push(obj))
  malhasDaPeca.forEach((malha, i) => {
    const copia = malhasDoCavalo[i]
    if (!copia) return
    if (!(malha instanceof THREE.SkinnedMesh) || !malha.geometry.getAttribute('skinIndex')) {
      // sem esqueleto, fica com o cavaleiro
      copia.visible = false
      return
    }
    const partes = dividirCavaleiro(malha)
    malha.geometry = partes.cavaleiro
    copia.geometry = partes.cavalo
  })

  const mixer = new THREE.AnimationMixer(cavalo)
  mixer.clipAction(galope).setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(RITMO_DO_GALOPE).play()
  const sumir = materiaisSoDela(cavalo)
  const rumo = rumoDaFuga(cavalo.position, quemBateu)
  const giroInicial = cavalo.rotation.y
  const alturaInicial = cavalo.position.y
  let giro = Math.atan2(rumo.x, rumo.z) - giroInicial
  giro = Math.atan2(Math.sin(giro), Math.cos(giro))
  const inicio = performance.now()
  let anterior = inicio
  const quadro = (agora: number) => {
    const dt = Math.min(0.05, (agora - anterior) / 1000)
    anterior = agora
    const decorrido = (agora - inicio) / 1000
    mixer.update(dt)
    // vira pro lado da fuga já arrancando, e acelera até o galope
    cavalo.rotation.y = giroInicial + giro * suave(Math.min(1, decorrido / 0.3))
    cavalo.position.addScaledVector(rumo, GALOPE * Math.min(1, decorrido / 0.35) * dt)
    const longe = rumo.x !== 0 ? cavalo.position.x * rumo.x : cavalo.position.z * rumo.z
    // da beirada, um salto curto e a queda até a mesa
    const salto = Math.min(1, Math.max(0, (longe - PULA_DA_BEIRADA) / (SUMIU - PULA_DA_BEIRADA)))
    cavalo.position.y = alturaInicial + 0.22 * Math.sin(Math.min(1, salto * 2) * Math.PI) + (CHAO_DA_MESA - alturaInicial) * salto * salto
    const some = Math.min(1, Math.max(0, (longe - COMECA_A_SUMIR) / (SUMIU - COMECA_A_SUMIR)))
    sumir(1 - some)
    if (some < 1 && decorrido < 6) {
      requestAnimationFrame(quadro)
      return
    }
    mixer.stopAllAction()
    liberar(cavalo)
  }
  requestAnimationFrame(quadro)
}
