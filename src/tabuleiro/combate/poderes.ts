import * as THREE from 'three'
import { DESENHO_NA_MEMORIA } from '../casas'

// Os poderes à distância: o orbe do bispo, o raio da dama, a onda do rei, com as partículas e o brilho.

// ---------------------------------------------------------------------------
// Poder do bispo — na captura ele lança uma bola de energia (na cor de brilho da facção) que sai
// das mãos no gesto da magia, voa em arco até a peça atingida deixando um rastro de luz e explode
// nela (clarão, onda de choque e faíscas). O golpe só "acerta" (a vítima cai) quando a bola chega.
// ---------------------------------------------------------------------------
function criarTexturaBrilho(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  const gradiente = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradiente.addColorStop(0, 'rgba(255,255,255,1)')
  gradiente.addColorStop(0.25, 'rgba(255,255,255,0.75)')
  gradiente.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  gradiente.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradiente
  ctx.fillRect(0, 0, 128, 128)
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}
export const texturaBrilho = criarTexturaBrilho()
const geoNucleoPoder = new THREE.SphereGeometry(0.05, 20, 14)
export const geoOndaPoder = new THREE.RingGeometry(0.08, 0.13, 48)
const geoCascaPoder = new THREE.SphereGeometry(0.1, 24, 16)

export function spriteDeBrilho(cor: THREE.ColorRepresentation, tamanho: number, opacidade = 1): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texturaBrilho,
    color: cor,
    transparent: true,
    opacity: opacidade,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(tamanho)
  return sprite
}

/** Partículas soltas (rastro, faíscas): cada uma some/encolhe sozinha e é removida no fim. */
export interface Particula {
  objeto: THREE.Sprite
  nasceu: number
  vida: number
  velocidade?: THREE.Vector3
  tamanho: number
}

export function animarParticulas(cena: THREE.Object3D, particulas: Particula[]) {
  let anterior = performance.now()
  function passo(agora: number) {
    const dt = (agora - anterior) / 1000
    anterior = agora
    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i]
      const t = (agora - p.nasceu) / p.vida
      if (t >= 1) {
        cena.remove(p.objeto)
        p.objeto.material.dispose()
        particulas.splice(i, 1)
        continue
      }
      if (p.velocidade) {
        p.velocidade.y -= 2.5 * dt
        p.objeto.position.addScaledVector(p.velocidade, dt)
      }
      p.objeto.material.opacity = 1 - t
      p.objeto.scale.setScalar(p.tamanho * (1 - t * 0.6))
    }
    if (particulas.length) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

/** Meio das duas mãos (os ossos do Mixamo) no mundo — de onde a magia sai. */
function pontoDasMaos(mesh: THREE.Object3D): THREE.Vector3 {
  const maos = ['mixamorigLeftHand', 'mixamorigRightHand', 'mixamorig:LeftHand', 'mixamorig:RightHand']
    .map((nome) => mesh.getObjectByName(nome))
    .filter((osso): osso is THREE.Object3D => Boolean(osso))
  if (!maos.length) return mesh.position.clone().add(new THREE.Vector3(0, 0.5 * mesh.scale.y, 0))
  const soma = new THREE.Vector3()
  for (const mao of maos) soma.add(mao.getWorldPosition(new THREE.Vector3()))
  return soma.divideScalar(maos.length)
}

