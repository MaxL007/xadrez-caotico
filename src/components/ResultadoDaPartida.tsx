import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Traduzir } from '../chess/idiomas'
import { desenhoDosPaineis } from '../chess/configXadrez'

// O fim da partida no centro da tela. Na vitória, uma taça 3D com "Vitória" embaixo; na derrota e no empate, só a
// palavra. A taça tem renderizador próprio, na resolução da tela e com fundo transparente: não mexe na qualidade do
// tabuleiro (que pode estar na baixa) e o tabuleiro, com as peças comemorando, continua à vista em volta.

export type FimDaPartida = 'venceu' | 'perdeu' | 'desistiu' | 'empate'

/** O contorno da taça, de baixo pra cima por fora e de volta por dentro, torneado em volta do eixo. */
const CONTORNO_DA_TACA = [
  [0, 0.02],
  [0.07, 0.03],
  [0.16, 0.1],
  [0.25, 0.24],
  [0.3, 0.4],
  [0.32, 0.56],
  [0.335, 0.62],
  [0.31, 0.62],
  [0.295, 0.56],
  [0.275, 0.41],
  [0.22, 0.26],
  [0.14, 0.15],
  [0, 0.12],
].map(([x, y]) => new THREE.Vector2(x, y))

function montarTaca(): { taca: THREE.Group; materiais: THREE.Material[]; geometrias: THREE.BufferGeometry[] } {
  const ouro = new THREE.MeshStandardMaterial({ color: 0xe8b93a, metalness: 1, roughness: 0.22, side: THREE.DoubleSide })
  const ouroEscuro = new THREE.MeshStandardMaterial({ color: 0xb4851f, metalness: 1, roughness: 0.32 })
  const madeira = new THREE.MeshStandardMaterial({ color: 0x3a2414, metalness: 0.05, roughness: 0.6 })
  const geometrias: THREE.BufferGeometry[] = []
  const taca = new THREE.Group()
  const pecaDe = (geometria: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    geometrias.push(geometria)
    const malha = new THREE.Mesh(geometria, material)
    malha.position.y = y
    taca.add(malha)
    return malha
  }
  // o copo
  pecaDe(new THREE.LatheGeometry(CONTORNO_DA_TACA, 64), ouro, 0.18)
  // as alças, uma de cada lado
  for (const lado of [1, -1]) {
    const alca = pecaDe(new THREE.TorusGeometry(0.12, 0.022, 12, 32, Math.PI * 1.15), ouro, 0.6)
    alca.position.x = lado * 0.3
    alca.rotation.z = lado === 1 ? -Math.PI * 0.55 : Math.PI * 0.45
  }
  // haste, nó e base
  pecaDe(new THREE.CylinderGeometry(0.035, 0.055, 0.2, 24), ouro, 0.09)
  pecaDe(new THREE.SphereGeometry(0.06, 24, 16), ouroEscuro, 0.12)
  pecaDe(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 48), ouro, -0.02)
  // o pedestal de madeira, com uma faixa dourada
  pecaDe(new THREE.CylinderGeometry(0.22, 0.24, 0.14, 48), madeira, -0.12)
  pecaDe(new THREE.TorusGeometry(0.232, 0.008, 8, 64), ouroEscuro, -0.12).rotation.x = Math.PI / 2
  return { taca, materiais: [ouro, ouroEscuro, madeira], geometrias }
}