/** Explosão da magia no ponto: clarão de luz, casca de energia se expandindo, onda no chão e faíscas. */
export function explodirPoder(cena: THREE.Object3D, ponto: THREE.Vector3, cor: THREE.ColorRepresentation) {
  const grupo = new THREE.Group()
  grupo.position.copy(ponto)
  const luz = new THREE.PointLight(cor, 10, 4, 2)
  grupo.add(luz)
  const casca = new THREE.Mesh(
    geoCascaPoder,
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  grupo.add(casca)
  const clarao = spriteDeBrilho(cor, 1.1)
  grupo.add(clarao)
  cena.add(grupo)
  const onda = new THREE.Mesh(
    geoOndaPoder,
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  onda.rotation.x = -Math.PI / 2
  onda.position.set(ponto.x, 0.03, ponto.z)
  cena.add(onda)

  const faiscas: Particula[] = []
  const agora = performance.now()
  for (let i = 0; i < 18; i++) {
    const faisca = spriteDeBrilho(i % 3 === 0 ? 0xffffff : cor, 0.12)
    faisca.position.copy(ponto)
    cena.add(faisca)
    const direcao = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize()
    faiscas.push({ objeto: faisca, nasceu: agora, vida: 450 + Math.random() * 300, velocidade: direcao.multiplyScalar(1.4 + Math.random() * 1.6), tamanho: 0.12 })
  }
  animarParticulas(cena, faiscas)

  const inicio = performance.now()
  const DURACAO = 520
  function passo(agoraPasso: number) {
    const t = Math.min(1, (agoraPasso - inicio) / DURACAO)
    const saida = 1 - Math.pow(1 - t, 3)
    casca.scale.setScalar(1 + saida * 5)
    ;(casca.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t)
    clarao.material.opacity = 1 - t
    clarao.scale.setScalar(1.1 + saida * 0.8)
    luz.intensity = 10 * (1 - t) * (1 - t)
    onda.scale.setScalar(1 + saida * 7)
    ;(onda.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t)
    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      cena.remove(grupo)
      cena.remove(onda)
      ;(casca.material as THREE.Material).dispose()
      clarao.material.dispose()
      ;(onda.material as THREE.Material).dispose()
    }
  }
  requestAnimationFrame(passo)
}

/** O bispo lança a bola de energia das mãos até `alvo`; `aoAcertar` roda quando ela chega. */
export function lancarPoderDoBispo(cena: THREE.Object3D, bispo: THREE.Object3D, alvo: THREE.Vector3, cor: THREE.ColorRepresentation, aoAcertar: () => void) {
  const origem = pontoDasMaos(bispo)
  const orbe = new THREE.Group()
  const nucleo = new THREE.Mesh(geoNucleoPoder, new THREE.MeshBasicMaterial({ color: 0xffffff }))
  orbe.add(nucleo, spriteDeBrilho(cor, 0.5), spriteDeBrilho(0xffffff, 0.2))
  const luz = new THREE.PointLight(cor, 4, 3, 2)
  orbe.add(luz)
  orbe.position.copy(origem)
  cena.add(orbe)

  const distancia = origem.distanceTo(alvo)
  const duracao = THREE.MathUtils.clamp(distancia / 6, 0.2, 0.55) * 1000
  const alturaArco = 0.25 * Math.min(1, distancia / 3)
  const rastro: Particula[] = []
  let rastroAnimando = false
  const inicio = performance.now()
  let ultimaParticula = 0
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / duracao)
    orbe.position.lerpVectors(origem, alvo, t)
    orbe.position.y += Math.sin(t * Math.PI) * alturaArco
    nucleo.scale.setScalar(1 + 0.2 * Math.sin(agora / 40))
    if (agora - ultimaParticula > 14) {
      ultimaParticula = agora
      const particula = spriteDeBrilho(cor, 0.26, 0.9)
      particula.position.copy(orbe.position)
      cena.add(particula)
      rastro.push({ objeto: particula, nasceu: agora, vida: 340, tamanho: 0.26 })
      if (!rastroAnimando) {
        rastroAnimando = true
        animarParticulas(cena, rastro)
      }
    }
    if (t < 1) {
      requestAnimationFrame(passo)
      return
    }
    cena.remove(orbe)
    ;(nucleo.material as THREE.Material).dispose()
    orbe.traverse((obj) => {
      if (obj instanceof THREE.Sprite) obj.material.dispose()
    })
    explodirPoder(cena, alvo, cor)
    aoAcertar()
  }
  requestAnimationFrame(passo)
}

/** Posição no mundo de um osso do Mixamo (o GLTFLoader tira o ":" do nome); sem ele, a altura do
 * peito da peça. */
function posicaoDoOsso(mesh: THREE.Object3D, nome: string): THREE.Vector3 {
  const osso = mesh.getObjectByName(`mixamorig${nome}`) ?? mesh.getObjectByName(`mixamorig:${nome}`)
  if (osso) return osso.getWorldPosition(new THREE.Vector3())
  return mesh.position.clone().add(new THREE.Vector3(0, 0.5 * mesh.scale.y, 0))
}

// ---------------------------------------------------------------------------
// Raio da dama — do cetro (mão direita) sai um raio que cintila em zigue-zague até a vítima,
// redesenhado a cada poucos quadros, e explode nela. Ataque à distância como o do bispo, mas
// instantâneo como um relâmpago.
// ---------------------------------------------------------------------------
const geoSegmentoRaio = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)

export function lancarRaioDaDama(cena: THREE.Object3D, dama: THREE.Object3D, alvo: THREE.Vector3, cor: THREE.ColorRepresentation, aoAcertar: () => void, mao = 'RightHand') {
  const origem = posicaoDoOsso(dama, mao)
  const grupo = new THREE.Group()
  cena.add(grupo)
  const materialNucleo = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const materialHalo = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  const brilhoMao = spriteDeBrilho(cor, 0.4)
  brilhoMao.position.copy(origem)
  cena.add(brilhoMao)
  const luz = new THREE.PointLight(cor, 6, 4, 2)
  luz.position.copy(alvo)
  cena.add(luz)

  const direcao = alvo.clone().sub(origem)
  const lateral = new THREE.Vector3().crossVectors(direcao, new THREE.Vector3(0, 1, 0)).normalize()
  const cima = new THREE.Vector3().crossVectors(lateral, direcao).normalize()
  const eixoY = new THREE.Vector3(0, 1, 0)

  function desenhar() {
    for (const filho of [...grupo.children]) grupo.remove(filho)
    const pontos: THREE.Vector3[] = []
    const PARTES = 12
    for (let i = 0; i <= PARTES; i++) {
      const t = i / PARTES
      const desvio = i === 0 || i === PARTES ? 0 : (0.06 + 0.1 * Math.sin(t * Math.PI)) * (Math.random() * 2 - 1)
      const desvio2 = i === 0 || i === PARTES ? 0 : 0.06 * (Math.random() * 2 - 1)
      pontos.push(origem.clone().addScaledVector(direcao, t).addScaledVector(lateral, desvio).addScaledVector(cima, desvio2))
    }
    for (let i = 0; i < PARTES; i++) {
      const a = pontos[i]
      const b = pontos[i + 1]
      const comprimento = a.distanceTo(b)
      const meio = a.clone().add(b).multiplyScalar(0.5)
      const giro = new THREE.Quaternion().setFromUnitVectors(eixoY, b.clone().sub(a).normalize())
      for (const [material, raio] of [
        [materialNucleo, 0.01],
        [materialHalo, 0.035],
      ] as const) {
        const segmento = new THREE.Mesh(geoSegmentoRaio, material)
        segmento.position.copy(meio)
        segmento.quaternion.copy(giro)
        segmento.scale.set(raio, comprimento, raio)
        grupo.add(segmento)
      }
    }
  }

  const DURACAO = 420
  const ACERTO = 90
  const inicio = performance.now()
  let ultimoDesenho = -Infinity
  let acertou = false
  function passo(agora: number) {
    const decorrido = agora - inicio
    if (agora - ultimoDesenho > 55) {
      ultimoDesenho = agora
      desenhar()
    }
    const t = decorrido / DURACAO
    const pisca = 0.75 + 0.25 * Math.sin(agora / 18)
    materialNucleo.opacity = Math.max(0, 1 - t) * pisca
    materialHalo.opacity = 0.55 * Math.max(0, 1 - t) * pisca
    brilhoMao.material.opacity = Math.max(0, 1 - t)
    luz.intensity = 6 * Math.max(0, 1 - t)
    if (!acertou && decorrido >= ACERTO) {
      acertou = true
      explodirPoder(cena, alvo, cor)
      aoAcertar()
    }
    if (decorrido < DURACAO) {
      requestAnimationFrame(passo)
      return
    }
    cena.remove(grupo)
    cena.remove(brilhoMao)
    cena.remove(luz)
    materialNucleo.dispose()
    materialHalo.dispose()
    brilhoMao.material.dispose()
  }
  requestAnimationFrame(passo)
}

// ---------------------------------------------------------------------------
// Onda do rei — ele bate o cajado e uma onda de choque dourada em meia-lua corre pelo chão até a
// vítima, levantando faíscas pelo caminho, e explode nela.
// ---------------------------------------------------------------------------
const geoOndaRei = new THREE.RingGeometry(0.16, 0.3, 40, 1, -Math.PI / 3, (2 * Math.PI) / 3)

export function lancarOndaDoRei(cena: THREE.Object3D, rei: THREE.Object3D, alvo: THREE.Vector3, cor: THREE.ColorRepresentation, aoAcertar: () => void) {
  const origem = new THREE.Vector3(rei.position.x, 0.04, rei.position.z)
  const destino = new THREE.Vector3(alvo.x, 0.04, alvo.z)
  const dx = destino.x - origem.x
  const dz = destino.z - origem.z
  const distancia = Math.hypot(dx, dz)
  const grupo = new THREE.Group()
  // a meia-lua (centrada no eixo +X do anel) virada pra direção da vítima
  grupo.rotation.y = Math.atan2(-dz, dx)
  const material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const onda = new THREE.Mesh(geoOndaRei, material)
  onda.rotation.x = -Math.PI / 2
  grupo.add(onda)
  const brilho = spriteDeBrilho(cor, 0.7, 0.8)
  brilho.position.set(0.22, 0.1, 0)
  grupo.add(brilho)
  const luz = new THREE.PointLight(cor, 5, 3, 2)
  luz.position.set(0.2, 0.25, 0)
  grupo.add(luz)
  grupo.position.copy(origem)
  cena.add(grupo)

  const faiscas: Particula[] = []
  let faiscasAnimando = false
  const duracao = THREE.MathUtils.clamp(distancia / 5, 0.25, 0.6) * 1000
  const inicio = performance.now()
  let ultimaFaisca = 0
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / duracao)
    grupo.position.lerpVectors(origem, destino, t)
    grupo.scale.setScalar(1 + t * 1.2)
    if (agora - ultimaFaisca > 20) {
      ultimaFaisca = agora
      const faisca = spriteDeBrilho(Math.random() < 0.3 ? 0xffffff : cor, 0.1)
      faisca.position.copy(grupo.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.02, (Math.random() - 0.5) * 0.4))
      cena.add(faisca)
      faiscas.push({
        objeto: faisca,
        nasceu: agora,
        vida: 380,
        velocidade: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6),
        tamanho: 0.1,
      })
      if (!faiscasAnimando) {
        faiscasAnimando = true
        animarParticulas(cena, faiscas)
      }
    }
    if (t < 1) {
      requestAnimationFrame(passo)
      return
    }
    cena.remove(grupo)
    material.dispose()
    brilho.material.dispose()
    explodirPoder(cena, alvo, cor)
    aoAcertar()
  }
  requestAnimationFrame(passo)
}