/** A taça girando devagar, num canvas transparente do tamanho dado. */
function Taca3D({ tamanho }: { tamanho: number }) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const [semWebgl, setSemWebgl] = useState(false)

  useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: desenhoDosPaineis().antialias, alpha: true })
    } catch {
      setSemWebgl(true)
      return
    }
    // a resolução da tela (até 2x): a taça fica nítida mesmo com o tabuleiro na qualidade baixa
    renderer.setPixelRatio(desenhoDosPaineis().resolucao)
    renderer.setSize(tamanho, tamanho)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.setClearColor(0x000000, 0)
    caixa.append(renderer.domElement)

    const cena = new THREE.Scene()
    const gerador = new THREE.PMREMGenerator(renderer)
    const reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
    gerador.dispose()
    cena.environment = reflexo.texture
    cena.environmentIntensity = 0.9
    cena.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.8))
    const luz = new THREE.DirectionalLight(0xfff1dc, 2.6)
    luz.position.set(1.5, 2.5, 2.5)
    cena.add(luz)
    const contraluz = new THREE.DirectionalLight(0xffd27a, 1.4)
    contraluz.position.set(-2, 1, -2)
    cena.add(contraluz)

    const { taca, materiais, geometrias } = montarTaca()
    cena.add(taca)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
    camera.position.set(0, 0.62, 2.55)
    camera.lookAt(0, 0.3, 0)

    const inicio = performance.now()
    let quadro = 0
    const animar = () => {
      quadro = requestAnimationFrame(animar)
      const segundos = (performance.now() - inicio) / 1000
      // entra crescendo, depois gira devagar e flutua de leve
      const entrada = Math.min(1, segundos / 0.6)
      taca.scale.setScalar(1 - (1 - entrada) ** 3)
      taca.rotation.y = segundos * 0.8
      taca.position.y = Math.sin(segundos * 1.6) * 0.015
      renderer.render(cena, camera)
    }
    animar()

    return () => {
      cancelAnimationFrame(quadro)
      geometrias.forEach((g) => g.dispose())
      materiais.forEach((m) => m.dispose())
      reflexo.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [tamanho])

  return (
    <div ref={caixaRef} style={{ width: tamanho, height: tamanho }} className="flex items-center justify-center" data-taca>
      {semWebgl && (
        <span aria-hidden className="text-7xl">
          🏆
        </span>
      )}
    </div>
  )
}

/** Nos testes sem desenho 3D, a taça vira o emoji: o que importa ali é a lógica. */
const semDesenho = () => import.meta.env.DEV && (window as unknown as { __semDesenho?: boolean }).__semDesenho === true

export function ResultadoDaPartida({
  t,
  fim,
  detalhe,
  onNovoJogo,
  onFechar,
}: {
  t: Traduzir
  fim: FimDaPartida
  detalhe: string
  onNovoJogo: () => void
  onFechar: () => void
}) {
  const venceu = fim === 'venceu'
  // a taça cabe no meio da tela sem cobrir o tabuleiro inteiro
  const [tamanho] = useState(() => Math.round(Math.min(240, Math.max(150, Math.min(window.innerWidth, window.innerHeight) * 0.42))))
  const titulo = t(venceu ? 'resultado.vitoria' : fim === 'empate' ? 'resultado.empate' : 'resultado.derrota')
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4" role="status" data-resultado={fim}>
      <div className="pointer-events-auto relative flex flex-col items-center">
        {/* um brilho suave atrás, pra taça e a palavra se lerem sobre o tabuleiro */}
        <div aria-hidden className="absolute inset-[-12%] -z-10 rounded-full bg-[radial-gradient(circle,rgba(28,18,10,0.78)_0%,rgba(28,18,10,0.45)_45%,rgba(28,18,10,0)_72%)]" />
        <button
          type="button"
          aria-label={t('resultado.fechar')}
          onClick={onFechar}
          className="absolute right-0 top-0 rounded-full bg-[#1c120a]/80 px-2.5 py-1 text-sm font-semibold text-[#f5e6c8] hover:bg-[#3a2614]"
        >
          ✕
        </button>
        {venceu &&
          (semDesenho() ? (
            <span aria-hidden className="text-7xl" data-taca>
              🏆
            </span>
          ) : (
            <Taca3D tamanho={tamanho} />
          ))}
        <p
          className={`font-display font-extrabold tracking-wide [text-shadow:0_3px_12px_rgba(0,0,0,0.85)] ${
            venceu ? '-mt-2 text-5xl text-[#f2c94c]' : 'text-4xl text-[#f5e6c8]'
          }`}
        >
          {titulo}
        </p>
        <p className="mt-1 max-w-[18rem] text-center text-xs font-medium text-[#f5e6c8] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">{detalhe}</p>
        <button
          type="button"
          onClick={onNovoJogo}
          className="mt-3 rounded-xl border border-[#e6c675] bg-[#c9a24a] px-5 py-2 font-display text-sm font-semibold text-[#1c120a] shadow-lg transition hover:bg-[#e6c675]"
        >
          {t('menu.novoJogo')}
        </button>
      </div>
    </div>
  )
}
