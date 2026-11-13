import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Chess, type Square } from 'chess.js'
import { Button } from './ui/Basics'
import { useFecharComEsc } from '../teclaEsc'
import { buscarNoLivro, carregarLivroDeAberturas, type LivroDeAberturas } from '../chess/pgnBook'
import { DIFICULDADES, escolherJogadaDaMaquina, maquinaAceitaEmpate, usaLivro, type Dificuldade } from '../chess/engine'
import { PREMIO_DA_VITORIA } from '../chess/conquistas'
import { ResultadoDaPartida, type FimDaPartida } from './ResultadoDaPartida'
import { PainelDeLances } from './PainelDeLances'
import { afundarPelaGravidade, convocarCristal, cortarAoMeio, despedacar, rachadurasNoTabuleiro, rastroDeCorte, tornadoDaLua, tremerTabuleiro } from './efeitosDasArmas'
import { ambienteDoTabuleiro, ambienteTocando, configurarSom, destravarSom, ritmoDosPassos, somDestravado, tocarSom, tocarUmPasso } from '../chess/sons'
import { useConfigXadrez, type QualidadeXadrez } from '../chess/configXadrez'
import { tradutor, type ChaveTexto, type Traduzir } from '../chess/idiomas'
import { MenuXadrez } from './MenuXadrez'
import { listPartidas, novaPartida, salvarPartida, type PartidaXadrez } from '../db/xadrezRepo'
import { ouvirDados } from '../db/db'
import { entrarEmSala, pedirRevanche, recusarSala, sessaoAtual, useSessao } from '../db/servidor'
import { abrirConexaoDaSala, type ConexaoDaSala, type EstadoDaSala, type LanceDaSala, type ResultadoDaSala } from '../online/salaAoVivo'
import { registrarAprendizadoDaPartida, type ResultadoPartida as ResultadoPartidaXadrez } from '../db/xadrezAprendizadoRepo'
import { cajadoDoModelo, equipamentoSozinho, katanaDoModelo, vestirPeca, type MateriaisDaPeca, type VitrineDaPeca } from '../chess/equipamentos'
import { carregarPersonalizacao, opcaoLiberada, ouvirPersonalizacao, personalizacaoAtual } from '../conta/personalizacao'
import { contarPartidas } from '../chess/conquistas'

const COR_SELECIONADA = 0x2a9d5f
const COR_DESTINO = 0x2a78d6
/** Casa do Rei em xeque. */
const COR_XEQUE = 0xe53935
/** Meia largura do tabuleiro com a moldura e as coordenadas — o que a câmera precisa enquadrar. */
const MEIA_LARGURA_TABULEIRO = 4.6

/** Celular (em pé, ou deitado com a tela baixa): ao começar uma partida o tabuleiro vai pra tela cheia. */
function ehCelular(): boolean {
  return window.matchMedia?.('(max-width: 767px), (pointer: coarse) and (max-height: 500px)').matches ?? false
}

function squareToPos(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { x: file - 3.5, z: 3.5 - rank }
}

// mesma posição da câmera de baixo (ver camera.position.set, olhando pra origem) — replicada aqui
// só pra alimentar a compensação de perspectiva abaixo, sem dependência circular com o efeito que
// monta a cena
const CAMERA_Y = 9.5
const CAMERA_Z = 10
// altura do "centro visual" de uma peça acima do chão (a peça tem ~0,9 de altura, mas o volume
// visível se concentra um pouco acima da metade) — medido por diferença de pixels contra o
// tabuleiro vazio, não chutado
const ALTURA_VISUAL_PECA = 0.55
/** De que lado do tabuleiro a câmera fica: 1 = das brancas, -1 = das pretas (ver virarCameraPara). */
let ladoDaCamera: 1 | -1 = 1

/**
 * Posição X/Z de uma peça na casa, com uma pequena correção de perspectiva no eixo X: a câmera vê o
 * tabuleiro de um ângulo e a peça tem altura, então toda peça alta (não só o peão — torre, cavalo,
 * o que for) parece "inclinada" pra fora do eixo central da câmera; quanto mais longe da coluna do
 * meio e mais perto da câmera, mais forte. A conta desloca a peça pra dentro, o suficiente pra que
 * o centro visual (ALTURA_VISUAL_PECA acima do chão) projete na mesma coluna da tela que o centro
 * da casa. Só o X muda — a profundidade (Z) fica exata, senão o pé da peça sairia da casa. Vale pra
 * câmera inicial; se o jogador girar o tabuleiro, o desvio volta a aparecer, só que pequeno.
 */
function squareToPosPeca(square: string): { x: number; z: number } {
  const { x, z } = squareToPos(square)
  const profundidadeCasa = CAMERA_Y * CAMERA_Y + CAMERA_Z * (CAMERA_Z - z * ladoDaCamera)
  const fator = (CAMERA_Y * ALTURA_VISUAL_PECA) / profundidadeCasa
  return { x: x * (1 - fator), z }
}

// ---------------------------------------------------------------------------
// Contorno preto das peças geométricas (usadas só se o modelo RPG do tipo não carregar) — a
// técnica clássica do "casco invertido": um clone da mesma peça, ligeiramente maior e renderizado
// só por dentro/atrás. As peças RPG (o visual HD) não têm contorno.
// ---------------------------------------------------------------------------
const COR_CONTORNO = 0x1a1410
const materialContorno = new THREE.MeshBasicMaterial({ color: COR_CONTORNO, side: THREE.BackSide })

function criarContorno(geo: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, materialContorno)
  mesh.scale.setScalar(1.06)
  return mesh
}

/** Desenha um texto curto num canvas pra usar como textura — usado nas coordenadas (a-h, 1-8) na
 * moldura do tabuleiro: dourado com uma sombra leve, em alta resolução (nítido mesmo de perto). */
// Os desenhos das texturas ficam na memória comum, não na placa de vídeo. No celular, a aba em segundo plano
// pode perder tudo o que estava na placa, e o tabuleiro e o fundo voltavam pretos.
const DESENHO_NA_MEMORIA: CanvasRenderingContext2DSettings = { willReadFrequently: true }

function criarTexturaTexto(texto: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  ctx.font = 'bold 170px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillText(texto, 134, 142)
  const dourado = ctx.createLinearGradient(0, 40, 0, 220)
  dourado.addColorStop(0, '#f7e3a1')
  dourado.addColorStop(0.5, '#d9ae4a')
  dourado.addColorStop(1, '#9c7428')
  ctx.fillStyle = dourado
  ctx.fillText(texto, 128, 136)
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.needsUpdate = true
  return textura
}

/**
 * Madeira desenhada num canvas (sem imagem externa): veios ondulados ao longo de um eixo, com
 * variação fina e um pouco de ruído — o mesmo desenho dá bordo claro, nogueira ou a mesa, só mudando
 * as cores. `semente` muda o desenho dos veios.
 */
function criarTexturaMadeira(
  corBase: [number, number, number],
  corVeio: [number, number, number],
  semente: number,
  veios = 14,
  tamanho = 512,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = tamanho
  canvas.height = tamanho
  const ctx = canvas.getContext('2d', DESENHO_NA_MEMORIA)!
  const imagem = ctx.createImageData(tamanho, tamanho)
  const ruido = (x: number, y: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233 + semente * 37.719) * 43758.5453
    return v - Math.floor(v)
  }
  for (let y = 0; y < tamanho; y++) {
    const v = y / tamanho
    for (let x = 0; x < tamanho; x++) {
      const u = x / tamanho
      const onda =
        u * veios +
        0.45 * Math.sin(v * 6.283 + semente) +
        0.18 * Math.sin(v * 18.85 + semente * 2.3) +
        0.06 * Math.sin(u * 41 + v * 13 + semente * 5.1)
      const anel = Math.pow(0.5 + 0.5 * Math.sin(onda * 6.283), 3)
      const fibra = 0.5 + 0.5 * Math.sin(u * veios * 9.7 + 0.8 * Math.sin(v * 31 + semente))
      // manchas largas e suaves (a madeira nunca tem a mesma cor de ponta a ponta)
      const mancha = 0.5 + 0.5 * Math.sin(u * 3.1 + 1.7 * Math.sin(v * 2.3 + semente) + semente * 1.3)
      const t = Math.max(0, Math.min(1, anel * 0.32 + fibra * 0.1 + mancha * 0.22 + (ruido(x, y) - 0.5) * 0.08))
      const i = (y * tamanho + x) * 4
      imagem.data[i] = corBase[0] + (corVeio[0] - corBase[0]) * t
      imagem.data[i + 1] = corBase[1] + (corVeio[1] - corBase[1]) * t
      imagem.data[i + 2] = corBase[2] + (corVeio[2] - corBase[2]) * t
      imagem.data[i + 3] = 255
    }
  }
  ctx.putImageData(imagem, 0, 0)
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.wrapS = THREE.RepeatWrapping
  textura.wrapT = THREE.RepeatWrapping
  return textura
}

/** Material de madeira fosca (sem verniz nem reflexo — o brilho refletido nas casas atrapalhava ver
 * o jogo), a partir de uma textura base — cada casa usa um pedaço diferente dela
 * (deslocamento/giro), pra não parecerem carimbadas. */
function materialMadeira(base: THREE.Texture, anisotropia: number, deslocamento?: { x: number; y: number; giro: number }) {
  const mapa = base.clone()
  mapa.anisotropy = anisotropia
  if (deslocamento) {
    mapa.offset.set(deslocamento.x, deslocamento.y)
    mapa.center.set(0.5, 0.5)
    mapa.rotation = deslocamento.giro
  }
  mapa.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map: mapa, roughness: 0.85, metalness: 0, envMapIntensity: 0.25 })
}

const LETRAS_COLUNAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

// ---------------------------------------------------------------------------
// Peças-personagem — dois exércitos com visual distinto (Reino, claro/azul, x
// Horda, escuro/vermelho), em vez das peças geométricas clássicas. Cada peça é
// montada com formas simples (corpo, cabeça, elmo/capuz, acessório) só que com
// um "papel" por parte (armadura / detalhe / coroa / brilho) que decide qual
// material usar — a geometria em si é montada uma única vez por tipo e
// reaproveitada pra sempre, então trocar de facção não recria nada.
// ---------------------------------------------------------------------------
type Papel = 'armadura' | 'detalhe' | 'coroa' | 'brilho'

interface ParteGeom {
  geo: THREE.BufferGeometry
  x?: number
  y: number
  z?: number
  rotX?: number
  rotY?: number
  rotZ?: number
  papel: Papel
}

const geometriasPorTipo = new Map<string, ParteGeom[]>()

function geometriasDoTipo(tipo: string): ParteGeom[] {
  const existente = geometriasPorTipo.get(tipo)
  if (existente) return existente

  // Corpos bem mais esguios que a geração anterior (que lembrava um robozinho robusto) — visual
  // de "boneco de madeira" articulado, tipo manequim de desenho: tronco/quadril bem mais finos e
  // membros finos (ver geoPerna/geoBraco), mas ainda montado só com primitivas geométricas simples
  // (caixa/cilindro/esfera/cone), não linhas literais — mantém o "formato geométrico" original só
  // que mais magro. As alturas (Y) ficam quase todas iguais às da versão anterior; só as larguras/
  // profundidades (X/Z) e os afastamentos do centro (onde fica ombro, cetro, cajado etc.) encolhem.
  let partes: ParteGeom[] = []
  switch (tipo) {
    // peão — soldado raso, elmo simples com ponta (tronco acima do quadril/pernas articulados)
    case 'p':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.08, 0.025, 0.08), y: 0.4, papel: 'detalhe' },
        { geo: new THREE.CylinderGeometry(0.055, 0.065, 0.2, 12), y: 0.48, papel: 'armadura' },
        // juntas esféricas nos ombros e quadris, bem mais largas que o membro fino que sai delas —
        // o visual de "boneco de brinquedo articulado" da foto de referência (bolinha grande na
        // dobradiça). Centralizadas exatamente no pivô do braço/perna (CONFIG_BRACO/PERNA_*), pra
        // o membro parecer emergir de dentro da esfera em vez de só encostar nela.
        { geo: new THREE.SphereGeometry(0.036, 12, 10), x: -0.085, y: 0.52, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.036, 12, 10), x: 0.085, y: 0.52, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.032, 12, 10), x: -0.04, y: 0.32, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.032, 12, 10), x: 0.04, y: 0.32, papel: 'detalhe' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.68, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.048, 0.1, 12), y: 0.785, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.06, 0.018, 0.018), y: 0.685, z: 0.078, papel: 'brilho' },
      ]
      break
    // torre — guardião pesado, ombreiras largas e "ameia" no topo (lembrando torre) — continua a
    // mais robusta do grupo (guarda a mesma proporção relativa às outras), só que agora fina o
    // bastante pra também deixar ver um fiapo das pernas por baixo, como as demais peças
    case 'r':
      partes = [
        { geo: new THREE.BoxGeometry(0.13, 0.09, 0.09), y: 0.36, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.19, 0.22, 0.13), y: 0.5, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.195, 0.03, 0.135), y: 0.5, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), x: -0.11, y: 0.53, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.13, 0.05), x: 0.11, y: 0.53, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.035, 0.035, 0.014), y: 0.56, z: 0.07, rotZ: Math.PI / 4, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.075, 16, 12), y: 0.7, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.17, 0.07, 0.17), y: 0.8, papel: 'detalhe' },
        { geo: new THREE.BoxGeometry(0.05, 0.02, 0.02), y: 0.705, z: 0.058, papel: 'brilho' },
      ]
      break
    // cavalo — literalmente um peão montado em cima de um cavalo: corpo/pescoço/cabeça/orelhas/
    // crina/rabo do cavalo por baixo, e um cavaleiro pequeno (mesma cara do peão — corpo, cabeça,
    // capacete pontudo) sentado no lombo. O tronco do cavalo fica mais estreito que a distância das
    // "patas" (o mesmo par de pernas articuladas de toda peça), então elas ficam visíveis do lado
    // de fora do corpo em vez de escondidas por dentro. Corpo/pescoço/cabeça mais esguios que antes,
    // acompanhando o resto do time, mas o comprimento (focinho, rabo) fica como estava.
    case 'n':
      partes = [
        // corpo do cavalo
        { geo: new THREE.BoxGeometry(0.09, 0.12, 0.4), y: 0.42, papel: 'armadura' },
        // manta de sela, sob o cavaleiro
        { geo: new THREE.BoxGeometry(0.1, 0.03, 0.22), y: 0.505, z: 0.03, papel: 'detalhe' },
        // pescoço, inclinado pra frente e pra cima
        { geo: new THREE.BoxGeometry(0.065, 0.24, 0.08), y: 0.54, z: -0.2, rotX: -0.5, papel: 'armadura' },
        // cabeça — focinho alongado
        { geo: new THREE.BoxGeometry(0.06, 0.075, 0.2), y: 0.65, z: -0.35, rotX: -0.15, papel: 'armadura' },
        // orelhas
        { geo: new THREE.ConeGeometry(0.018, 0.06, 8), x: -0.018, y: 0.72, z: -0.27, papel: 'detalhe' },
        { geo: new THREE.ConeGeometry(0.018, 0.06, 8), x: 0.018, y: 0.72, z: -0.27, papel: 'detalhe' },
        // crina, ao longo do pescoço
        { geo: new THREE.BoxGeometry(0.02, 0.16, 0.12), y: 0.6, z: -0.13, rotX: -0.5, papel: 'detalhe' },
        // rabo
        { geo: new THREE.ConeGeometry(0.032, 0.22, 10), y: 0.42, z: 0.24, rotX: Math.PI * 0.55, papel: 'detalhe' },
        // cavaleiro — tronco pequeno sentado no lombo
        { geo: new THREE.CylinderGeometry(0.045, 0.052, 0.14, 10), y: 0.56, papel: 'armadura' },
        // capa curta do cavaleiro, esvoaçando pra trás
        { geo: new THREE.BoxGeometry(0.06, 0.16, 0.02), y: 0.58, z: 0.09, rotX: 0.25, papel: 'detalhe' },
        // cabeça do cavaleiro
        { geo: new THREE.SphereGeometry(0.055, 14, 10), y: 0.68, papel: 'armadura' },
        // capacete pontudo, igual ao do peão
        { geo: new THREE.ConeGeometry(0.032, 0.07, 12), y: 0.75, papel: 'detalhe' },
        // brilho dos olhos do cavaleiro
        { geo: new THREE.BoxGeometry(0.04, 0.013, 0.013), y: 0.685, z: 0.05, papel: 'brilho' },
      ]
      break
    // bispo — místico com chapéu pontudo e cajado
    case 'b':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.09, 0.26, 14), y: 0.5, papel: 'detalhe' },
        // faixa/cíngulo na cintura da batina
        { geo: new THREE.TorusGeometry(0.056, 0.01, 8, 20), y: 0.45, rotX: Math.PI / 2, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.7, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.06, 0.3, 14), y: 0.94, papel: 'detalhe' },
        // faixa diagonal no peito
        { geo: new THREE.BoxGeometry(0.02, 0.22, 0.014), x: 0.03, y: 0.68, z: 0.045, rotZ: 0.5, papel: 'detalhe' },
        { geo: new THREE.CylinderGeometry(0.013, 0.013, 0.46, 8), x: 0.1, y: 0.52, papel: 'armadura' },
        { geo: new THREE.SphereGeometry(0.04, 12, 12), x: 0.1, y: 0.77, papel: 'brilho' },
      ]
      break
    // dama — elegante, coroa dourada com joia
    case 'q':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.09, 0.28, 16), y: 0.5, papel: 'detalhe' },
        // capa — bem mais ampla, cobrindo quase toda a altura do corpo
        { geo: new THREE.BoxGeometry(0.16, 0.48, 0.03), y: 0.42, z: -0.08, rotX: 0.08, papel: 'detalhe' },
        // colar
        { geo: new THREE.TorusGeometry(0.05, 0.01, 8, 20), y: 0.63, rotX: Math.PI / 2, papel: 'coroa' },
        { geo: new THREE.SphereGeometry(0.085, 16, 12), y: 0.72, papel: 'armadura' },
        { geo: new THREE.TorusGeometry(0.06, 0.018, 10, 20), y: 0.85, rotX: Math.PI / 2, papel: 'coroa' },
        // pontas pequenas na coroa, além do topo com a joia
        { geo: new THREE.ConeGeometry(0.014, 0.045, 8), x: 0.045, y: 0.89, papel: 'coroa' },
        { geo: new THREE.ConeGeometry(0.014, 0.045, 8), x: -0.045, y: 0.89, papel: 'coroa' },
        { geo: new THREE.SphereGeometry(0.032, 12, 12), y: 0.915, papel: 'brilho' },
        // cetro — cabo com uma joia no topo, na mão
        { geo: new THREE.CylinderGeometry(0.011, 0.011, 0.36, 8), x: 0.1, y: 0.54, papel: 'armadura' },
        { geo: new THREE.SphereGeometry(0.032, 12, 12), x: 0.1, y: 0.735, papel: 'coroa' },
      ]
      break
    // rei — o mais alto, coroa + cruz, capa
    case 'k':
      partes = [
        { geo: new THREE.BoxGeometry(0.1, 0.08, 0.075), y: 0.36, papel: 'armadura' },
        { geo: new THREE.ConeGeometry(0.095, 0.3, 16), y: 0.51, papel: 'detalhe' },
        // capa — bem mais ampla, cobrindo quase toda a altura do corpo
        { geo: new THREE.BoxGeometry(0.17, 0.52, 0.032), y: 0.42, z: -0.085, rotX: 0.1, papel: 'detalhe' },
        // emblema no peito
        { geo: new THREE.BoxGeometry(0.032, 0.032, 0.013), y: 0.58, z: 0.065, rotZ: Math.PI / 4, papel: 'brilho' },
        { geo: new THREE.SphereGeometry(0.088, 16, 12), y: 0.74, papel: 'armadura' },
        { geo: new THREE.TorusGeometry(0.065, 0.02, 10, 20), y: 0.88, rotX: Math.PI / 2, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.025, 0.15, 0.025), y: 0.99, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.075, 0.025, 0.025), y: 1.01, papel: 'coroa' },
        // cajado — cabo com uma cruz no topo, igual à da coroa, na mão
        { geo: new THREE.CylinderGeometry(0.014, 0.014, 0.48, 8), x: 0.1, y: 0.53, papel: 'armadura' },
        { geo: new THREE.BoxGeometry(0.022, 0.09, 0.022), x: 0.1, y: 0.8, papel: 'coroa' },
        { geo: new THREE.BoxGeometry(0.055, 0.02, 0.02), x: 0.1, y: 0.815, papel: 'coroa' },
      ]
      break
  }
  geometriasPorTipo.set(tipo, partes)
  return partes
}

// ---------------------------------------------------------------------------
// Peças "RPG": cada tipo pode vir de um modelo .glb externo (malha + esqueleto + animações, feito
// no Blender — ver scripts/blender/importar_animacoes_mixamo.py) em vez de só primitivas
// geométricas. Todas usam o MESMO esqueleto (o do Mixamo, montado a partir do peão) e as mesmas
// animações de base; cada tipo muda os acessórios e tem os próprios golpes. Carregados uma vez só,
// em segundo plano, e reaproveitados (clonados) pra cada peça no tabuleiro. Se um arquivo não
// existir ou falhar ao carregar, aquele tipo cai de volta pro modelo geométrico de sempre — nunca
// quebra o tabuleiro por causa disso.
//
// Clipes que o jogo usa (nomes vindos do Blender):
//   Parado              — em pé normal; a pose de descanso, tocando o tempo todo por baixo
//   Gesto1, Gesto2…     — movimentos tocados de vez em quando, num intervalo sorteado por peça
//   Walk                — andando no lugar enquanto a peça desliza de casa em casa
//   Attack1, Attack2…   — os golpes DESTA peça (nenhum se repete entre tipos), sorteados na captura
//   Mortal, MortalTombo — o mortal pra trás do gesto amigável (às vezes com tombo no fim); no
//                         cavalo, um salto e um corcoveio que joga o cavaleiro pra cima
//   Desembainhar, Embainhar — só o peão, o único com espada: ele saca antes do golpe e dos gestos e
//                         guarda depois (a espada faz parte do modelo; ver EspadaRPG)
// O cavalo é um cavaleiro (o mesmo esqueleto das outras peças) montado num cavalo com ossos próprios.
// ---------------------------------------------------------------------------
interface ModeloRPG {
  cena: THREE.Object3D
  clipes: THREE.AnimationClip[]
}
const ARQUIVOS_MODELO_RPG: Record<string, string> = {
  p: 'peao_rpg.glb',
  r: 'torre_rpg.glb',
  n: 'cavalo_rpg.glb',
  b: 'bispo_rpg.glb',
  q: 'dama_rpg.glb',
  k: 'rei_rpg.glb',
}
// por tipo: undefined = ainda não tentou, null = tentou e falhou
const modelosRPG: Record<string, ModeloRPG | null | undefined> = {}
let carregamentoModelosRPG: Promise<void> | null = null

/** Dispara (uma única vez) o carregamento dos modelos RPG de todas as peças; chama `aoResolver`
 * quando todos terminarem (com sucesso ou falha) — usado pra re-sincronizar o tabuleiro e trocar
 * as peças já desenhadas (geométricas) pelos modelos novos assim que chegarem. */
function garantirModelosRPG(aoResolver: () => void) {
  if (!carregamentoModelosRPG) {
    const loader = new GLTFLoader()
    carregamentoModelosRPG = Promise.all(
      Object.entries(ARQUIVOS_MODELO_RPG).map(
        ([tipo, arquivo]) =>
          new Promise<void>((resolve) => {
            loader.load(
              `${import.meta.env.BASE_URL}models/${arquivo}`,
              (gltf) => {
                modelosRPG[tipo] = { cena: gltf.scene, clipes: gltf.animations }
                resolve()
              },
              undefined,
              () => {
                // sem modelo (ou falhou) — esse tipo segue com a peça geométrica normal
                modelosRPG[tipo] = null
                resolve()
              },
            )
          }),
      ),
    ).then(() => undefined)
  }
  carregamentoModelosRPG.then(aoResolver)
}

/** Intervalo (ms) entre um gesto e outro de cada peça parada — sorteado entre os dois valores pra
 * cada peça ter o próprio ritmo: a maior parte do tempo elas ficam só em pé, e de vez em quando
 * uma ou outra se mexe. */
const INTERVALO_GESTO_MIN_MS = 15000
const INTERVALO_GESTO_MAX_MS = 40000

function sortearProximoGesto(agora: number): number {
  return agora + INTERVALO_GESTO_MIN_MS + Math.random() * (INTERVALO_GESTO_MAX_MS - INTERVALO_GESTO_MIN_MS)
}

/** Material da peça pelo nome do material que veio do Blender: Corpo/Detalhe/Brilho seguem a
 * facção, Coroa é dourado, e a katana do peão: lâmina de aço (EspadaLamina), cabo e tsuba com a
 * trama escura (EspadaCabo, e CaboBainha — o cabo que aparece pra fora da saya) e a saya laqueada
 * de preto (BainhaKatana). */
function materialRPG(nome: string | undefined, cor: 'w' | 'b'): THREE.Material {
  if (nome === 'Detalhe') return materiaisPorFaccao[cor].detalhe
  if (nome === 'Coroa') return materialCoroa
  if (nome === 'Brilho') return materiaisPorFaccao[cor].brilho
  if (nome === 'EspadaLamina') return materialLaminaEspada
  if (nome === 'EspadaCabo' || nome === 'CaboBainha') return materialCaboKatana
  if (nome === 'BainhaKatana') return materialSaya
  return materiaisPorFaccao[cor].armadura
}

/** Espada do peão RPG: as malhas da espada na mão (aparecem só desembainhada) e do cabo que fica
 * pra fora da bainha (some enquanto ela está na mão) e os instantes
 * (em segundos) em que ela sai da bainha no clipe "Desembainhar" e entra no "Embainhar" — gravados
 * no próprio modelo pelo Blender (scripts/blender/importar_animacoes_mixamo.py). */
/** Números que vêm do modelo (gravados pelo Blender): a velocidade com que o corpo avança no
 * andar e na corrida (unidades por segundo, no tamanho do modelo — o jogo desloca a peça nessa
 * velocidade, então os pés não escorregam) e, no cavalo, em que segundo do salto ele sai do chão
 * e pousa. */
interface DadosRPG {
  velocidadeWalk: number
  velocidadeRun: number
  segundoDecola?: number
  segundoPousa?: number
}

interface EspadaRPG {
  naMao: THREE.Object3D[]
  naBainha: THREE.Object3D[]
  segundoSaque: number
  segundoGuarda: number
  fora: boolean
}

/** Monta o grupo da peça a partir do modelo RPG carregado — mesmo "contrato" da peça geométrica
 * (posição/rotação/escala aplicadas por fora, em buildPieceMesh), mas com esqueleto de verdade em
 * vez de pivôs manuais: guarda o AnimationMixer em userData pro laço de render atualizar, e as
 * ações (clipes) nomeadas em userData.acoesRPG pra outras funções (ataque, etc.) poderem tocar.
 */
function buildPecaRPG(modelo: ModeloRPG, cor: 'w' | 'b'): THREE.Group {
  const grupo = new THREE.Group()
  const clone = clonarComEsqueleto(modelo.cena) as THREE.Object3D

  // materiais PBR compartilhados (reaproveitados, não clonados, igual ao resto do tabuleiro). O
  // glTF divide a malha em uma primitiva por material, então cada uma vira um SkinnedMesh próprio
  // aqui, e o nome do material original (antes de trocar) diz qual material usar (ver materialRPG)
  // — e, no peão, quais malhas são a espada na mão e o cabo na bainha. O Blender grava nos
  // "extras" do esqueleto os números que o jogo precisa (velocidades do passo, tempos da espada e
  // do salto do cavalo) — o GLTFLoader põe em userData.
  const naMao: THREE.Object3D[] = []
  const naBainha: THREE.Object3D[] = []
  const extras: Record<string, number> = {}
  const malhas: THREE.SkinnedMesh[] = []
  clone.traverse((filho) => {
    for (const [chave, valor] of Object.entries(filho.userData)) {
      if (typeof valor === 'number') extras[chave] = valor
    }
    if (filho instanceof THREE.SkinnedMesh) malhas.push(filho)
  })
  for (const malha of malhas) {
    const nomeOriginal = Array.isArray(malha.material) ? undefined : malha.material?.name
    malha.material = materialRPG(nomeOriginal, cor)
    malha.userData.material = nomeOriginal
    malha.castShadow = true
    malha.receiveShadow = true
    if (nomeOriginal === 'EspadaLamina' || nomeOriginal === 'EspadaCabo') naMao.push(malha)
    if (nomeOriginal === 'CaboBainha') naBainha.push(malha)
  }
  grupo.add(clone)
  const dados: DadosRPG = {
    velocidadeWalk: extras.velocidade_walk ?? 0.68,
    velocidadeRun: extras.velocidade_run ?? 1.88,
    segundoDecola: extras.segundo_decola,
    segundoPousa: extras.segundo_pousa,
  }
  grupo.userData.dadosRPG = dados
  const segundoSaque = extras.segundo_saque
  const segundoGuarda = extras.segundo_guarda

  if (naMao.length && segundoSaque !== undefined && segundoGuarda !== undefined) {
    const espada: EspadaRPG = { naMao, naBainha, segundoSaque, segundoGuarda, fora: true }
    grupo.userData.espadaRPG = espada
    mostrarEspadaRPG(grupo, false)
  }

  const mixer = new THREE.AnimationMixer(clone)
  const acoes: Record<string, THREE.AnimationAction> = {}
  for (const clipe of modelo.clipes) {
    acoes[clipe.name] = mixer.clipAction(clipe)
  }
  acoes.Parado?.play()
  grupo.userData.mixer = mixer
  grupo.userData.acoesRPG = acoes
  grupo.userData.proximoGestoRPG = sortearProximoGesto(performance.now())

  return grupo
}

/** Espada na mão (true) ou guardada na bainha (false) — só o peão RPG tem espada. */
function mostrarEspadaRPG(mesh: THREE.Object3D, naMao: boolean) {
  const espada = mesh.userData.espadaRPG as EspadaRPG | undefined
  if (!espada || espada.fora === naMao) return
  espada.fora = naMao
  for (const parte of espada.naMao) parte.visible = naMao
  for (const parte of espada.naBainha) parte.visible = !naMao
}

/** Nomes dos clipes da peça que começam com `prefixo` (ex.: "Attack" → os golpes dela). */
function clipesRPGComPrefixo(mesh: THREE.Object3D, prefixo: string): string[] {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  return acoes ? Object.keys(acoes).filter((nome) => nome.startsWith(prefixo)) : []
}

/** Tira suavemente (fadeOut) tudo que estiver tocando ou parado no último quadro de um clipe
 * encadeado — `isRunning()` do Three.js não conta um clipe parado no fim (clampWhenFinished), que
 * continuaria com peso 1 misturado no seguinte. */
function desligarClipesRPG(acoes: Record<string, THREE.AnimationAction>, exceto: THREE.AnimationAction, duracao: number) {
  for (const outra of Object.values(acoes)) {
    if (outra !== exceto && outra.enabled && outra.isScheduled()) outra.fadeOut(duracao)
  }
}

/** Toca um clipe nomeado uma vez só — misturando a partir do que estiver tocando (Parado, um
 * gesto, o Walk…), sem precisar saber o quê — e volta pro "Parado" no fim (ou, com
 * `voltarAoParado: false`, fica parado no último quadro, pra encadear outro clipe em seguida).
 * `aoTerminar` roda quando o clipe acaba. Devolve false (e não faz nada) se a peça não tiver esse
 * clipe (peça geométrica, ou modelo sem essa animação). */
function tocarClipeRPGUmaVez(
  mesh: THREE.Object3D,
  nomeClipe: string,
  {
    entrada = 0.1,
    saida = 0.2,
    voltarAoParado = true,
    aoTerminar,
    velocidade = 1,
  }: { entrada?: number; saida?: number; voltarAoParado?: boolean; aoTerminar?: () => void; velocidade?: number } = {},
): boolean {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  const acao = acoes?.[nomeClipe]
  if (!acoes || !acao) return false
  desligarClipesRPG(acoes, acao, entrada)
  acao.reset()
  // o mesmo clipe serve a golpes de ritmos diferentes (o retalhamento é mais rápido): a velocidade vale a cada vez
  acao.timeScale = velocidade
  acao.setLoop(THREE.LoopOnce, 1)
  acao.clampWhenFinished = true
  acao.fadeIn(entrada).play()
  const mixer = mesh.userData.mixer as THREE.AnimationMixer
  const terminou = (evento: { action: THREE.AnimationAction }) => {
    if (evento.action !== acao) return
    mixer.removeEventListener('finished', terminou)
    if (voltarAoParado) {
      acoes.Parado?.reset().fadeIn(saida).play()
      acao.fadeOut(saida)
    }
    aoTerminar?.()
  }
  mixer.addEventListener('finished', terminou)
  return true
}

/** Começa uma sequência de clipes na peça (sacar → golpe/gesto → guardar) e devolve a "senha" dela:
 * os passos seguintes só acontecem se a senha ainda for a atual — começar outra sequência (ou um
 * lance, ver animarPosicao) cancela a anterior sem precisar desmarcar timers. */
function novaSequenciaRPG(mesh: THREE.Object3D): number {
  const senha = ((mesh.userData.sequenciaRPG as number | undefined) ?? 0) + 1
  mesh.userData.sequenciaRPG = senha
  return senha
}

function sequenciaRPGValida(mesh: THREE.Object3D, senha: number): boolean {
  return mesh.userData.sequenciaRPG === senha
}

/** Peão RPG desembainha a espada (a espada aparece na mão no instante em que ela sai da bainha) e
 * fica em guarda; `depois` roda ao fim do clipe. Sem espada (outras peças), chama `depois` direto. */
function sacarEspadaRPG(mesh: THREE.Object3D, senha: number, depois: () => void) {
  const espada = mesh.userData.espadaRPG as EspadaRPG | undefined
  if (!espada || espada.fora) {
    depois()
    return
  }
  const tocou = tocarClipeRPGUmaVez(mesh, 'Desembainhar', {
    entrada: 0.25,
    voltarAoParado: false,
    aoTerminar: () => {
      if (sequenciaRPGValida(mesh, senha)) depois()
    },
  })
  if (!tocou) {
    depois()
    return
  }
  window.setTimeout(() => {
    if (sequenciaRPGValida(mesh, senha)) mostrarEspadaRPG(mesh, true)
  }, espada.segundoSaque * 1000)
}

/** Peão RPG embainha a espada (ela some da mão no instante em que entra na bainha) e volta pro
 * Parado; `depois` (opcional) roda ao fim. */
function guardarEspadaRPG(mesh: THREE.Object3D, senha: number, depois?: () => void) {
  const espada = mesh.userData.espadaRPG as EspadaRPG | undefined
  if (!espada || !espada.fora) {
    depois?.()
    return
  }
  const tocou = tocarClipeRPGUmaVez(mesh, 'Embainhar', {
    entrada: 0.2,
    saida: 0.3,
    aoTerminar: () => {
      if (sequenciaRPGValida(mesh, senha)) depois?.()
    },
  })
  if (!tocou) {
    mostrarEspadaRPG(mesh, false)
    depois?.()
    return
  }
  window.setTimeout(() => {
    if (sequenciaRPGValida(mesh, senha)) mostrarEspadaRPG(mesh, false)
  }, espada.segundoGuarda * 1000)
}

/** Golpe da captura: um dos golpes desta peça, sorteado — cada tipo de peça tem os seus (nenhum
 * se repete entre tipos), então a mesma peça varia de uma captura pra outra sem padrão fixo. O
 * peão golpeia com a espada (já desembainhada, ver capturarComGolpe). */
function tocarGolpeRPG(mesh: THREE.Object3D) {
  const golpes = clipesRPGComPrefixo(mesh, 'Attack')
  if (golpes.length) {
    tocarClipeRPGUmaVez(mesh, golpes[Math.floor(Math.random() * golpes.length)], { voltarAoParado: !mesh.userData.espadaRPG })
  }
}

/** Gestos feitos com a espada na mão (o peão desembainha antes e guarda depois): todos menos a
 * meditação, que é com as mãos juntas. */
function gestoComEspada(gesto: string): boolean {
  return gesto !== 'GestoMeditar'
}

/** Chamado a cada quadro pra cada peça: parada a maior parte do tempo, de vez em quando (no
 * intervalo sorteado por peça) faz um dos gestos — só se estiver mesmo parada (sem andar, golpear
 * ou fazer um gesto amigável com outra peça naquele momento). O peão desembainha a espada, faz o
 * gesto com ela na mão e guarda de volta. */
function atualizarGestoRPG(mesh: THREE.Object3D, agora: number) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  if (!acoes || agora < (mesh.userData.proximoGestoRPG as number)) return
  mesh.userData.proximoGestoRPG = sortearProximoGesto(agora)
  const ocupada =
    meshesEmGesto.has(mesh) ||
    Boolean((mesh.userData.espadaRPG as EspadaRPG | undefined)?.fora) ||
    Object.entries(acoes).some(([nome, acao]) => nome !== 'Parado' && acao.enabled && acao.isScheduled() && acao.getEffectiveWeight() > 0.01)
  if (ocupada) return
  const gestos = clipesRPGComPrefixo(mesh, 'Gesto')
  if (!gestos.length) return
  const gesto = gestos[Math.floor(Math.random() * gestos.length)]
  if (!mesh.userData.espadaRPG || !gestoComEspada(gesto)) {
    tocarClipeRPGUmaVez(mesh, gesto, { entrada: 0.5, saida: 0.6 })
    return
  }
  const senha = novaSequenciaRPG(mesh)
  sacarEspadaRPG(mesh, senha, () => {
    tocarClipeRPGUmaVez(mesh, gesto, {
      entrada: 0.3,
      voltarAoParado: false,
      aoTerminar: () => {
        if (sequenciaRPGValida(mesh, senha)) guardarEspadaRPG(mesh, senha)
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Braços e pernas — mesma geometria pra todas as peças, com o pivô na
// articulação (quadril/ombro) em vez do centro da peça, pra poder balançar
// como uma caminhada de verdade durante a animação do lance. Bem mais finos que antes — é a peça
// central do visual "boneco de madeira": membros claramente mais estreitos que antes, ainda
// cilíndricos (não viram linha), pendurados de um corpo igualmente mais fino (ver geometriasDoTipo).
// ---------------------------------------------------------------------------
const geoPerna = new THREE.CylinderGeometry(0.024, 0.03, 0.32, 10)
const geoBraco = new THREE.CylinderGeometry(0.019, 0.024, 0.26, 10)

interface ConfigMembro {
  geo: THREE.BufferGeometry
  comprimento: number
  pivotX: number
  pivotY: number
  papel: Papel
}

const CONFIG_PERNA_ESQ: ConfigMembro = { geo: geoPerna, comprimento: 0.32, pivotX: -0.04, pivotY: 0.32, papel: 'armadura' }
const CONFIG_PERNA_DIR: ConfigMembro = { geo: geoPerna, comprimento: 0.32, pivotX: 0.04, pivotY: 0.32, papel: 'armadura' }
const CONFIG_BRACO_ESQ: ConfigMembro = { geo: geoBraco, comprimento: 0.26, pivotX: -0.085, pivotY: 0.52, papel: 'armadura' }
const CONFIG_BRACO_DIR: ConfigMembro = { geo: geoBraco, comprimento: 0.26, pivotX: 0.085, pivotY: 0.52, papel: 'armadura' }

/** Escala geral por tipo — só pra dar hierarquia de tamanho (rei/dama maiores, torre mais robusta). */
const ESCALA_POR_TIPO: Record<string, number> = { p: 1, n: 1, b: 1.05, r: 1.1, q: 1.08, k: 1.15 }
/** Ajuste extra só pros modelos RPG: o cavalo montado (cavaleiro sentado no cavalo) fica mais alto
 * e mais comprido que um boneco em pé — encolhido um pouco pra caber na casa sem destoar. */
const ESCALA_MODELO_RPG: Record<string, number> = { n: 0.85 }

interface MembrosPersonagem {
  pernaEsq: THREE.Group
  pernaDir: THREE.Group
  bracoEsq: THREE.Group
  bracoDir: THREE.Group
}

/** Pose de descanso de cada membro (rotation.x) — todas as peças ficam com os braços caídos por
 * padrão (o peão só empunha a espada durante o ataque, ver animarAtaqueEspada). A caminhada soma o
 * balanço em cima dessa base, em vez de partir sempre de zero. */
interface PoseBaseMembros {
  pernaEsq: number
  pernaDir: number
  bracoEsq: number
  bracoDir: number
}
const POSE_BASE_NEUTRA: PoseBaseMembros = { pernaEsq: 0, pernaDir: 0, bracoEsq: 0, bracoDir: 0 }

interface MateriaisFaccao {
  armadura: THREE.MeshStandardMaterial
  detalhe: THREE.MeshStandardMaterial
  brilho: THREE.MeshStandardMaterial
}

// Materiais "HD" (PBR, com o reflexo do ambiente — ver scene.environment): armadura de metal
// polido, detalhes em tecido/couro foscos, brilho que emite luz própria (olhos, joias, orbe).
// Reino (brancas) — armadura de aço claro, detalhes em azul-real, brilho ciano
// Horda (pretas) — armadura de aço escuro, detalhes em vermelho-sangue, brilho vermelho
function materialBrilho(cor: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 1.4, roughness: 0.4 })
}
const materiaisPorFaccao: Record<'w' | 'b', MateriaisFaccao> = {
  w: {
    armadura: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: 0.55, roughness: 0.3 }),
    detalhe: new THREE.MeshStandardMaterial({ color: 0x2a4d8f, metalness: 0.1, roughness: 0.6 }),
    brilho: materialBrilho(0x8fe3ff),
  },
  b: {
    armadura: new THREE.MeshStandardMaterial({ color: 0x2c2d33, metalness: 0.6, roughness: 0.32 }),
    detalhe: new THREE.MeshStandardMaterial({ color: 0x8a2222, metalness: 0.1, roughness: 0.6 }),
    brilho: materialBrilho(0xff7a5c),
  },
}

const materialCoroa = new THREE.MeshStandardMaterial({ color: 0xe0b93d, metalness: 1, roughness: 0.22 })

function materialDaParte(papel: Papel, cor: 'w' | 'b'): THREE.Material {
  return papel === 'coroa' ? materialCoroa : materiaisPorFaccao[cor][papel]
}

// ---------------------------------------------------------------------------
// Espada do peão — mesmo aço/cabo pras duas facções (não segue o material por
// papel/cor), parentada no pivô da mão direita, pra balançar junto do braço
// tanto na caminhada durante o lance quanto na pose parada.
// ---------------------------------------------------------------------------
const geoLaminaEspada = new THREE.BoxGeometry(0.032, 0.26, 0.065)
const geoGuardaEspada = new THREE.BoxGeometry(0.1, 0.022, 0.022)
const geoCaboEspada = new THREE.CylinderGeometry(0.014, 0.014, 0.075, 8)
const materialLaminaEspada = new THREE.MeshStandardMaterial({ color: 0xc9d1dc, metalness: 1, roughness: 0.18 })
// marrom-couro claro (não escuro) de propósito — precisa contrastar tanto com a armadura clara
// das brancas quanto com a armadura escura das pretas, senão some contra uma das duas facções
const materialCaboEspada = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, metalness: 0, roughness: 0.75 })
// katana do peão RPG: cabo (tsuka) e tsuba com a trama de seda escura, saya de laca preta brilhante
const materialCaboKatana = new THREE.MeshStandardMaterial({ color: 0x1f2a44, metalness: 0.2, roughness: 0.7 })
const materialSaya = new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: 0.1, roughness: 0.22 })

function materiaisDaPeca(cor: 'w' | 'b'): MateriaisDaPeca {
  const { armadura, detalhe, brilho } = materiaisPorFaccao[cor]
  return { armadura, detalhe, brilho, coroa: materialCoroa, lamina: materialLaminaEspada }
}

/** Quem joga veste as próprias peças com o que escolheu na Personalização; o adversário e a máquina, não. No menu,
 * as vestidas são as brancas. */
let vestimenta: { cor: 'w' | 'b'; escolhas: Record<string, Record<string, string>> } = { cor: 'w', escolhas: {} }
/** Só nos testes: veste as peças de quem joga sem passar pela conta. */
let vestimentaDeTeste: Record<string, Record<string, string>> | null = null
/** Só nos testes: o retalhamento sem ter comprado. */
let retalhamentoDeTeste = false

/** A arma do peão no tabuleiro: a escolhida, ou nenhuma. */
const armaDoPeaoNoTabuleiro = (peao: THREE.Object3D) => peao.userData.arma as string | undefined
const assinaturaDaVestimenta = (tipo: string, cor: 'w' | 'b') => (cor === vestimenta.cor ? JSON.stringify(vestimenta.escolhas[tipo] ?? {}) : '{}')

function criarEspadaDoPeao(): THREE.Group {
  const espada = new THREE.Group()
  const partes: { geo: THREE.BufferGeometry; y: number; material: THREE.Material }[] = [
    { geo: geoCaboEspada, y: -0.035, material: materialCaboEspada },
    { geo: geoGuardaEspada, y: -0.07, material: materialCaboEspada },
    { geo: geoLaminaEspada, y: -0.2, material: materialLaminaEspada },
  ]
  for (const parte of partes) {
    const mesh = new THREE.Mesh(parte.geo, parte.material)
    mesh.position.y = parte.y
    mesh.castShadow = true
    espada.add(mesh)

    const contorno = criarContorno(parte.geo)
    contorno.position.y = parte.y
    espada.add(contorno)
  }
  return espada
}

/** Monta um braço ou perna: um grupo-pivô na articulação, com o membro pendurado abaixo dele — girar o pivô move o membro inteiro, como uma dobradiça. */
function criarMembro(cfg: ConfigMembro, cor: 'w' | 'b'): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(cfg.pivotX, cfg.pivotY, 0)

  const mesh = new THREE.Mesh(cfg.geo, materialDaParte(cfg.papel, cor))
  mesh.position.y = -cfg.comprimento / 2
  mesh.castShadow = true
  pivot.add(mesh)

  const contorno = criarContorno(cfg.geo)
  contorno.position.y = -cfg.comprimento / 2
  pivot.add(contorno)

  return pivot
}

function buildPieceMesh(tipo: string, cor: 'w' | 'b'): THREE.Group {
  // peça com o modelo RPG carregado (malha + esqueleto + animações do Blender) em vez da
  // geométrica de sempre — mesmo "contrato" externo (userData.tipo/cor, rotação por cor, escala),
  // só a montagem interna que muda. Sem bainha/espada procedural aqui: o modelo é autocontido. Os
  // modelos olham pra +Z, como as peças geométricas (inclusive o cavalo, que lá é exceção)
  const modeloRPG = modelosRPG[tipo]
  if (modeloRPG) {
    const grupo = buildPecaRPG(modeloRPG, cor)
    // toda peça passa por aqui: sem escolha (o adversário, a máquina), fica sem arma
    const escolhas = cor === vestimenta.cor ? vestimenta.escolhas[tipo] : undefined
    vestirPeca(grupo, tipo, escolhas ?? {}, materiaisDaPeca(cor))
    grupo.userData.vestimenta = assinaturaDaVestimenta(tipo, cor)
    grupo.userData.tipo = tipo
    grupo.userData.cor = cor
    grupo.rotation.y = cor === 'w' ? Math.PI : 0
    grupo.scale.setScalar((ESCALA_POR_TIPO[tipo] ?? 1) * (ESCALA_MODELO_RPG[tipo] ?? 1))
    return grupo
  }

  const grupo = new THREE.Group()
  grupo.userData.tipo = tipo
  grupo.userData.cor = cor
  for (const parte of geometriasDoTipo(tipo)) {
    const mesh = new THREE.Mesh(parte.geo, materialDaParte(parte.papel, cor))
    mesh.position.set(parte.x ?? 0, parte.y, parte.z ?? 0)
    if (parte.rotX) mesh.rotation.x = parte.rotX
    if (parte.rotY) mesh.rotation.y = parte.rotY
    if (parte.rotZ) mesh.rotation.z = parte.rotZ
    mesh.castShadow = true
    grupo.add(mesh)

    if (parte.papel !== 'brilho') {
      const contorno = criarContorno(parte.geo)
      contorno.position.copy(mesh.position)
      contorno.rotation.copy(mesh.rotation)
      grupo.add(contorno)
    }
  }

  const membros: MembrosPersonagem = {
    pernaEsq: criarMembro(CONFIG_PERNA_ESQ, cor),
    pernaDir: criarMembro(CONFIG_PERNA_DIR, cor),
    bracoEsq: criarMembro(CONFIG_BRACO_ESQ, cor),
    bracoDir: criarMembro(CONFIG_BRACO_DIR, cor),
  }
  grupo.add(membros.pernaEsq, membros.pernaDir, membros.bracoEsq, membros.bracoDir)
  grupo.userData.membros = membros

  const poseBase: PoseBaseMembros = { ...POSE_BASE_NEUTRA }
  if (tipo === 'p') {
    // bainha na cintura, do lado direito, em couro/madeira (cor fixa, não segue a facção —
    // por isso não usa 'detalhe' como o resto da armadura, senão ela sumiria misturada nos
    // outros acessórios azuis/vermelhos). Dois problemas descartaram as duas primeiras
    // tentativas: (1) o braço direito pendurado (CONFIG_BRACO_DIR) cobre boa parte da cintura em
    // x, então em z~0 a bainha ficava atrás/colada nele, invisível; (2) deslocar em Z (pra
    // frente do corpo) resolvia pro preto mas escondia nas brancas — as brancas giram 180°
    // (rotation.y = PI mais abaixo) então o mesmo +Z que fica de frente pra câmera no preto vira
    // de costas (escondido atrás do próprio corpo) no branco. A solução é ficar em z≈0
    // (puramente na lateral, sem comprometer frente/costas) e escapar do braço só em X, puxada
    // pra fora do quadril — os números aqui acompanham o braço bem mais fino do visual atual
    // (ver geoBraco/CONFIG_BRACO_DIR). A espada em si só existe presa na mão durante o ataque,
    // criada e destruída ali (ver animarAtaqueEspada) — o peão não anda por aí com ela
    // desembainhada, só o cabo espia pra fora da boca da bainha.
    const ANGULO_BAINHA = 0.174
    const geoBainha = new THREE.BoxGeometry(0.032, 0.2, 0.038)
    const bainha = new THREE.Mesh(geoBainha, materialCaboEspada)
    bainha.position.set(0.143, 0.34, 0)
    bainha.rotation.z = ANGULO_BAINHA
    bainha.castShadow = true
    grupo.add(bainha)

    const contornoBainha = criarContorno(geoBainha)
    contornoBainha.position.copy(bainha.position)
    contornoBainha.rotation.copy(bainha.rotation)
    grupo.add(contornoBainha)

    const caboNaBainha = new THREE.Mesh(geoCaboEspada, materialCaboEspada)
    caboNaBainha.position.set(0.125, 0.44, 0)
    caboNaBainha.rotation.z = ANGULO_BAINHA
    caboNaBainha.castShadow = true
    grupo.add(caboNaBainha)
  }
  grupo.userData.poseBase = poseBase

  // todo detalhe assimétrico (olhos, espada em guarda) foi desenhado virado pra +Z, que é "pra
  // frente" pras pretas (avançam de z negativo pra positivo) — as brancas avançam ao contrário
  // (de z positivo pra negativo), então giram 180° aqui pra também ficarem de frente pro
  // adversário em vez de de costas
  let rotacaoY = cor === 'w' ? Math.PI : 0
  // o cavalo é a exceção: foi desenhado com o pescoço/cabeça do cavalo virados pra -Z (o
  // contrário de toda outra peça), então precisa de mais 180° em cima da correção por cor —
  // pras pretas isso sozinho já vira a cabeça pra frente, e pras brancas os dois 180° se cancelam
  if (tipo === 'n') rotacaoY += Math.PI
  grupo.rotation.y = rotacaoY

  grupo.scale.setScalar(ESCALA_POR_TIPO[tipo] ?? 1)

  return grupo
}

const LARGURA_FULL_HD = 1920
const ALTURA_FULL_HD = 1080

// Velocidade de caminhada das peças: a duração do deslocamento e o número de passadas escalam
// com a distância percorrida (em casas do tabuleiro), então uma peça anda no mesmo ritmo humano
// constante tanto num lance curto quanto num lance longo — em vez de todo lance levar o mesmo
// tempo fixo, com as pernas balançando fixo desincronizadas da distância real percorrida.
const VELOCIDADE_CASAS_POR_SEGUNDO = 2.6
const DURACAO_LANCE_MIN_MS = 650
const DURACAO_LANCE_MAX_MS = 2400
const PASSADAS_POR_CASA = 1.6
/** Meia-volta do tabuleiro ao escolher a cor das peças. */
const GIRO_CAMERA_MS = 1400
/** Pausa "pensando" da máquina antes de mover, pro ritmo geral ficar mais compassado. */
const PAUSA_MAQUINA_MS = 700
/** Com o lance no livro não há o que calcular: só o suficiente pra resposta não vir no mesmo instante. */
const PAUSA_MAQUINA_LIVRO_MS = 200
interface Qualidade {
  /** Quantos pixels de desenho por pixel da tela, pro tamanho do tabuleiro na tela. */
  resolucao: (largura: number, altura: number) => number
  /** Tamanho do mapa de sombras; 0, sem sombras. */
  sombras: number
  /** Teto de quadros por segundo; 0, o que a tela der. */
  quadrosPorSegundo: number
  /** Antisserrilhado e o filtro que deixa a madeira nítida de longe. Valem ao abrir o jogo. */
  acabamento: boolean
}

/** O que cada qualidade do jogo muda. */
const QUALIDADES: Record<QualidadeXadrez, Qualidade> = {
  // a leve, pra celular e computador fracos: abaixo da resolução da tela, sem sombras, sem antisserrilhado e a 30
  // quadros por segundo. A imagem fica mais simples, mas o aparelho aguenta
  baixa: { resolucao: () => Math.min(window.devicePixelRatio || 1, 1.25) * 0.8, sombras: 0, quadrosPorSegundo: 30, acabamento: false },
  // o padrão: até 1,6 vez a tela (no celular, que tem tela densa, bem menos que Full HD), com sombras médias e nunca
  // abaixo da resolução da tela no computador
  media: {
    resolucao: (largura, altura) => Math.max(Math.min(window.devicePixelRatio || 1, 1), Math.min(pixelRatioParaFullHD(largura, altura), 2) * 0.8),
    sombras: 1024,
    quadrosPorSegundo: 0,
    acabamento: true,
  },
  // a mais bonita, como sempre foi: no mínimo Full HD, com as sombras grandes
  alta: { resolucao: (largura, altura) => pixelRatioParaFullHD(largura, altura), sombras: 2048, quadrosPorSegundo: 0, acabamento: true },
}
/** Vista de lado do menu: mais baixa e mais perto que a do jogo, pra ver as peças de frente. */
const RAIO_CAMERA_MENU = 11.5
const INCLINACAO_CAMERA_MENU = 1.12

/** Calcula o pixel ratio necessário pra garantir que o canvas renderize em pelo menos Full HD (1920x1080), mesmo quando o card exibido na tela é menor — limitado a 3x pra não sobrecarregar a GPU em telas muito pequenas. */
function pixelRatioParaFullHD(larguraCss: number, alturaCss: number): number {
  const dpr = window.devicePixelRatio || 1
  const fatorParaFullHD = Math.max(LARGURA_FULL_HD / Math.max(larguraCss, 1), ALTURA_FULL_HD / Math.max(alturaCss, 1))
  return Math.min(Math.max(dpr, fatorParaFullHD), 3)
}

/** Ângulo de `de` até `para` pelo caminho mais curto (entre -π e π). */
function diferencaAngular(de: number, para: number): number {
  return Math.atan2(Math.sin(para - de), Math.cos(para - de))
}

/** A frente de cada peça no tabuleiro: as brancas olham pras pretas (-Z) e as pretas pras brancas (+Z). */
function rumoDeDescanso(mesh: THREE.Object3D): number {
  return mesh.userData.cor === 'w' ? Math.PI : 0
}

/** Rumo (rotation.y) de quem olha de `de` pra `para`. */
function rumoEntre(de: { x: number; z: number }, para: { x: number; z: number }): number {
  return Math.atan2(para.x - de.x, para.z - de.z)
}

/** Chance de o peão capturado por outro peão se render com a honra de um samurai (em vez de lutar). */
const CHANCE_HONRA_SAMURAI = 0.15
/** A que distância do derrotado o vencedor para pra se curvar (em casas, no tamanho do modelo). */
const DISTANCIA_REVERENCIA = 0.75

/** Até onde vai o golpe corpo a corpo (em casas, no tamanho do modelo): a peça para a essa
 * distância da vítima pra golpear — o peão com a espada alcança mais longe que a torre com o punho/pé. */
const ALCANCE_GOLPE: Record<string, number> = { p: 0.62, r: 0.77 }

/** Acima disso (em casas, no tamanho do modelo) a peça corre em vez de andar. */
const DISTANCIA_PRA_CORRER = 2.2
/** Tempo pra acelerar até a velocidade do passo (e pra frear no fim). */
const TEMPO_ACELERACAO_S = 0.35

/** Peça RPG dando passos no lugar enquanto gira até o rumo `alvo` (sem girar parada feito um
 * pião); `depois` roda ao terminar. */
function virarRPG(mesh: THREE.Object3D, alvo: number, depois: () => void) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const caminhada = acoes.Walk
  const inicial = mesh.rotation.y
  const giro = diferencaAngular(inicial, alvo)
  if (Math.abs(giro) < 0.05) {
    mesh.rotation.y = alvo
    depois()
    return
  }
  const duracao = Math.max(0.2, (Math.abs(giro) / Math.PI) * 0.6)
  if (caminhada) {
    desligarClipesRPG(acoes, caminhada, 0.15)
    if (!caminhada.isRunning()) caminhada.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play()
    caminhada.setEffectiveTimeScale(0.7)
  }
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / 1000 / duracao)
    const suave = t * t * (3 - 2 * t)
    mesh.rotation.y = inicial + giro * suave
    if (t < 1) requestAnimationFrame(passo)
    else depois()
  }
  requestAnimationFrame(passo)
}

/** Volta suave pro "Parado" (e o ritmo normal de todos os clipes). */
function pararRPG(mesh: THREE.Object3D) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const parado = acoes.Parado
  if (parado) {
    desligarClipesRPG(acoes, parado, 0.25)
    parado.reset().fadeIn(0.25).play()
  }
  for (const acao of Object.values(acoes)) acao.setEffectiveTimeScale(1)
}

/**
 * Peça RPG andando (até ~2 casas) ou correndo (mais longe) de `de` até `para`, na velocidade do
 * próprio passo — o corpo avança exatamente o que os pés pisam (velocidade medida no clipe, ver
 * DadosRPG) —, acelerando no começo e freando no fim (perfil trapezoidal), com o ritmo dos passos
 * acompanhando a velocidade. Não vira nem para no fim (quem chama decide o que vem depois).
 */
function deslocarRPG(mesh: THREE.Object3D, de: { x: number; z: number }, para: { x: number; z: number }, depois: () => void) {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction>
  const dados = mesh.userData.dadosRPG as DadosRPG
  const dx = para.x - de.x
  const dz = para.z - de.z
  const distancia = Math.hypot(dx, dz)
  const escala = mesh.scale.x
  const corre = distancia / escala > DISTANCIA_PRA_CORRER && Boolean(acoes.Run)
  const clipe = corre ? acoes.Run : acoes.Walk
  const velocidade = (corre ? dados.velocidadeRun : dados.velocidadeWalk) * escala
  if (!clipe || distancia < 1e-3) {
    depois()
    return
  }
  desligarClipesRPG(acoes, clipe, 0.2)
  if (!clipe.isRunning()) clipe.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play()
  const aceleracao = Math.min(TEMPO_ACELERACAO_S, (0.5 * distancia) / velocidade)
  const total = distancia / velocidade + aceleracao
  // o som de cada passo cai quando o pé encosta no chão; o cavalo (patas sem esses ossos) galopa pela distância
  const pisar = ouvidoDosPes(mesh, corre)
  const passada = velocidade * ritmoDosPassos(mesh.userData.tipo as string, corre)
  let proximaPisada = passada * 0.3
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(total, (agora - inicio) / 1000)
    let percorrido: number
    let v: number
    if (t < aceleracao) {
      percorrido = (velocidade * t * t) / (2 * aceleracao)
      v = (velocidade * t) / aceleracao
    } else if (t < total - aceleracao) {
      percorrido = (velocidade * aceleracao) / 2 + velocidade * (t - aceleracao)
      v = velocidade
    } else {
      const falta = total - t
      percorrido = distancia - (velocidade * falta * falta) / (2 * aceleracao)
      v = (velocidade * falta) / aceleracao
    }
    const fracao = Math.min(1, percorrido / distancia)
    mesh.position.x = de.x + dx * fracao
    mesh.position.z = de.z + dz * fracao
    if (pisar) pisar()
    else {
      // acelerando e freando, os passos ficam mais espaçados no tempo: cada um a uma passada de distância
      while (percorrido >= proximaPisada) {
        tocarUmPasso(mesh.userData.tipo as string, corre)
        proximaPisada += passada
      }
    }
    // o ritmo dos passos acompanha a velocidade (nunca parado de todo, pra não "congelar" no
    // meio de um passo enquanto ainda arranca/freia)
    clipe!.setEffectiveTimeScale(Math.max(0.35, v / velocidade))
    if (t < total) requestAnimationFrame(passo)
    else depois()
  }
  requestAnimationFrame(passo)
}

/**
 * Escuta os pés da peça andando: a cada quadro, o pé que vinha descendo e para de descer perto do ponto mais baixo
 * dele é o pé que pisou, e o passo soa ali. Null pra peça sem os ossos dos pés (o cavalo).
 */
function ouvidoDosPes(mesh: THREE.Object3D, correndo: boolean): (() => void) | null {
  const tipo = mesh.userData.tipo as string
  const pes = ['LeftFoot', 'RightFoot'].map((nome) => ossoRPG(mesh, nome)).filter((osso): osso is THREE.Object3D => Boolean(osso))
  if (tipo === 'n' || pes.length < 2) return null
  const ponto = new THREE.Vector3()
  // cada pé só pisa de novo depois de ter subido de verdade: o calcanhar e a ponta encostam em dois tempos, e sem isso
  // o mesmo passo soava duas vezes
  const estados = pes.map(() => ({ anterior: Infinity, menor: Infinity, maior: -Infinity, levantado: false, ultimo: 0 }))
  return () => {
    const agora = performance.now()
    pes.forEach((osso, i) => {
      const e = estados[i]
      const y = osso.getWorldPosition(ponto).y
      e.menor = Math.min(e.menor, y)
      e.maior = Math.max(e.maior, y)
      const altura = e.maior - e.menor
      if (altura < 0.008 * mesh.scale.y) return
      if (y > e.menor + altura * 0.6) e.levantado = true
      else if (e.levantado && y <= e.menor + altura * 0.25 && agora - e.ultimo > 160) {
        e.levantado = false
        e.ultimo = agora
        tocarUmPasso(tipo, correndo)
      }
      e.anterior = y
    })
  }
}

/** Cavalo: salto de `de` até `para` (o salto do clipe "Mortal") — só se desloca entre a decolagem e
 * o pouso; `aoPousar` roda no instante em que as patas tocam o chão, `depois` no fim do clipe. */
function saltarRPG(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  depois: () => void,
  aoPousar?: () => void,
) {
  const dados = mesh.userData.dadosRPG as DadosRPG
  const decola = dados.segundoDecola ?? 0.4
  const pousa = dados.segundoPousa ?? 1.13
  tocarSom('salto:n')
  tocarClipeRPGUmaVez(mesh, 'Mortal', { entrada: 0.15, voltarAoParado: false, aoTerminar: depois })
  const inicio = performance.now()
  function passo(agora: number) {
    const t = (agora - inicio) / 1000
    const fracao = Math.min(1, Math.max(0, (t - decola) / (pousa - decola)))
    mesh.position.x = de.x + (para.x - de.x) * fracao
    mesh.position.z = de.z + (para.z - de.z) * fracao
    if (fracao < 1) {
      requestAnimationFrame(passo)
      return
    }
    tocarSom('pouso:n')
    aoPousar?.()
  }
  requestAnimationFrame(passo)
}

/** O cavalo RPG salta (em vez de andar) — só se o modelo trouxer o salto. */
function pecaSaltaRPG(mesh: THREE.Object3D): boolean {
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  const dados = mesh.userData.dadosRPG as DadosRPG | undefined
  return mesh.userData.tipo === 'n' && Boolean(acoes?.Mortal) && dados?.segundoDecola !== undefined
}

/**
 * Peça RPG indo de uma casa a outra, como um personagem de verdade: vira pra onde vai, anda ou
 * corre (ver deslocarRPG) e, ao chegar, vira de volta de frente pro adversário e para. O cavalo
 * salta direto até a casa, como o cavalo do xadrez, que pula por cima das outras peças.
 * `aoPousar` (só o cavalo) roda no instante em que ele toca o chão — é quando ele atropela a peça
 * capturada.
 */
function animarPosicaoRPG(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  aoTerminar: () => void,
  aoPousar?: () => void,
) {
  // um lance interrompe o que a peça estava fazendo (gesto com a espada na mão, por exemplo): a
  // sequência em andamento é cancelada e a espada volta pra bainha
  novaSequenciaRPG(mesh)
  mostrarEspadaRPG(mesh, false)
  const terminar = () => {
    pararRPG(mesh)
    aoTerminar()
  }
  const seguir = () => virarRPG(mesh, rumoDeDescanso(mesh), terminar)
  if (Math.hypot(para.x - de.x, para.z - de.z) < 1e-3) {
    seguir()
    return
  }
  virarRPG(mesh, rumoEntre(de, para), () => {
    if (pecaSaltaRPG(mesh)) saltarRPG(mesh, de, para, seguir, aoPousar)
    else deslocarRPG(mesh, de, para, seguir)
  })
}

/**
 * Anima a posição x/z (ease-in-out) e, se a peça tiver braços/pernas, balança os membros como uma
 * caminhada durante o trajeto — voltando à pose de descanso da peça (guarda, no caso do peão) ao
 * terminar. Duração e número de passadas escalam com a distância percorrida, então o ritmo do
 * "passo" fica igual não importa se a peça andou uma casa ou atravessou o tabuleiro inteiro. As
 * peças RPG vão por animarPosicaoRPG.
 */
function animarPosicao(
  mesh: THREE.Object3D,
  de: { x: number; z: number },
  para: { x: number; z: number },
  aoTerminar: () => void,
  aoPousar?: () => void,
) {
  // a peça estava no meio de uma recusa ou de um gesto: quem leva ela agora é o lance
  voltarAoDescanso(mesh)
  if (mesh.userData.acoesRPG && mesh.userData.dadosRPG) {
    animarPosicaoRPG(mesh, de, para, aoTerminar, aoPousar)
    return
  }
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA

  const distancia = Math.hypot(para.x - de.x, para.z - de.z)
  const duracaoMs = Math.min(
    DURACAO_LANCE_MAX_MS,
    Math.max(DURACAO_LANCE_MIN_MS, (distancia / VELOCIDADE_CASAS_POR_SEGUNDO) * 1000),
  )
  const passadas = Math.max(1, Math.round(distancia * PASSADAS_POR_CASA))
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const suave = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    mesh.position.x = de.x + (para.x - de.x) * suave
    mesh.position.z = de.z + (para.z - de.z) * suave

    if (membros) {
      const envelope = Math.sin(t * Math.PI) // 0 no início/fim do trajeto, evita um "chute" seco na primeira/última passada
      const balanco = Math.sin(t * Math.PI * passadas) * 0.55 * envelope
      membros.pernaEsq.rotation.x = base.pernaEsq + balanco
      membros.pernaDir.rotation.x = base.pernaDir - balanco
      membros.bracoEsq.rotation.x = base.bracoEsq - balanco
      membros.bracoDir.rotation.x = base.bracoDir + balanco
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      if (membros) {
        membros.pernaEsq.rotation.x = base.pernaEsq
        membros.pernaDir.rotation.x = base.pernaDir
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.bracoDir.rotation.x = base.bracoDir
      }
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

/** Duração da comemoração de xeque-mate — pulos com os braços levantados, cada peça começando num instante levemente diferente pra não ficarem todas sincronizadas feito robôs. */
const DURACAO_COMEMORACAO_MS = 2400

/**
 * Faz a peça pular com os braços erguidos, comemorando — usado tanto na comemoração grande de
 * xeque-mate quanto (com uma duração bem mais curta) quando peças aliadas próximas reagem a uma
 * captura de um companheiro de time.
 */
function animarComemoracao(mesh: THREE.Object3D, atraso: number, duracaoMs: number = DURACAO_COMEMORACAO_MS) {
  voltarAoDescanso(mesh)
  // peça RPG: o clipe "Comemorar" (pulos de verdade com os braços erguidos — no cavalo, ele empina
  // com o cavaleiro de punho erguido), em vez de quicar a peça inteira rígida
  if ((mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined)?.Comemorar) {
    window.setTimeout(() => {
      if (meshesEmGesto.has(mesh)) return
      novaSequenciaRPG(mesh)
      mostrarEspadaRPG(mesh, false)
      tocarClipeRPGUmaVez(mesh, 'Comemorar', { entrada: 0.15, saida: 0.3 })
    }, atraso)
    return
  }
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const yBase = mesh.position.y
  const rotYBase = mesh.rotation.y // brancas ficam viradas 180° (Math.PI) — não pode resetar pra 0
  const inicio = performance.now() + atraso
  function passo(agora: number) {
    if (agora < inicio) {
      requestAnimationFrame(passo)
      return
    }
    const t = Math.min(1, (agora - inicio) / duracaoMs)
    const amortecido = 1 - t // os pulos vão ficando mais baixos até parar
    const pulo = Math.abs(Math.sin(t * Math.PI * 7)) * 0.22 * amortecido
    mesh.position.y = yBase + pulo
    mesh.rotation.y = rotYBase + Math.sin(t * Math.PI * 3) * 0.5 * amortecido

    if (membros) {
      const braceje = Math.sin(t * Math.PI * 9) * 0.25
      membros.bracoEsq.rotation.z = (Math.PI * 0.65 + braceje) * amortecido
      membros.bracoDir.rotation.z = -(Math.PI * 0.65 - braceje) * amortecido
      membros.pernaEsq.rotation.x = pulo * 1.5
      membros.pernaDir.rotation.x = -pulo * 1.5
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.position.y = yBase
      mesh.rotation.y = rotYBase
      if (membros) {
        membros.bracoEsq.rotation.z = 0
        membros.bracoDir.rotation.z = 0
        membros.pernaEsq.rotation.x = 0
        membros.pernaDir.rotation.x = 0
      }
    }
  }
  requestAnimationFrame(passo)
}

/** Duração do gesto amigável entre peças aliadas — bem mais longa e cadenciada, pra ficar mais
 * natural (dá tempo de perceber o movimento) em vez de um giro-e-volta rápido demais. O mortal é
 * um pouco mais curto (senão fica devagar demais pra dar uma volta inteira). */
const DURACAO_GESTO_MS = 2800
const DURACAO_MORTAL_MS = 1800
/** Chance de o mortal da peça RPG terminar num tombo (cai sentada, fica tonta e levanta). */
const CHANCE_TOMBO_NO_MORTAL = 0.3

/** Meshes com um gesto amigável em andamento agora — sincronizarPecas() confere esse conjunto
 * antes de recriar uma peça do zero, pra não cortar/acelerar a interação no meio caso um lance
 * (do jogador ou da máquina) aconteça enquanto ela ainda está rolando. */
const meshesEmGesto = new Set<THREE.Object3D>()

/** Onde a peça descansa: o centro da casa e o giro de frente. */
interface Descanso {
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
}

/**
 * A recusa e o gesto amigável mexem na posição e no giro da peça e, no fim, devolvem a peça ao descanso. Antes, cada
 * uma guardava a peça como estava no começo: um clique no meio da recusa guardava a peça já fora do lugar como se fosse
 * o descanso, e ela terminava fora do centro da casa. Agora o descanso fica na peça enquanto alguma animação de corpo
 * roda; a nova parte dele, e só a mais nova mexe na peça.
 */
function comecarAnimacaoDoCorpo(mesh: THREE.Object3D, ehGesto = false) {
  const descanso: Descanso = (mesh.userData.descanso as Descanso | undefined) ?? {
    x: mesh.position.x,
    y: mesh.position.y,
    z: mesh.position.z,
    rotX: mesh.rotation.x,
    rotY: mesh.rotation.y,
  }
  const minha = Symbol('corpo')
  mesh.userData.descanso = descanso
  mesh.userData.animacaoDoCorpo = minha
  mesh.userData.corpoEmGesto = ehGesto
  return {
    descanso,
    /** Outra animação de corpo (ou um lance) tomou a peça: esta para onde está. */
    valendo: () => mesh.userData.animacaoDoCorpo === minha,
    terminar: () => {
      if (mesh.userData.animacaoDoCorpo === minha) voltarAoDescanso(mesh)
    },
  }
}

/** Devolve a peça ao descanso e encerra as animações de corpo: no fim delas e antes de um lance, golpe ou queda. */
function voltarAoDescanso(mesh: THREE.Object3D) {
  const descanso = mesh.userData.descanso as Descanso | undefined
  if (descanso) {
    mesh.position.set(descanso.x, descanso.y, descanso.z)
    mesh.rotation.x = descanso.rotX
    mesh.rotation.y = descanso.rotY
  }
  mesh.userData.descanso = undefined
  mesh.userData.animacaoDoCorpo = undefined
  mesh.userData.corpoEmGesto = false
}

/** Pool de gestos possíveis nas interações entre peças aliadas — sorteado a cada interação, pra
 * não ser sempre o mesmo movimento. Mesmo sendo peças de formas geométricas simples, os gestos
 * imitam movimentos humanos de verdade. */
type TipoGesto = 'aceno' | 'braco_erguido' | 'inclinacao' | 'agachamento' | 'mortal'
const POOL_GESTOS: TipoGesto[] = ['aceno', 'braco_erguido', 'inclinacao', 'agachamento', 'mortal']

/**
 * Gesto amigável entre peças aliadas — vira na direção da outra (exceto no mortal, que já gira
 * sozinho) e faz um movimento de corpo inteiro: acenar, erguer o braço, se inclinar numa
 * reverência, se agachar, ou dar um mortal pra trás. Usado quando uma peça aliada é selecionada e
 * nas interações aleatórias entre peças do mesmo time que ficam paradas esperando a vez.
 */
function animarGestoAmigavel(
  mesh: THREE.Object3D,
  direcao: { x: number; z: number },
  tipo: TipoGesto = POOL_GESTOS[Math.floor(Math.random() * POOL_GESTOS.length)],
  atraso = 0,
) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const anguloAlvo = Math.atan2(direcao.x, direcao.z)
  const duracao = tipo === 'mortal' ? DURACAO_MORTAL_MS : DURACAO_GESTO_MS
  const inicio = performance.now() + atraso
  const ehRPG = Boolean(mesh.userData.acoesRPG)

  // peça RPG: o mortal é o clipe feito no Blender — agacha, toma impulso, gira grupada no ar e
  // aterrissa amortecendo; de vez em quando gira demais e cai sentada (tombo), fica tonta e levanta
  if (tipo === 'mortal' && ehRPG && clipesRPGComPrefixo(mesh, 'Mortal').length) {
    meshesEmGesto.add(mesh)
    const clipe = Math.random() < CHANCE_TOMBO_NO_MORTAL ? 'MortalTombo' : 'Mortal'
    window.setTimeout(() => {
      novaSequenciaRPG(mesh)
      mostrarEspadaRPG(mesh, false)
      const tocou = tocarClipeRPGUmaVez(mesh, clipe, { entrada: 0.15, saida: 0.3, aoTerminar: () => meshesEmGesto.delete(mesh) })
      if (!tocou) meshesEmGesto.delete(mesh)
    }, atraso)
    return
  }

  // peça RPG nos outros gestos: vira pra outra peça (abaixo) e faz um movimento de corpo de
  // verdade (um dos gestos dela), em vez de inclinar/afundar a peça inteira rígida
  if (ehRPG) {
    window.setTimeout(() => {
      // as guardas de samurai do peão são com a katana na mão — no gesto amigável ele não desembainha
      const gestos = clipesRPGComPrefixo(mesh, 'Gesto').filter((g) => g !== 'GestoKamae' && g !== 'GestoHasso')
      if (!gestos.length) return
      novaSequenciaRPG(mesh)
      mostrarEspadaRPG(mesh, false)
      tocarClipeRPGUmaVez(mesh, gestos[Math.floor(Math.random() * gestos.length)], { entrada: 0.4, saida: 0.5 })
    }, atraso)
  }

  let corpo: ReturnType<typeof comecarAnimacaoDoCorpo> | null = null
  function passo(agora: number) {
    if (agora < inicio) {
      requestAnimationFrame(passo)
      return
    }
    corpo ??= comecarAnimacaoDoCorpo(mesh, true)
    if (!corpo.valendo()) {
      // quem tomou a peça foi outro gesto: ele tira a peça da lista quando acabar
      if (!mesh.userData.corpoEmGesto) meshesEmGesto.delete(mesh)
      return
    }
    const { rotY: rotYOriginal, rotX: rotXOriginal, y: yOriginal } = corpo.descanso
    const t = Math.min(1, (agora - inicio) / duracao)
    const giro = t < 0.25 ? t / 0.25 : t > 0.8 ? (1 - t) / 0.2 : 1
    if (tipo !== 'mortal') {
      mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro
    }

    switch (tipo) {
      case 'aceno': {
        if (membros) membros.bracoEsq.rotation.z = Math.sin(Math.min(1, t / 0.8) * Math.PI * 3) * 0.45 * giro
        break
      }
      case 'braco_erguido': {
        if (membros) {
          const envelope = t < 0.4 ? Math.min(1, t / 0.3) : Math.max(0, (1 - t) / 0.4)
          membros.bracoEsq.rotation.x = base.bracoEsq - Math.PI * 0.75 * envelope
        }
        break
      }
      case 'inclinacao': {
        // uma reverência — o corpo inteiro curva pra frente e volta (a peça RPG faz o gesto pelo
        // esqueleto, ver acima)
        if (!ehRPG) mesh.rotation.x = rotXOriginal + Math.sin(t * Math.PI) * 0.5
        break
      }
      case 'agachamento': {
        const envelope = Math.sin(t * Math.PI)
        // a peça RPG não tem pernas soltas pra dobrar aqui — descer o corpo inteiro a afundaria no
        // tabuleiro, então ela só vira pra outra peça
        if (!ehRPG) mesh.position.y = yOriginal - envelope * 0.14
        if (membros) {
          membros.pernaEsq.rotation.x = base.pernaEsq + envelope * 0.6
          membros.pernaDir.rotation.x = base.pernaDir - envelope * 0.6
        }
        break
      }
      case 'mortal': {
        // gira o corpo inteiro pra trás em torno do eixo X, com um salto em arco
        mesh.rotation.x = rotXOriginal - t * Math.PI * 2
        mesh.position.y = yOriginal + Math.sin(t * Math.PI) * 0.45
        break
      }
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      corpo.terminar()
      if (membros) {
        membros.bracoEsq.rotation.z = 0
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.pernaEsq.rotation.x = base.pernaEsq
        membros.pernaDir.rotation.x = base.pernaDir
      }
      meshesEmGesto.delete(mesh)
    }
  }
  meshesEmGesto.add(mesh)
  requestAnimationFrame(passo)
}

/** Duração da recusa — rápida e seca (bem mais curta que o gesto amigável), pra ler como um "não,
 * não é sua vez" imediato e não deixar o tabuleiro travado esperando por ela. */
const DURACAO_RECUSA_MS = 900
/** Quanto a peça avança na direção da câmera durante a recusa, antes de voltar. */
const DISTANCIA_RECUSA = 0.16

/**
 * Reação de recusa: dispara quando o jogador clica numa peça do próprio time fora da sua vez (ou
 * com a máquina jogando). A peça vira de frente pra câmera — o "para quem está olhando" que o
 * jogador realmente vê, não uma direção fixa do tabuleiro —, dá um passo nessa direção, balança o
 * corpo de um lado pro outro como um "não" físico com os dois braços erguidos num gesto de "pera,
 * calma", e volta exatamente pra posição, rotação e pose que tinha antes.
 */
function animarRecusa(mesh: THREE.Object3D, direcaoCamera: { x: number; z: number }) {
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const corpo = comecarAnimacaoDoCorpo(mesh)
  const rotYOriginal = corpo.descanso.rotY
  const posOriginal = { x: corpo.descanso.x, z: corpo.descanso.z }
  const anguloAlvo = Math.atan2(direcaoCamera.x, direcaoCamera.z)
  const inicio = performance.now()

  function passo(agora: number) {
    if (!corpo.valendo()) return
    const t = Math.min(1, (agora - inicio) / DURACAO_RECUSA_MS)
    const giro = t < 0.18 ? t / 0.18 : t > 0.85 ? (1 - t) / 0.15 : 1
    // janela do balanço "não" — só depois que já virou de frente, e some antes da recuperação
    const janela = Math.min(1, Math.max(0, (t - 0.18) / 0.67))
    const balanco = Math.sin(janela * Math.PI * 4) * 0.2 * Math.sin(janela * Math.PI)
    mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro + balanco

    const avanco = Math.sin(t * Math.PI) * DISTANCIA_RECUSA
    mesh.position.x = posOriginal.x + direcaoCamera.x * avanco
    mesh.position.z = posOriginal.z + direcaoCamera.z * avanco

    if (membros) {
      const bracos = t < 0.22 ? t / 0.22 : t > 0.8 ? (1 - t) / 0.2 : 1
      membros.bracoEsq.rotation.x = base.bracoEsq - Math.PI * 0.32 * bracos
      membros.bracoDir.rotation.x = base.bracoDir - Math.PI * 0.32 * bracos
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      corpo.terminar()
      if (membros) {
        membros.bracoEsq.rotation.x = base.bracoEsq
        membros.bracoDir.rotation.x = base.bracoDir
      }
    }
  }
  requestAnimationFrame(passo)
}

/** Duração do golpe de espada do peão ao capturar — preparação, corte e recuperação. */
const DURACAO_ATAQUE_MS = 520
/** Fração da duração em que o golpe atinge o alvo — é aí que o efeito de impacto dispara. */
const INSTANTE_IMPACTO = 0.55
/** Quanto a peça avança fisicamente na direção do alvo durante o golpe (lunge), voltando depois. */
const DISTANCIA_LUNGE = 0.14

/**
 * Curva do balanço do braço em 3 tempos — bem mais dramática que um simples vaivém: puxa o braço
 * pra trás (preparação), dispara num arco bem mais amplo que a guarda normal (corte) e só depois
 * assenta de volta na pose de guarda (recuperação). Valor 0 = pose de guarda; positivo = à frente.
 */
function curvaDoGolpe(t: number): number {
  if (t < 0.25) {
    const k = t / 0.25
    return -0.55 * k * k
  }
  if (t < INSTANTE_IMPACTO) {
    const k = (t - 0.25) / (INSTANTE_IMPACTO - 0.25)
    return -0.55 + 2.75 * (1 - Math.pow(1 - k, 3))
  }
  const k = (t - INSTANTE_IMPACTO) / (1 - INSTANTE_IMPACTO)
  return 2.2 * (1 - k * k)
}

/** Estilo do golpe do peão ao capturar — sorteado a cada captura, pra não repetir sempre a mesma animação. */
type EstiloAtaque = 'corte' | 'derrubada'

/**
 * Ataque de espada do peão ao capturar: vira de frente pro alvo, avança um passo (lunge) e desfere
 * um golpe bem mais amplo — preparação, corte e recuperação — antes de assentar de volta na guarda.
 * Dois estilos possíveis: "corte" é um golpe vertical de cima pra baixo; "derrubada" é uma
 * bordoada bem mais larga e horizontal, de baixo pra cima, feita pra jogar a peça atingida longe
 * (ver `direcaoNocauteDoEstilo`). `aoImpacto` dispara no instante exato em que o golpe atinge o
 * alvo (pro efeito de impacto e a queda da peça atingida ficarem sincronizados com a espada, não
 * só depois de tudo terminar).
 */
function animarAtaqueEspada(
  mesh: THREE.Object3D,
  direcao: { x: number; z: number },
  estilo: EstiloAtaque,
  aoImpacto: () => void,
  aoTerminar: () => void,
) {
  voltarAoDescanso(mesh)
  const membros = mesh.userData.membros as MembrosPersonagem | undefined
  const base = (mesh.userData.poseBase as PoseBaseMembros | undefined) ?? POSE_BASE_NEUTRA
  const rotYOriginal = mesh.rotation.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const anguloAlvo = Math.atan2(direcao.x, direcao.z)
  const inicio = performance.now()
  let impactoDisparado = false

  // peão geométrico: a espada só existe presa no pivô do braço durante o golpe (o resto do tempo
  // só o cabo aparece na bainha) e é guardada de volta ao fim do ataque. As peças RPG não passam
  // por aqui pra espada: o peão RPG tem a espada no próprio modelo (sacada antes do golpe, ver
  // sacarEspadaRPG) e as outras peças não usam espada.
  const espadaDesembainhada = membros ? criarEspadaDoPeao() : undefined
  if (membros && espadaDesembainhada) {
    espadaDesembainhada.position.y = -CONFIG_BRACO_DIR.comprimento
    espadaDesembainhada.rotation.z = Math.PI * 0.15
    espadaDesembainhada.scale.setScalar(1.5)
    membros.bracoDir.add(espadaDesembainhada)
  }

  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_ATAQUE_MS)
    // vira de frente rápido, segura o giro durante o golpe e desfaz na recuperação
    const giro = t < 0.2 ? t / 0.2 : t > 0.85 ? (1 - t) / 0.15 : 1
    mesh.rotation.y = rotYOriginal + (anguloAlvo - rotYOriginal) * giro

    // avança um passo físico na direção do golpe (lunge) e volta, acompanhando o corte
    const avanco = Math.max(0, Math.sin(Math.min(1, t / INSTANTE_IMPACTO) * Math.PI)) * DISTANCIA_LUNGE
    mesh.position.x = posOriginal.x + direcao.x * avanco
    mesh.position.z = posOriginal.z + direcao.z * avanco

    if (membros) {
      const golpe = curvaDoGolpe(t)
      if (estilo === 'derrubada') {
        // bordoada larga e horizontal — o braço varre de lado em vez de cortar de cima pra baixo
        membros.bracoDir.rotation.z = golpe * -1.3
        membros.bracoDir.rotation.x = base.bracoDir + golpe * 0.3
      } else {
        membros.bracoDir.rotation.x = base.bracoDir + golpe
        membros.bracoDir.rotation.z = golpe * -0.35
      }
    }

    if (!impactoDisparado && t >= INSTANTE_IMPACTO) {
      impactoDisparado = true
      aoImpacto()
    }

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      mesh.rotation.y = rotYOriginal
      mesh.position.x = posOriginal.x
      mesh.position.z = posOriginal.z
      if (membros) {
        membros.bracoDir.rotation.x = base.bracoDir
        membros.bracoDir.rotation.z = 0
        if (espadaDesembainhada) membros.bracoDir.remove(espadaDesembainhada)
      }
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

/** Duração da queda (tomba) e do afundamento+desaparecimento da peça capturada, depois do golpe. */
const DURACAO_QUEDA_MS = 500
const DURACAO_SUMIR_MS = 650
/** Quanto a peça derrubada desliza na direção do golpe (em casas). */
const DESLIZE_NOCAUTE = 0.45

/**
 * A peça capturada tomba pro chão e depois afunda no tabuleiro sumindo aos poucos — clona os
 * materiais antes (são compartilhados entre todas as peças da mesma facção/tipo) pra desvanecer só
 * essa peça sem afetar as outras que ainda estão em jogo. Quando `direcaoNocaute` é passado (golpe
 * de "derrubada"), a peça também desliza nessa direção enquanto cai, como se tivesse sido jogada
 * longe pelo golpe, em vez de só tombar no lugar.
 */
function animarQuedaEDesaparecimento(
  mesh: THREE.Object3D,
  aoTerminar: () => void,
  direcaoNocaute?: { x: number; z: number },
  direcaoGolpe?: { x: number; z: number },
) {
  // a vítima podia estar no meio da recusa (quem joga clicou nela na vez da máquina)
  voltarAoDescanso(mesh)
  const definirOpacidade = prepararParaSumir(mesh)

  const yInicial = mesh.position.y
  const posOriginal = { x: mesh.position.x, z: mesh.position.z }
  const eixoQueda: 'x' | 'z' = Math.random() < 0.5 ? 'x' : 'z'
  const sinalQueda = Math.random() < 0.5 ? 1 : -1
  const duracaoTotal = DURACAO_QUEDA_MS + DURACAO_SUMIR_MS
  const inicio = performance.now()

  // peça RPG: vira de frente pra quem golpeou (num instante — o golpe já acertou) e cai de verdade
  // com o clipe "Morte" (cai de costas, pra longe do atacante); só depois de estirada no chão é que
  // afunda e some aos poucos
  const morte = (mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined)?.Morte
  if (morte) {
    novaSequenciaRPG(mesh)
    mostrarEspadaRPG(mesh, false)
    const rumoInicial = mesh.rotation.y
    const giro = direcaoGolpe ? diferencaAngular(rumoInicial, Math.atan2(-direcaoGolpe.x, -direcaoGolpe.z)) : 0
    tocarClipeRPGUmaVez(mesh, 'Morte', { entrada: 0.12, voltarAoParado: false })
    const duracaoClipeMs = morte.getClip().duration * 1000
    const comecaASumir = duracaoClipeMs * 0.85
    const yBase = mesh.position.y
    const inicioMorte = performance.now()
    function passoMorte(agora: number) {
      const decorrido = agora - inicioMorte
      const tGiro = Math.min(1, decorrido / 140)
      mesh.rotation.y = rumoInicial + giro * tGiro * (2 - tGiro)
      if (decorrido > comecaASumir) {
        const tSumir = Math.min(1, (decorrido - comecaASumir) / DURACAO_SUMIR_MS)
        mesh.position.y = yBase - tSumir * 0.15
        definirOpacidade(1 - tSumir)
        if (tSumir >= 1) {
          aoTerminar()
          return
        }
      }
      requestAnimationFrame(passoMorte)
    }
    requestAnimationFrame(passoMorte)
    return
  }

  // derrubada: tomba PRA LONGE do golpe (gira em torno do eixo deitado perpendicular à direção — o topo
  // vai pra onde o golpe empurrou) e desliza nessa direção enquanto cai
  const comprimento = direcaoNocaute ? Math.hypot(direcaoNocaute.x, direcaoNocaute.z) : 0
  const nocaute = direcaoNocaute && comprimento > 1e-6 ? { x: direcaoNocaute.x / comprimento, z: direcaoNocaute.z / comprimento } : undefined
  const eixoNocaute = nocaute ? new THREE.Vector3(nocaute.z, 0, -nocaute.x) : undefined
  const rotacaoInicial = mesh.quaternion.clone()
  const giroNocaute = new THREE.Quaternion()

  function passo(agora: number) {
    const decorrido = agora - inicio
    const tQueda = Math.min(1, decorrido / DURACAO_QUEDA_MS)
    const quedaSuave = 1 - Math.pow(1 - tQueda, 3)
    if (nocaute && eixoNocaute) {
      giroNocaute.setFromAxisAngle(eixoNocaute, quedaSuave * (Math.PI / 2))
      mesh.quaternion.copy(giroNocaute).multiply(rotacaoInicial)
      mesh.position.x = posOriginal.x + nocaute.x * DESLIZE_NOCAUTE * quedaSuave
      mesh.position.z = posOriginal.z + nocaute.z * DESLIZE_NOCAUTE * quedaSuave
    } else {
      mesh.rotation[eixoQueda] = quedaSuave * (Math.PI / 2) * sinalQueda
    }

    if (decorrido > DURACAO_QUEDA_MS) {
      const tSumir = Math.min(1, (decorrido - DURACAO_QUEDA_MS) / DURACAO_SUMIR_MS)
      mesh.position.y = yInicial - tSumir * 0.35
      definirOpacidade(1 - tSumir)
    }

    if (decorrido < duracaoTotal) {
      requestAnimationFrame(passo)
    } else {
      aoTerminar()
    }
  }
  requestAnimationFrame(passo)
}

// ---------------------------------------------------------------------------
// Efeito especial de acerto — um anel de luz se espalhando pelo chão mais um
// estilhaço de raios, no ponto exato do golpe. Some rápido, é só pra dar peso
// visual ao instante do impacto, antes da peça atingida cair. Material próprio
// (não-toon, sempre "aceso") clonado por instância pra cada cópia poder sumir
// (opacity) de forma independente sem afetar outros efeitos ainda em andamento.
// ---------------------------------------------------------------------------
const materialImpactoBase = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, depthWrite: false })
const geoAnelImpacto = new THREE.RingGeometry(0.05, 0.12, 32)
const geoRaioImpacto = new THREE.BoxGeometry(0.03, 0.02, 0.24)
const RAIOS_IMPACTO = 6
const DURACAO_IMPACTO_MS = 380

function criarEfeitoImpacto(): THREE.Group {
  const grupo = new THREE.Group()

  const anel = new THREE.Mesh(geoAnelImpacto, materialImpactoBase.clone())
  anel.rotation.x = -Math.PI / 2
  grupo.add(anel)

  for (let i = 0; i < RAIOS_IMPACTO; i++) {
    const raio = new THREE.Mesh(geoRaioImpacto, materialImpactoBase.clone())
    raio.position.y = 0.012
    raio.rotation.y = (i / RAIOS_IMPACTO) * Math.PI * 2
    raio.translateZ(0.14) // empurra pra fora ao longo do próprio eixo já girado — fica radial
    grupo.add(raio)
  }
  return grupo
}

/** Dispara o estouro de luz no ponto (x,z) do golpe — remove a si mesmo da cena ao terminar. */
function animarImpacto(scene: THREE.Object3D, x: number, z: number) {
  const efeito = criarEfeitoImpacto()
  efeito.position.set(x, 0.035, z)
  efeito.scale.setScalar(0.35)
  scene.add(efeito)

  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / DURACAO_IMPACTO_MS)
    const escala = 0.35 + t * 1.5
    efeito.scale.set(escala, 1, escala)
    const opacidade = 1 - t
    efeito.traverse((obj) => {
      if (obj instanceof THREE.Mesh) (obj.material as THREE.MeshBasicMaterial).opacity = opacidade
    })

    if (t < 1) {
      requestAnimationFrame(passo)
    } else {
      scene.remove(efeito)
      efeito.traverse((obj) => {
        if (obj instanceof THREE.Mesh) (obj.material as THREE.Material).dispose()
      })
    }
  }
  requestAnimationFrame(passo)
}

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
const texturaBrilho = criarTexturaBrilho()
const geoNucleoPoder = new THREE.SphereGeometry(0.05, 20, 14)
const geoOndaPoder = new THREE.RingGeometry(0.08, 0.13, 48)
const geoCascaPoder = new THREE.SphereGeometry(0.1, 24, 16)

function spriteDeBrilho(cor: THREE.ColorRepresentation, tamanho: number, opacidade = 1): THREE.Sprite {
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
interface Particula {
  objeto: THREE.Sprite
  nasceu: number
  vida: number
  velocidade?: THREE.Vector3
  tamanho: number
}

function animarParticulas(cena: THREE.Object3D, particulas: Particula[]) {
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
function explodirPoder(cena: THREE.Object3D, ponto: THREE.Vector3, cor: THREE.ColorRepresentation) {
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
function lancarPoderDoBispo(cena: THREE.Object3D, bispo: THREE.Object3D, alvo: THREE.Vector3, cor: THREE.ColorRepresentation, aoAcertar: () => void) {
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
// Marreta da torre — na captura a torre vai até a vítima, a marreta surge nas mãos dela, sobe acima
// da cabeça e desce com tudo: o tabuleiro treme, a madeira racha, sobe poeira e a vítima fica
// achatada. O corpo não segue um clipe do modelo: a cada quadro, por cima do "Parado", a pose da
// marreta é calculada e os braços são levados até o cabo, pras duas mãos ficarem nele o tempo todo.
// ---------------------------------------------------------------------------
const COMPRIMENTO_CABO_MARRETA = 0.72
/** Onde cada mão segura, a partir da ponta do cabo. */
const PEGADA_MAO_ESQUERDA = 0.03
const PEGADA_MAO_DIREITA = 0.12

const geoCaboMarreta = new THREE.CylinderGeometry(0.017, 0.022, COMPRIMENTO_CABO_MARRETA + 0.05, 16)
const geoPegadaMarreta = new THREE.CylinderGeometry(0.026, 0.026, 0.22, 16)
const geoPonteiraMarreta = new THREE.SphereGeometry(0.034, 16, 12)
const geoCabecaMarreta = new RoundedBoxGeometry(0.25, 0.25, 0.36, 3, 0.03)
const geoCintaMarreta = new RoundedBoxGeometry(0.265, 0.265, 0.04, 2, 0.012)
const geoFaceMarreta = new RoundedBoxGeometry(0.27, 0.27, 0.05, 2, 0.015)
const geoAmeiaMarreta = new RoundedBoxGeometry(0.075, 0.075, 0.06, 2, 0.012)
const geoGemaMarreta = new THREE.SphereGeometry(0.036, 16, 12)

/** A marreta é da peça: os mesmos materiais do corpo (armadura), dos detalhes, do dourado da coroa e
 * do brilho, e as ameias da torre nas duas faces. Montada com a ponta do cabo na origem, o cabo pra
 * cima (+Y) e as faces da cabeça em Z: girando em X, ela desce batendo com a face. */
const ARMAS_DA_TORRE = ['marreta', 'machado', 'maca']

/** A lâmina do machado em meia-lua, no plano do golpe (Y pra cima, Z pra frente): a curva de fora é o fio, a de
 * dentro abraça o cabo. `espessura` em X. */
function laminaMeiaLua(espessura: number, raioFora: number, raioDentro: number): THREE.BufferGeometry {
  const forma = new THREE.Shape()
  const abertura = THREE.MathUtils.degToRad(68)
  // a curva de fora, centrada um pouco atrás do cabo, e a de dentro voltando, mais perto
  forma.absarc(0.04, 0, raioFora, -abertura, abertura, false)
  forma.absarc(-0.02, 0, raioDentro, abertura * 0.95, -abertura * 0.95, true)
  forma.closePath()
  const geo = new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 24 })
  // a forma foi desenhada com X pra frente: vira pra Z, e a espessura fica em X, centrada no cabo
  geo.rotateY(-Math.PI / 2)
  geo.translate(espessura / 2, 0, 0)
  return geo
}

/** O fio dourado acompanhando a curva da lâmina. */
function filoMeiaLua(): THREE.BufferGeometry {
  const abertura = THREE.MathUtils.degToRad(68)
  const geo = new THREE.TorusGeometry(0.2, 0.009, 6, 32, abertura * 2)
  geo.rotateZ(-abertura)
  geo.translate(0.04, 0, 0)
  // no mesmo plano da lâmina: X da forma vira Z
  geo.rotateY(-Math.PI / 2)
  return geo
}

function criarMarreta(cor: 'w' | 'b', arma = 'marreta'): THREE.Group {
  const { armadura, detalhe, brilho } = materiaisPorFaccao[cor]
  const marreta = new THREE.Group()
  const topo = COMPRIMENTO_CABO_MARRETA
  const pecas: [THREE.BufferGeometry, THREE.Material, number, number, number][] = [
    [geoCaboMarreta, detalhe, 0, topo / 2, 0],
    [geoPegadaMarreta, armadura, 0, 0.1, 0],
    [geoPonteiraMarreta, materialCoroa, 0, -0.01, 0],
  ]
  if (arma === 'machado') {
    // a lâmina em meia-lua bate pra frente, onde a marreta bate com a face, com o fio dourado na curva; atrás, uma ponta
    pecas.push(
      [new RoundedBoxGeometry(0.12, 0.15, 0.13, 2, 0.02), armadura, 0, topo, 0],
      [laminaMeiaLua(0.03, 0.2, 0.15), materialLaminaEspada, 0, topo, 0],
      [filoMeiaLua(), materialCoroa, 0, topo, 0],
      [geoGemaMarreta, brilho, 0.065, topo, 0],
      [geoGemaMarreta, brilho, -0.065, topo, 0],
    )
  } else if (arma === 'maca') {
    pecas.push([new THREE.SphereGeometry(0.15, 16, 12), armadura, 0, topo, 0], [new THREE.CylinderGeometry(0.155, 0.155, 0.03, 16), materialCoroa, 0, topo, 0])
  } else {
    pecas.push(
      [geoCabecaMarreta, armadura, 0, topo, 0],
      [geoCintaMarreta, materialCoroa, 0, topo, 0],
      [geoFaceMarreta, detalhe, 0, topo, 0.175],
      [geoFaceMarreta, detalhe, 0, topo, -0.175],
      [geoGemaMarreta, brilho, 0.13, topo, 0],
      [geoGemaMarreta, brilho, -0.13, topo, 0],
    )
    // as ameias, nos quatro cantos de cada face
    for (const face of [1, -1]) {
      for (const x of [-0.095, 0.095]) {
        for (const y of [-0.095, 0.095]) pecas.push([geoAmeiaMarreta, detalhe, x, topo + y, face * 0.225])
      }
    }
  }
  for (const [geometria, material, x, y, z] of pecas) {
    const parte = new THREE.Mesh(geometria, material)
    parte.position.set(x, y, z)
    parte.castShadow = true
    marreta.add(parte)
  }
  // pontas que saem da cabeça, cada uma apontando pra fora
  const pontas: [THREE.Vector3, number, THREE.Material][] =
    arma === 'machado'
      ? [[new THREE.Vector3(0, 0, -1), 0.065, detalhe]]
      : arma === 'maca'
        ? [
            [new THREE.Vector3(1, 0, 0), 0.15, detalhe],
            [new THREE.Vector3(-1, 0, 0), 0.15, detalhe],
            [new THREE.Vector3(0, 0, 1), 0.15, detalhe],
            [new THREE.Vector3(0, 0, -1), 0.15, detalhe],
            [new THREE.Vector3(0, 1, 0), 0.15, detalhe],
            [new THREE.Vector3(1, 0.8, 1).normalize(), 0.15, brilho],
            [new THREE.Vector3(-1, 0.8, -1).normalize(), 0.15, brilho],
            [new THREE.Vector3(1, -0.8, -1).normalize(), 0.15, brilho],
            [new THREE.Vector3(-1, -0.8, 1).normalize(), 0.15, brilho],
          ]
        : []
  for (const [direcao, raio, material] of pontas) {
    const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 8), material)
    ponta.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direcao)
    ponta.position.set(0, topo, 0).addScaledVector(direcao, raio + 0.04)
    ponta.castShadow = true
    marreta.add(ponta)
  }
  return marreta
}

/** A marreta vista de lado: `angulo` é o giro do cabo a partir da vertical (positivo pra frente);
 * `y`/`z`, a ponta do cabo; `tronco`, quanto o corpo inclina (positivo pra frente). */
interface PoseMarreta {
  angulo: number
  y: number
  z: number
  tronco: number
}
const POSE_MARRETA_GUARDA: PoseMarreta = { angulo: 0.45, y: 0.43, z: 0.16, tronco: 0 }
const POSE_MARRETA_ERGUIDA: PoseMarreta = { angulo: -0.75, y: 0.52, z: 0.04, tronco: -0.24 }
const POSE_MARRETA_PANCADA: PoseMarreta = { angulo: 2.06, y: 0.47, z: 0.14, tronco: 0.55 }

const MARRETA_SURGIU_MS = 240
const MARRETA_ERGUIDA_MS = 640
const MARRETA_NO_ALTO_ATE_MS = 780
const MARRETA_PANCADA_MS = 920
const MARRETA_CRAVADA_ATE_MS = 1350
const MARRETA_FIM_MS = 1700

/** A maça: depois da pancada, sobe com a peça presa nos espinhos, sacode e a peça cai. */
const POSE_MACA_SACODE: PoseMarreta = { angulo: 0.95, y: 0.5, z: 0.2, tronco: 0.12 }
const MACA_ERGUIDA_ATE_MS = 1900
const MACA_SOLTA_MS = 2420
const MACA_SACODE_ATE_MS = 2650
const MACA_FIM_MS = 3050

function misturarPoses(a: PoseMarreta, b: PoseMarreta, t: number): PoseMarreta {
  const m = (x: number, y: number) => x + (y - x) * t
  return { angulo: m(a.angulo, b.angulo), y: m(a.y, b.y), z: m(a.z, b.z), tronco: m(a.tronco, b.tronco) }
}
const suaveMarreta = (t: number) => t * t * (3 - 2 * t)

/** Em que ponto do golpe a marreta está: `peso` é quanto os braços seguem o cabo (0 = o clipe
 * normal da peça) e `escala`, o tamanho da marreta, que surge e some nas mãos. */
function poseDaMarreta(decorrido: number): { pose: PoseMarreta; peso: number; escala: number } {
  if (decorrido < MARRETA_SURGIU_MS) {
    const t = suaveMarreta(decorrido / MARRETA_SURGIU_MS)
    return { pose: POSE_MARRETA_GUARDA, peso: t, escala: t }
  }
  if (decorrido < MARRETA_ERGUIDA_MS) {
    const t = suaveMarreta((decorrido - MARRETA_SURGIU_MS) / (MARRETA_ERGUIDA_MS - MARRETA_SURGIU_MS))
    return { pose: misturarPoses(POSE_MARRETA_GUARDA, POSE_MARRETA_ERGUIDA, t), peso: 1, escala: 1 }
  }
  if (decorrido < MARRETA_NO_ALTO_ATE_MS) {
    // no alto, um tremor do peso, antes de descer
    const tremor = 0.02 * Math.sin(decorrido / 18)
    return { pose: { ...POSE_MARRETA_ERGUIDA, angulo: POSE_MARRETA_ERGUIDA.angulo + tremor }, peso: 1, escala: 1 }
  }
  if (decorrido < MARRETA_PANCADA_MS) {
    const t = (decorrido - MARRETA_NO_ALTO_ATE_MS) / (MARRETA_PANCADA_MS - MARRETA_NO_ALTO_ATE_MS)
    return { pose: misturarPoses(POSE_MARRETA_ERGUIDA, POSE_MARRETA_PANCADA, t * t * t), peso: 1, escala: 1 }
  }
  if (decorrido < MARRETA_CRAVADA_ATE_MS) {
    // pulo da cabeça da marreta logo depois de bater
    const t = (decorrido - MARRETA_PANCADA_MS) / (MARRETA_CRAVADA_ATE_MS - MARRETA_PANCADA_MS)
    const quique = 0.09 * Math.sin(Math.min(1, t * 2.5) * Math.PI)
    return { pose: { ...POSE_MARRETA_PANCADA, angulo: POSE_MARRETA_PANCADA.angulo - quique }, peso: 1, escala: 1 }
  }
  const t = suaveMarreta(Math.min(1, (decorrido - MARRETA_CRAVADA_ATE_MS) / (MARRETA_FIM_MS - MARRETA_CRAVADA_ATE_MS)))
  return { pose: misturarPoses(POSE_MARRETA_PANCADA, POSE_MARRETA_GUARDA, t), peso: 1 - t, escala: 1 - suaveMarreta(Math.max(0, t * 2 - 1)) }
}

function poseDaMaca(decorrido: number): { pose: PoseMarreta; peso: number; escala: number } {
  if (decorrido < MARRETA_CRAVADA_ATE_MS) return poseDaMarreta(decorrido)
  if (decorrido < MACA_ERGUIDA_ATE_MS) {
    const t = suaveMarreta((decorrido - MARRETA_CRAVADA_ATE_MS) / (MACA_ERGUIDA_ATE_MS - MARRETA_CRAVADA_ATE_MS))
    return { pose: misturarPoses(POSE_MARRETA_PANCADA, POSE_MACA_SACODE, t), peso: 1, escala: 1 }
  }
  if (decorrido < MACA_SACODE_ATE_MS) {
    // chacoalha pra frente e pra trás, cada vez mais forte, até a peça soltar
    const t = (decorrido - MACA_ERGUIDA_ATE_MS) / (MACA_SACODE_ATE_MS - MACA_ERGUIDA_ATE_MS)
    const sacode = Math.sin(t * Math.PI * 2 * 4) * (0.22 + 0.2 * t)
    return { pose: { ...POSE_MACA_SACODE, angulo: POSE_MACA_SACODE.angulo + sacode, tronco: POSE_MACA_SACODE.tronco + sacode * 0.2 }, peso: 1, escala: 1 }
  }
  const t = suaveMarreta(Math.min(1, (decorrido - MACA_SACODE_ATE_MS) / (MACA_FIM_MS - MACA_SACODE_ATE_MS)))
  return { pose: misturarPoses(POSE_MACA_SACODE, POSE_MARRETA_GUARDA, t), peso: 1 - t, escala: 1 - suaveMarreta(Math.max(0, t * 2 - 1)) }
}

function ossoRPG(mesh: THREE.Object3D, nome: string): THREE.Object3D | undefined {
  return mesh.getObjectByName(`mixamorig${nome}`) ?? mesh.getObjectByName(`mixamorig:${nome}`)
}

/** Gira um osso por um giro dado no mundo, levando junto o que vem depois dele. */
function girarOssoNoMundo(osso: THREE.Object3D, giro: THREE.Quaternion) {
  const pai = (osso.parent as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion())
  osso.quaternion.premultiply(pai.clone().invert().multiply(giro).multiply(pai))
  osso.updateWorldMatrix(false, true)
}

/** Vira o osso pro filho dele apontar pro alvo; com `peso` menor, vai só uma parte do caminho. */
function apontarOsso(osso: THREE.Object3D, filho: THREE.Object3D, alvo: THREE.Vector3, peso: number) {
  const base = osso.getWorldPosition(new THREE.Vector3())
  const atual = filho.getWorldPosition(new THREE.Vector3()).sub(base).normalize()
  const giro = new THREE.Quaternion().setFromUnitVectors(atual, alvo.clone().sub(base).normalize())
  girarOssoNoMundo(osso, new THREE.Quaternion().slerp(giro, peso))
}

/** Leva a mão até `alvo` dobrando o cotovelo pra fora e pra baixo, como um braço de verdade. */
function levarBracoAte(torre: THREE.Object3D, lado: 'Left' | 'Right', alvo: THREE.Vector3, peso: number) {
  const ombro = ossoRPG(torre, `${lado}Arm`)
  const cotovelo = ossoRPG(torre, `${lado}ForeArm`)
  const mao = ossoRPG(torre, `${lado}Hand`)
  if (!ombro || !cotovelo || !mao) return
  const noOmbro = ombro.getWorldPosition(new THREE.Vector3())
  const noCotovelo = cotovelo.getWorldPosition(new THREE.Vector3())
  const braco = noOmbro.distanceTo(noCotovelo)
  const antebraco = noCotovelo.distanceTo(mao.getWorldPosition(new THREE.Vector3()))
  const rumo = alvo.clone().sub(noOmbro)
  const distancia = Math.min(rumo.length(), (braco + antebraco) * 0.995)
  rumo.normalize()
  const aoLongo = (braco * braco - antebraco * antebraco + distancia * distancia) / (2 * distancia)
  const pontaDoCotovelo = Math.sqrt(Math.max(0, braco * braco - aoLongo * aoLongo))
  const dobra = new THREE.Vector3(lado === 'Right' ? -1 : 1, -0.8, -0.4).transformDirection(torre.matrixWorld)
  dobra.addScaledVector(rumo, -dobra.dot(rumo)).normalize()
  const destinoCotovelo = noOmbro.clone().addScaledVector(rumo, aoLongo).addScaledVector(dobra, pontaDoCotovelo)
  apontarOsso(ombro, cotovelo, destinoCotovelo, peso)
  apontarOsso(cotovelo, mao, noOmbro.clone().addScaledVector(rumo, distancia), peso)
}

/** O corpo por cima do clipe da peça: inclina o tronco e põe as duas mãos no cabo. */
function posarComMarreta(torre: THREE.Object3D, pose: PoseMarreta, peso: number) {
  torre.updateWorldMatrix(true, true)
  const eixo = new THREE.Vector3(1, 0, 0).transformDirection(torre.matrixWorld)
  const inclinacao = new THREE.Quaternion().setFromAxisAngle(eixo, (pose.tronco * peso) / 2)
  for (const nome of ['Spine', 'Spine1']) {
    const osso = ossoRPG(torre, nome)
    if (osso) girarOssoNoMundo(osso, inclinacao)
  }
  const pegada = (s: number) =>
    torre.localToWorld(new THREE.Vector3(0, pose.y + s * Math.cos(pose.angulo), pose.z + s * Math.sin(pose.angulo)))
  levarBracoAte(torre, 'Left', pegada(PEGADA_MAO_ESQUERDA), peso)
  levarBracoAte(torre, 'Right', pegada(PEGADA_MAO_DIREITA), peso)
}

/** Os ossos que o golpe mexe, com a posição de antes dele. O mixer só regrava um osso quando o valor
 * do clipe muda: sem voltar pra essa posição a cada quadro, o giro de um quadro somava no do seguinte
 * e o tronco ia dobrando até o chão. */
const OSSOS_DO_GOLPE = ['Spine', 'Spine1', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']
type OssoSalvo = [THREE.Object3D, THREE.Quaternion]

function salvarOssosDoGolpe(torre: THREE.Object3D): OssoSalvo[] {
  return OSSOS_DO_GOLPE.flatMap((nome): OssoSalvo[] => {
    const osso = ossoRPG(torre, nome)
    return osso ? [[osso, osso.quaternion.clone()]] : []
  })
}

function restaurarOssos(ossos: OssoSalvo[]) {
  for (const [osso, posicao] of ossos) osso.quaternion.copy(posicao)
}

interface Marretada {
  torre: THREE.Object3D
  marreta: THREE.Group
  ossos: OssoSalvo[]
  inicio: number
  acertou: boolean
  continua: () => boolean
  aoAcertar: () => void
  /** Só a maça: quando a peça presa nos espinhos solta. */
  aoSoltar?: () => void
  soltou: boolean
}
const marretadas = new Set<Marretada>()

function encerrarMarretada(m: Marretada) {
  restaurarOssos(m.ossos)
  m.torre.remove(m.marreta)
  marretadas.delete(m)
}

/** Roda a cada quadro, depois dos clipes: a pose precisa ser a última a mexer nos ossos. */
function atualizarMarretadas(agora: number) {
  for (const m of marretadas) {
    if (!m.continua() || !m.torre.parent) {
      encerrarMarretada(m)
      continue
    }
    const decorrido = agora - m.inicio
    const ehMaca = m.torre.userData.arma === 'maca'
    const { pose, peso, escala } = ehMaca ? poseDaMaca(decorrido) : poseDaMarreta(decorrido)
    m.marreta.position.set(0, pose.y, pose.z)
    m.marreta.rotation.x = pose.angulo
    m.marreta.scale.setScalar(Math.max(0.001, escala))
    restaurarOssos(m.ossos)
    posarComMarreta(m.torre, pose, peso)
    if (!m.acertou && decorrido >= MARRETA_PANCADA_MS) {
      m.acertou = true
      m.aoAcertar()
    }
    if (m.aoSoltar && !m.soltou && decorrido >= MACA_SOLTA_MS) {
      m.soltou = true
      m.aoSoltar()
    }
    if (decorrido >= (ehMaca ? MACA_FIM_MS : MARRETA_FIM_MS)) encerrarMarretada(m)
  }
}

/** Começa o golpe; `aoAcertar` roda no instante em que a marreta bate no chão. `continua` falso
 * (outro jogo entrou no meio) tira a marreta da mão sem acertar. */
function baterComMarreta(torre: THREE.Object3D, cor: 'w' | 'b', continua: () => boolean, aoAcertar: () => void, aoSoltar?: () => void): THREE.Group {
  const marreta = criarMarreta(cor, torre.userData.arma as string | undefined)
  marreta.scale.setScalar(0.001)
  torre.add(marreta)
  marretadas.add({ torre, marreta, ossos: salvarOssosDoGolpe(torre), inicio: performance.now(), acertou: false, continua, aoAcertar, aoSoltar, soltou: false })
  return marreta
}

/** A peça que soltou dos espinhos cai no tabuleiro, rolando, e some. */
function cairDaMaca(cena: THREE.Object3D, peca: THREE.Object3D, aoTerminar: () => void) {
  cena.attach(peca)
  const definirOpacidade = prepararParaSumir(peca)
  const velocidade = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6)
  const giro = new THREE.Vector3(Math.random() * 4 - 2, 0, Math.random() * 4 - 2)
  const chao = 0.05
  let anterior = performance.now()
  let noChaoDesde = 0
  function passo(agora: number) {
    const dt = Math.min(0.05, (agora - anterior) / 1000)
    anterior = agora
    if (!noChaoDesde) {
      velocidade.y -= 6 * dt
      peca.position.addScaledVector(velocidade, dt)
      peca.rotation.x += giro.x * dt
      peca.rotation.z += giro.z * dt
      if (peca.position.y <= chao) {
        peca.position.y = chao
        noChaoDesde = agora
        tocarSom(`queda:${peca.userData.tipo as string}`)
      }
    } else {
      const t = (agora - noChaoDesde) / 600
      definirOpacidade(Math.max(0, 1 - t))
      if (t >= 1) {
        aoTerminar()
        return
      }
    }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

/** A peça sozinha, vestida, pra vitrine da Personalização: o peão com a espada na mão, a torre com a arma na pose
 * de guarda do golpe. Null enquanto os modelos não chegaram. */
function montarVitrine(tipo: string, escolhas: Record<string, string>): VitrineDaPeca | null {
  const modelo = modelosRPG[tipo]
  if (!modelo) return null
  const grupo = buildPecaRPG(modelo, 'w')
  vestirPeca(grupo, tipo, escolhas, materiaisDaPeca('w'))
  mostrarEspadaRPG(grupo, true)
  const mixer = grupo.userData.mixer as THREE.AnimationMixer
  if (tipo !== 'r' || !ARMAS_DA_TORRE.includes(grupo.userData.arma as string)) return { grupo, atualizar: (delta) => mixer.update(delta) }
  const marreta = criarMarreta('w', grupo.userData.arma as string | undefined)
  marreta.position.set(0, POSE_MARRETA_GUARDA.y, POSE_MARRETA_GUARDA.z)
  marreta.rotation.x = POSE_MARRETA_GUARDA.angulo
  grupo.add(marreta)
  let ossos: OssoSalvo[] = []
  return {
    grupo,
    atualizar(delta) {
      // o clipe só regrava o osso que muda: a pose com a arma é desfeita antes do clipe e refeita depois
      restaurarOssos(ossos)
      mixer.update(delta)
      ossos = salvarOssosDoGolpe(grupo)
      posarComMarreta(grupo, POSE_MARRETA_GUARDA, 1)
    },
  }
}

/** O equipamento sozinho, pro expositor da Personalização: a marreta vem de criarMarreta, a katana e os cajados de
 * sempre são recortados do próprio modelo, e o resto é montado em código. */
function montarExpositor(tipo: string, parte: string, opcao: string): THREE.Object3D | null {
  if (parte === 'arma' && tipo === 'r') return ARMAS_DA_TORRE.includes(opcao) ? criarMarreta('w', opcao) : null
  const modelo = modelosRPG[tipo]
  // o ataque especial da katana aparece como a própria katana
  if (parte === 'golpe' && modelo) return katanaDoModelo(buildPecaRPG(modelo, 'w'))
  if (parte === 'arma' && modelo && (opcao === 'katana' || opcao === 'cajado')) {
    const peca = buildPecaRPG(modelo, 'w')
    return tipo === 'p' ? katanaDoModelo(peca) : cajadoDoModelo(peca, tipo)
  }
  return equipamentoSozinho(tipo, parte, opcao, materiaisDaPeca('w'))
}

function poeiraDaPancada(cena: THREE.Object3D, x: number, z: number) {
  const agora = performance.now()
  const particulas: Particula[] = []
  const soltar = (cor: number, tamanho: number, vida: number, sobe: number, espalha: number) => {
    const material = new THREE.SpriteMaterial({ map: texturaBrilho, color: cor, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(tamanho)
    sprite.position.set(x, 0.1, z)
    cena.add(sprite)
    const angulo = Math.random() * Math.PI * 2
    const velocidade = new THREE.Vector3(Math.cos(angulo) * espalha, sobe, Math.sin(angulo) * espalha)
    particulas.push({ objeto: sprite, nasceu: agora, vida, velocidade, tamanho })
  }
  // poeira baixa, que corre pelo chão, e lascas de madeira que saltam
  for (let i = 0; i < 20; i++) soltar(0xc9b79c, 0.34 + Math.random() * 0.3, 650 + Math.random() * 450, 0.25 + Math.random() * 0.5, 0.9 + Math.random() * 1.3)
  for (let i = 0; i < 14; i++) soltar(0x6b4423, 0.05 + Math.random() * 0.05, 550 + Math.random() * 300, 1.6 + Math.random() * 1.8, 0.5 + Math.random() * 1.2)
  animarParticulas(cena, particulas)
}

const ONDA_MARRETA_MS = 480

/** A onda da pancada corre pelo chão na cor do exército de quem bateu. */
function ondaDaMarretada(cena: THREE.Object3D, x: number, z: number, cor: THREE.ColorRepresentation) {
  const material = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
  const onda = new THREE.Mesh(geoOndaPoder, material)
  onda.rotation.x = -Math.PI / 2
  onda.position.set(x, 0.03, z)
  cena.add(onda)
  const inicio = performance.now()
  function passo(agora: number) {
    const t = Math.min(1, (agora - inicio) / ONDA_MARRETA_MS)
    onda.scale.setScalar(1 + (1 - (1 - t) * (1 - t)) * 9)
    material.opacity = 0.85 * (1 - t)
    if (t < 1) {
      requestAnimationFrame(passo)
      return
    }
    cena.remove(onda)
    material.dispose()
  }
  requestAnimationFrame(passo)
}

const ACHATAR_MS = 90
const ACHATADA_MS = 380
const ACHATADA_SOME_MS = 380

/** A vítima da marreta: achata de uma vez, como num desenho animado, fica assim um instante e some. */
function esmagarPeca(mesh: THREE.Object3D, aoTerminar: () => void) {
  const definirOpacidade = prepararParaSumir(mesh)
  novaSequenciaRPG(mesh)
  mostrarEspadaRPG(mesh, false)
  const base = mesh.scale.clone()
  const inicio = performance.now()
  function passo(agora: number) {
    const decorrido = agora - inicio
    const t = Math.min(1, decorrido / ACHATAR_MS)
    mesh.scale.set(base.x * (1 + 0.5 * t), base.y * (1 - 0.88 * t), base.z * (1 + 0.5 * t))
    const sumir = (decorrido - ACHATAR_MS - ACHATADA_MS) / ACHATADA_SOME_MS
    if (sumir > 0) definirOpacidade(1 - Math.min(1, sumir))
    if (sumir >= 1) {
      aoTerminar()
      return
    }
    requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}

// ---------------------------------------------------------------------------
// Raio da dama — do cetro (mão direita) sai um raio que cintila em zigue-zague até a vítima,
// redesenhado a cada poucos quadros, e explode nela. Ataque à distância como o do bispo, mas
// instantâneo como um relâmpago.
// ---------------------------------------------------------------------------
const geoSegmentoRaio = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)

function lancarRaioDaDama(cena: THREE.Object3D, dama: THREE.Object3D, alvo: THREE.Vector3, cor: THREE.ColorRepresentation, aoAcertar: () => void, mao = 'RightHand') {
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

function lancarOndaDoRei(cena: THREE.Object3D, rei: THREE.Object3D, alvo: THREE.Vector3, cor: THREE.ColorRepresentation, aoAcertar: () => void) {
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
function animarPetalas(cena: THREE.Object3D, centro: THREE.Vector3, duracaoMs: number) {
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
function animarAscensao(
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

/** Clona os materiais da peça (compartilhados entre todas da mesma facção/tipo) pra ela poder
 * sumir sozinha; devolve a função que muda a opacidade dela. */
function prepararParaSumir(mesh: THREE.Object3D): (opacidade: number) => void {
  mesh.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const mat = obj.material
    if (Array.isArray(mat)) {
      obj.material = mat.map((m) => {
        const clone = m.clone()
        clone.transparent = true
        return clone
      })
    } else {
      const clone = mat.clone()
      clone.transparent = true
      obj.material = clone
    }
  })
  return (valor: number) => {
    mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => (m.opacity = valor))
      else mat.opacity = valor
    })
  }
}

/** Distância (casas) e altura do arco de uma peça arremessada pelo cavalo. */
const DISTANCIA_ARREMESSO = 2.6
const ALTURA_ARREMESSO = 1.1
const DURACAO_ARREMESSO_MS = 950

/**
 * A peça atropelada pelo cavalo sai voando pra longe na `direcao` do golpe: arco alto, girando de
 * ponta-cabeça no ar (com o corpo "desmontando" pela animação de morte, se for RPG), quica ao bater
 * no chão (ou na mesa, se cair fora do tabuleiro) e some aos poucos.
 */
function arremessarPeca(mesh: THREE.Object3D, direcao: { x: number; z: number }, aoTerminar: () => void) {
  const definirOpacidade = prepararParaSumir(mesh)
  const acoes = mesh.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
  if (acoes?.Morte) {
    novaSequenciaRPG(mesh)
    mostrarEspadaRPG(mesh, false)
    tocarClipeRPGUmaVez(mesh, 'Morte', { entrada: 0.08, voltarAoParado: false })
  }
  const tamanho = Math.hypot(direcao.x, direcao.z) || 1
  const ux = direcao.x / tamanho
  const uz = direcao.z / tamanho
  const inicioPos = mesh.position.clone()
  const distancia = DISTANCIA_ARREMESSO * (0.85 + Math.random() * 0.3)
  const fim = new THREE.Vector3(inicioPos.x + ux * distancia, 0, inicioPos.z + uz * distancia)
  // fora do tabuleiro (moldura incluída) cai na mesa, mais embaixo
  const foraDoTabuleiro = Math.abs(fim.x) > 4.7 || Math.abs(fim.z) > 4.7
  const chao = foraDoTabuleiro ? -0.36 : inicioPos.y
  const eixoGiro = new THREE.Vector3(uz, 0, -ux)
  const giroBase = mesh.quaternion.clone()
  // uma volta inteira no ar; a peça RPG termina deitada pela própria animação de morte, a geométrica
  // gira mais um quarto de volta pra cair deitada
  const giroTotal = Math.PI * 2 + (acoes?.Morte ? 0 : Math.PI / 2)
  const inicio = performance.now()
  function passo(agora: number) {
    const decorrido = agora - inicio
    const t = Math.min(1, decorrido / DURACAO_ARREMESSO_MS)
    mesh.position.x = inicioPos.x + (fim.x - inicioPos.x) * t
    mesh.position.z = inicioPos.z + (fim.z - inicioPos.z) * t
    // arco: sobe até ALTURA_ARREMESSO e desce até o chão de onde cair
    mesh.position.y = inicioPos.y + (chao - inicioPos.y) * t + 4 * ALTURA_ARREMESSO * t * (1 - t)
    const giro = new THREE.Quaternion().setFromAxisAngle(eixoGiro, -giroTotal * (1 - Math.pow(1 - t, 1.6)))
    mesh.quaternion.copy(giro.multiply(giroBase))
    if (t < 1) {
      requestAnimationFrame(passo)
      return
    }
    // no chão: um quique pequeno e some
    const inicioChao = performance.now()
    function noChao(agoraChao: number) {
      const tc = Math.min(1, (agoraChao - inicioChao) / 900)
      mesh.position.y = chao + Math.abs(Math.sin(Math.min(1, tc * 3) * Math.PI)) * 0.08 * (1 - Math.min(1, tc * 3)) - Math.max(0, tc - 0.4) * 0.2
      if (tc > 0.35) definirOpacidade(1 - (tc - 0.35) / 0.65)
      if (tc < 1) requestAnimationFrame(noChao)
      else aoTerminar()
    }
    requestAnimationFrame(noChao)
  }
  requestAnimationFrame(passo)
}

type PecaPromocao = 'q' | 'r' | 'b' | 'n'
const PECAS_PROMOCAO: { peca: PecaPromocao; nome: ChaveTexto; branca: string; preta: string }[] = [
  { peca: 'q', nome: 'promocao.rainha', branca: '♕', preta: '♛' },
  { peca: 'r', nome: 'promocao.torre', branca: '♖', preta: '♜' },
  { peca: 'b', nome: 'promocao.bispo', branca: '♗', preta: '♝' },
  { peca: 'n', nome: 'promocao.cavalo', branca: '♘', preta: '♞' },
]

/** Desistir da partida — pede confirmação no próprio botão (funciona também na tela cheia do
 * navegador, onde as janelas de diálogo do site não aparecem). */
function BotaoDesistir({
  t,
  confirmando,
  onPedir,
  onConfirmar,
  sobreTabuleiro = false,
}: {
  t: Traduzir
  confirmando: boolean
  onPedir: (v: boolean) => void
  onConfirmar: () => void
  sobreTabuleiro?: boolean
}) {
  const base = sobreTabuleiro ? 'rounded-lg px-3 py-1.5 text-sm font-semibold shadow' : 'rounded-lg px-3 py-2 text-sm font-medium transition'
  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => onPedir(true)}
        className={`${base} ${sobreTabuleiro ? 'bg-white/90 text-rose-700' : 'border border-rose-300 text-rose-700 hover:bg-rose-50'}`}
      >
        {t('desistir.botao')}
      </button>
    )
  }
  return (
    <span role="group" aria-label={t('desistir.pergunta')} className={`inline-flex items-center gap-1.5 ${sobreTabuleiro ? 'rounded-lg bg-white/90 px-2 py-1 shadow' : ''}`}>
      <span className={`text-sm ${sobreTabuleiro ? 'text-[#3a2a1a]' : 'text-ink-700'}`}>{t('desistir.pergunta')}</span>
      <button type="button" onClick={onConfirmar} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500">
        {t('desistir.sim')}
      </button>
      <button
        type="button"
        onClick={() => onPedir(false)}
        className={`rounded-lg px-2 py-1.5 text-sm font-medium ${sobreTabuleiro ? 'text-[#3a2a1a]' : 'text-ink-600 hover:bg-ink-100'}`}
      >
        {t('desistir.nao')}
      </button>
    </span>
  )
}

/** Pedir empate: à máquina, que pensa um instante e responde, ou ao adversário, que aceita ou recusa. */
function BotaoEmpate({ t, onPedir, sobreTabuleiro = false }: { t: Traduzir; onPedir: () => void; sobreTabuleiro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPedir}
      className={sobreTabuleiro ? 'rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow' : 'rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50'}
      data-pedir-empate
    >
      {t('empate.botao')}
    </button>
  )
}

/** Como fica gravada a partida contra a máquina que terminou em empate combinado. */
const EMPATE_POR_ACORDO = 'Empate por acordo'

/** O pedido de empate na tela: a máquina pensando, a recusa, o pedido enviado ao amigo ou o pedido dele. */
type EstadoDoEmpate = { tipo: 'pensando' } | { tipo: 'recusado'; por: 'maquina' | 'adversario' } | { tipo: 'enviado' } | { tipo: 'recebido' } | null

export function ChessBoard3D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chessRef = useRef(new Chess())
  const livroRef = useRef<LivroDeAberturas>(new Map())
  const partidaAtualRef = useRef<PartidaXadrez | null>(null)
  const corHumanoRef = useRef<'w' | 'b'>('w')
  const acoesRef = useRef<{
    carregarPgn: (pgn: string, corHumano: 'w' | 'b') => void
    mostrarMenu: () => void
    desistir: () => void
    pedirEmpate: () => void
    atualizarTextos: () => void
    aplicarQualidade: (qualidade: QualidadeXadrez) => void
    aplicarTelaMovel: () => void
    /** A personalização mudou: refaz só as peças cuja roupa mudou. */
    revestir: () => void
    carregarSala: () => void
    receberEstadoDaSala: (estado: EstadoDaSala) => void
    receberLanceDaSala: (lance: LanceDaSala) => void
    receberFimDaSala: (resultado: ResultadoDaSala, motivo: string) => void
  } | null>(null)

  const [config, mudarConfig] = useConfigXadrez()
  // o tabuleiro lê as configurações e os textos fora do React, nas animações
  const configRef = useRef(config)
  configRef.current = config
  const t = useMemo(() => tradutor(config.idioma), [config.idioma])
  const tRef = useRef(t)
  tRef.current = t
  const sessao = useSessao()
  const jogador = sessao?.usuario.nome ?? t('conta.convidado')
  // partida contra outra pessoa: a conexão ao vivo e o que o servidor disse por último. Sem ela, a
  // partida é contra a máquina
  const salaRef = useRef<{ conexao: ConexaoDaSala; estado: EstadoDaSala | null } | null>(null)
  const [sala, setSala] = useState<EstadoDaSala | null>(null)
  const [conectadoNaSala, setConectadoNaSala] = useState(true)
  // o amigo pediu outra partida enquanto esta está na tela; `vencida` quando o convite já não vale
  const [revanche, setRevanche] = useState<{ codigo: string; vencida: boolean } | null>(null)
  const [revancheFalhou, setRevancheFalhou] = useState(false)
  // a tela inicial por cima do tabuleiro, ou a partida
  const [tela, setTela] = useState<'menu' | 'jogo'>('menu')
  const [statusTexto, setStatusTexto] = useState('')
  const [historico, setHistorico] = useState<string[]>([])
  const [partidasEmAndamento, setPartidasEmAndamento] = useState<PartidaXadrez[]>([])
  const [partidasFinalizadas, setPartidasFinalizadas] = useState<PartidaXadrez[]>([])
  // true quando ainda não há partida em andamento e o jogador precisa escolher a cor antes de
  // começar (tanto na primeira vez quanto em "Novo jogo")
  const [escolhendoCor, setEscolhendoCor] = useState(false)
  useEffect(() => {
    configurarSom({ ligado: config.som, ambiente: config.ambiente, volume: config.volume })
  }, [config.som, config.ambiente, config.volume])
  useEffect(() => acoesRef.current?.atualizarTextos(), [config.idioma])
  useEffect(() => acoesRef.current?.aplicarQualidade(config.qualidade), [config.qualidade])
  useEffect(() => acoesRef.current?.aplicarTelaMovel(), [config.telaMovel])
  // o navegador só libera som depois de um gesto: quem chegou clicando no menu já fez o seu
  useEffect(() => {
    if (navigator.userActivation?.hasBeenActive) destravarSom()
    window.addEventListener('pointerdown', destravarSom)
    window.addEventListener('keydown', destravarSom)
    const desligarAmbiente = ambienteDoTabuleiro()
    return () => {
      window.removeEventListener('pointerdown', destravarSom)
      window.removeEventListener('keydown', destravarSom)
      desligarAmbiente()
    }
  }, [])
  // cor do peão que está promovendo, enquanto a pessoa escolhe a peça
  const [promocaoPendente, setPromocaoPendente] = useState<'w' | 'b' | null>(null)
  const resolverPromocaoRef = useRef<((peca: PecaPromocao | null) => void) | null>(null)
  useFecharComEsc(() => resolverPromocaoRef.current?.(null), promocaoPendente !== null)
  const [resultadoOverlay, setResultadoOverlay] = useState<FimDaPartida | null>(null)
  // partida do jogador em andamento (dá pra desistir) — atualizado a cada lance
  const [podeDesistir, setPodeDesistir] = useState(false)
  // dá pra pedir empate: partida em andamento, um pedido por lance, e contra a máquina só na sua vez
  const [podeEmpatar, setPodeEmpatar] = useState(false)
  const [empate, setEmpate] = useState<EstadoDoEmpate>(null)
  // a recusa some sozinha depois de um tempo
  useEffect(() => {
    if (empate?.tipo !== 'recusado') return
    const prazo = window.setTimeout(() => setEmpate(null), 6000)
    return () => window.clearTimeout(prazo)
  }, [empate])
  // a cor de quem joga, pra aba de lances dizer quem fez cada lance
  const [corDoJogador, setCorDoJogador] = useState<'w' | 'b'>('w')
  const [confirmandoDesistencia, setConfirmandoDesistencia] = useState(false)
  // tabuleiro ocupando a tela toda (e a tela cheia do navegador, se der)
  // a tela inicial sempre ocupa a página inteira
  const ocupaATela = true
  // as conquistas contam as partidas contra a máquina, terminadas ou não; as com amigos ficam de fora
  const partidasContraMaquina = useMemo(() => [...partidasEmAndamento, ...partidasFinalizadas], [partidasEmAndamento, partidasFinalizadas])
  const tabuleiroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    carregarLivroDeAberturas().then((livro) => {
      livroRef.current = livro
    })
  }, [])

  // a partida em andamento fica à espera do botão "Continuar partida" da tela inicial
  const atualizarListaDePartidas = useCallback(() => {
    listPartidas()
      .then((partidas) => {
        setPartidasEmAndamento(partidas.filter((p) => p.status === 'EM_ANDAMENTO'))
        setPartidasFinalizadas(partidas.filter((p) => p.status === 'FINALIZADA'))
      })
      .catch(() => {
        // a tela inicial abre do mesmo jeito, só sem o "Continuar partida"
      })
  }, [])

  useEffect(() => {
    atualizarListaDePartidas()
    return ouvirDados(atualizarListaDePartidas)
  }, [atualizarListaDePartidas])

  useEffect(() => () => salaRef.current?.conexao.fechar(), [])
  // as peças de quem joga vestem o que a pessoa escolheu: a escolha vem da conta e muda pela aba Personalização
  useEffect(() => ouvirPersonalizacao(() => acoesRef.current?.revestir()), [])
  useEffect(() => {
    void carregarPersonalizacao()
  }, [sessao?.token])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const selecionadaRef: { current: Square | null } = { current: null }
    const destinosRef: { current: Square[] } = { current: [] }
    const vezDaMaquinaRef: { current: boolean } = { current: false }
    const pieceMeshBySquare = new Map<string, THREE.Group>()
    // "geração" do tabuleiro: muda a cada tabuleiro novo (outra partida, novo jogo, volta pro menu).
    // Lances e animações que começaram numa geração antiga não mexem mais em nada — antes,
    // começar um jogo no meio da animação de um lance deixava a animação velha terminar por cima do
    // tabuleiro novo (peça sumida, fora da casa, ou a peça errada reaproveitada)
    let geracao = 0
    // lances com animação ainda rodando (os testes esperam zerar)
    let lancesEmAndamento = 0
    // lances do adversário que chegaram enquanto outra peça ainda andava
    let filaDaSala: string[] = []
    let animandoDaSala = false
    function novoTabuleiro() {
      resolverPromocaoRef.current?.(null)
      geracao++
      lancesEmAndamento = 0
      filaDaSala = []
      animandoDaSala = false
      ultimoPedidoDeEmpate = -1
      setEmpate(null)
    }
    // pra não disparar a comemoração de novo enquanto o xeque-mate continuar sendo a posição atual
    let comemoracaoDisparada = false
    // em que lance quem joga pediu empate pela última vez: um pedido por lance
    let ultimoPedidoDeEmpate = -1

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf5f0e6)
    // "far" bem além do maxDistance do controle de órbita (20) — antes os dois coincidiam, então
    // no zoom mais distante o tabuleiro chegava a ficar 100% da cor da névoa (basicamente
    // invisível); agora ele só vai desbotando um pouco, nunca sumindo, não importa a distância
    scene.fog = new THREE.Fog(0xf5f0e6, 11, 55)

    // câmera mais afastada e com FOV mais fechado que o normal — bem próxima e com campo de visão
    // largo deixava o tabuleiro com uma perspectiva exagerada, quase "olhando de raspão"
    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100)
    ladoDaCamera = 1
    camera.position.set(0, 9.5, 10)
    camera.lookAt(0, 0, 0)

    // o antisserrilhado só se escolhe ao criar o desenho: quem troca de ou pra baixa vê a diferença ao abrir o jogo de novo
    const qualidadeDeInicio = QUALIDADES[configRef.current.qualidade]
    const renderer = new THREE.WebGLRenderer({ antialias: qualidadeDeInicio.acabamento, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight, false)
    // o desenho sempre preenche o espaço dele (CSS): com largura fixa em pixels ele impedia o espaço de
    // encolher (abrir o menu, sair da tela cheia) e o tabuleiro ficava descentralizado/cortado — só a
    // resolução interna acompanha o tamanho (onResize)
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' })
    renderer.setPixelRatio(qualidadeDeInicio.resolucao(container.clientWidth, container.clientHeight))
    renderer.shadowMap.enabled = true
    // o machado e a gravidade recortam a peça (metade de cima, o que já entrou no chão)
    renderer.localClippingEnabled = true
    // sombras suaves de verdade (borda esfumada, como a de uma luz real), em alta resolução
    renderer.shadowMap.type = THREE.VSMShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // visual "HD": tons cinematográficos (ACES), que seguram o brilho do metal e do verniz sem
    // estourar o branco
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)
    const anisotropia = qualidadeDeInicio.acabamento ? renderer.capabilities.getMaxAnisotropy() : 1

    // reflexo de ambiente (um "estúdio" gerado na hora, sem imagem externa): é o que faz o metal das
    // armaduras, o ouro das coroas e o verniz do tabuleiro brilharem de verdade
    let reflexo: THREE.WebGLRenderTarget | null = null
    function gerarReflexoDoAmbiente() {
      const gerador = new THREE.PMREMGenerator(renderer)
      reflexo?.dispose()
      reflexo = gerador.fromScene(new RoomEnvironment(), 0.04)
      scene.environment = reflexo.texture
      gerador.dispose()
    }
    gerarReflexoDoAmbiente()
    scene.environmentIntensity = 0.55
    // a placa de vídeo devolveu o contexto (aba voltou do segundo plano): o three.js reenvia as texturas
    // sozinho, mas o reflexo é desenhado na própria placa e precisa ser feito de novo
    renderer.domElement.addEventListener('webglcontextrestored', gerarReflexoDoAmbiente)

    const controls = new OrbitControls(camera, renderer.domElement)
    // o alvo fica na altura do corpo das peças (torso), não no chão do tabuleiro — senão o zoom
    // aproxima em direção a um ponto na casca do tabuleiro, e a peça (que tem altura) acaba saindo
    // por cima da tela bem antes da câmera "chegar" nela. Com o alvo na altura das peças, dá pra
    // aproximar de verdade até ficar cara a cara com uma peça, em vez de mergulhar no tabuleiro.
    controls.target.set(0, 0.4, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 2.2
    controls.maxDistance = 20
    controls.maxPolarAngle = Math.PI / 2 - 0.05
    controls.enabled = false
    const INCLINACAO_CAMERA_JOGO = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi

    // luz principal (com sombra suave), luz de preenchimento do lado oposto e uma luz de contorno
    // por trás, que destaca a silhueta das peças contra o fundo
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x3a2a1a, 0.3))
    const dirLight = new THREE.DirectionalLight(0xfff1dc, 2.4)
    dirLight.position.set(4, 10, 6)
    dirLight.castShadow = qualidadeDeInicio.sombras > 0
    dirLight.shadow.mapSize.setScalar(qualidadeDeInicio.sombras || 1024)
    dirLight.shadow.camera.left = -6.5
    dirLight.shadow.camera.right = 6.5
    dirLight.shadow.camera.top = 6.5
    dirLight.shadow.camera.bottom = -6.5
    dirLight.shadow.camera.near = 1
    dirLight.shadow.camera.far = 30
    dirLight.shadow.radius = 5
    dirLight.shadow.blurSamples = 12
    dirLight.shadow.bias = -0.0004
    dirLight.shadow.normalBias = 0.02
    scene.add(dirLight)
    const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.45)
    fillLight.position.set(-5, 6, -4)
    scene.add(fillLight)
    const luzContorno = new THREE.DirectionalLight(0xffe2b8, 0.7)
    luzContorno.position.set(0, 5, -9)
    scene.add(luzContorno)

    // madeiras: bordo claro (casas claras), nogueira (casas escuras), nogueira escura (moldura) e
    // a mesa embaixo
    const madeiraClara = criarTexturaMadeira([226, 201, 160], [190, 150, 102], 1.7)
    const madeiraEscura = criarTexturaMadeira([104, 62, 36], [58, 31, 16], 4.3)
    const madeiraMoldura = criarTexturaMadeira([70, 40, 22], [36, 19, 9], 7.9, 10)
    const madeiraMesa = criarTexturaMadeira([60, 40, 28], [40, 26, 18], 2.2, 34)

    // mesa embaixo do tabuleiro, recebendo a sombra dele e sumindo no fundo com a névoa
    madeiraMesa.repeat.set(6, 6)
    madeiraMesa.anisotropy = anisotropia
    const mesa = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: madeiraMesa, roughness: 0.7, metalness: 0 }),
    )
    mesa.rotation.x = -Math.PI / 2
    mesa.position.y = -0.36
    mesa.receiveShadow = true
    scene.add(mesa)

    // moldura: bloco de nogueira com quinas arredondadas embaixo das casas (aparece nos frisos entre
    // elas) e uma borda levemente elevada em volta, com um filete dourado na beira de dentro
    const materialMoldura = materialMadeira(madeiraMoldura, anisotropia)
    const base = new THREE.Mesh(new RoundedBoxGeometry(9.4, 0.34, 9.4, 4, 0.06), materialMoldura)
    base.position.y = -0.19
    base.receiveShadow = true
    base.castShadow = true
    scene.add(base)
    const bordaGeo = new RoundedBoxGeometry(9.4, 0.06, 0.7, 3, 0.02)
    const bordaLadoGeo = new RoundedBoxGeometry(0.7, 0.06, 8.0, 3, 0.02)
    const bordas: [THREE.BufferGeometry, number, number][] = [
      [bordaGeo, 0, 4.35],
      [bordaGeo, 0, -4.35],
      [bordaLadoGeo, 4.35, 0],
      [bordaLadoGeo, -4.35, 0],
    ]
    for (const [geo, x, z] of bordas) {
      const borda = new THREE.Mesh(geo, materialMoldura)
      borda.position.set(x, 0.01, z)
      borda.receiveShadow = true
      borda.castShadow = true
      scene.add(borda)
    }
    const materialFilete = new THREE.MeshStandardMaterial({ color: 0xd9ae4a, metalness: 1, roughness: 0.25 })
    const fileteGeo = new THREE.BoxGeometry(8.06, 0.012, 0.03)
    for (let lado = 0; lado < 4; lado++) {
      const filete = new THREE.Mesh(fileteGeo, materialFilete)
      const angulo = (lado * Math.PI) / 2
      filete.rotation.y = angulo
      filete.position.set(Math.sin(angulo) * 4.03, 0.042, Math.cos(angulo) * 4.03)
      scene.add(filete)
    }

    // casas: madeira de verdade com verniz e quinas levemente arredondadas — entre uma casa e outra
    // fica um friso fino, como num tabuleiro de marchetaria. Cada casa usa um pedaço diferente da
    // textura (e metade delas com o veio girado), pra não parecerem carimbadas.
    const boardGroup = new THREE.Group()
    const squareMeshes: THREE.Mesh[] = []
    const squareGeo = new RoundedBoxGeometry(0.985, 0.1, 0.985, 3, 0.012)
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const square = `${String.fromCharCode(97 + f)}${r + 1}`
        const clara = (f + r) % 2 === 1
        const mat = materialMadeira(clara ? madeiraClara : madeiraEscura, anisotropia, {
          x: Math.random(),
          y: Math.random(),
          giro: (f + r) % 4 < 2 ? 0 : Math.PI / 2,
        })
        const mesh = new THREE.Mesh(squareGeo, mat)
        const { x, z } = squareToPos(square)
        mesh.position.set(x, -0.05, z)
        mesh.receiveShadow = true
        mesh.userData.square = square
        boardGroup.add(mesh)
        squareMeshes.push(mesh)
      }
    }
    scene.add(boardGroup)

    // coordenadas padrão do xadrez — colunas a-h na borda de trás (lado das brancas) e linhas 1-8
    // na borda esquerda, gravadas em dourado na moldura
    const labelsGroup = new THREE.Group()
    const labelGeo = new THREE.PlaneGeometry(0.36, 0.36)
    for (let f = 0; f < 8; f++) {
      const textura = criarTexturaTexto(LETRAS_COLUNAS[f])
      textura.anisotropy = anisotropia
      const mat = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false })
      const mesh = new THREE.Mesh(labelGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      const { x } = squareToPos(`${LETRAS_COLUNAS[f]}1`)
      mesh.position.set(x, 0.045, 4.35)
      labelsGroup.add(mesh)
    }
    for (let r = 0; r < 8; r++) {
      const textura = criarTexturaTexto(String(r + 1))
      textura.anisotropy = anisotropia
      const mat = new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false })
      const mesh = new THREE.Mesh(labelGeo, mat)
      mesh.rotation.x = -Math.PI / 2
      const { z } = squareToPos(`a${r + 1}`)
      mesh.position.set(-4.35, 0.045, z)
      labelsGroup.add(mesh)
    }
    scene.add(labelsGroup)

    const piecesGroup = new THREE.Group()
    scene.add(piecesGroup)
    const highlightGroup = new THREE.Group()
    scene.add(highlightGroup)

    // casa do Rei em xeque: vermelha (pulsando de leve), por cima da madeira e por baixo dos destaques
    // de seleção — fica até o xeque acabar
    const xequeMat = new THREE.MeshBasicMaterial({ color: COR_XEQUE, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })
    const xequeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.97), xequeMat)
    xequeMesh.rotation.x = -Math.PI / 2
    xequeMesh.visible = false
    scene.add(xequeMesh)
    function marcarXeque() {
      const chess = chessRef.current
      const rei = chess.isCheck() ? chess.board().flat().find((c) => c && c.type === 'k' && c.color === chess.turn()) : undefined
      if (!rei) {
        xequeMesh.visible = false
        return
      }
      // o mate tem o som dele; aqui é só xeque novo, não a mesma tela sendo redesenhada
      if (!chess.isCheckmate() && (!xequeMesh.visible || xequeMesh.userData.casa !== rei.square)) tocarSom('xeque')
      const { x, z } = squareToPos(rei.square)
      xequeMesh.position.set(x, 0.006, z)
      xequeMesh.userData.casa = rei.square
      xequeMesh.visible = true
    }

    function descartarFilhos(grupo: THREE.Group) {
      for (const filho of grupo.children) {
        filho.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            for (const mat of mats) mat.dispose()
          }
        })
      }
      grupo.clear()
    }

    // as peças usam geometria/material compartilhados (cache por tipo/cor), então aqui só
    // desmonta o grupo — nunca chama dispose(), senão quebraria as peças que ainda usam o cache
    function sincronizarPecas(recriar = false) {
      vestimenta = { cor: corHumanoRef.current, escolhas: vestimentaDeTeste ?? personalizacaoAtual().escolhas }
      if (recriar) {
        // inclusive as que estavam caindo/sumindo de uma captura em andamento
        piecesGroup.clear()
        pieceMeshBySquare.clear()
      }
      // ajusta o tabuleiro ao estado do motor reaproveitando a peça que continua na mesma casa
      // (mesmo tipo e cor, e o mesmo tipo de modelo — geométrica ou RPG) — inclusive a que acabou de
      // andar (o lance atualiza o mapa casa → peça quando ela chega). Antes o tabuleiro inteiro era
      // recriado a cada lance: todas as peças voltavam de repente pra pose parada (cortando gestos,
      // comemorações, a virada pra outra peça…) e o quadro engasgava recriando 32 personagens. Só
      // cria peça nova quando muda de verdade (promoção, novo jogo, modelos RPG que acabaram de
      // carregar).
      const meshesAntigos = new Map(pieceMeshBySquare)
      pieceMeshBySquare.clear()
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa) continue
          const existente = meshesAntigos.get(casa.square)
          if (
            existente &&
            existente.userData.tipo === casa.type &&
            existente.userData.cor === casa.color &&
            Boolean(existente.userData.acoesRPG) === Boolean(modelosRPG[casa.type]) &&
            (!modelosRPG[casa.type] || existente.userData.vestimenta === assinaturaDaVestimenta(casa.type, casa.color))
          ) {
            pieceMeshBySquare.set(casa.square, existente)
            meshesAntigos.delete(casa.square)
            continue
          }
          const mesh = buildPieceMesh(casa.type, casa.color)
          const { x, z } = squareToPosPeca(casa.square)
          mesh.position.set(x, 0.05, z)
          piecesGroup.add(mesh)
          pieceMeshBySquare.set(casa.square, mesh)
        }
      }
      for (const [, meshVelho] of meshesAntigos) {
        piecesGroup.remove(meshVelho)
      }
    }

    /** Peças aliadas (mesma cor) a até `raio` casas de distância de `square`, sem incluir ela mesma. */
    function pecasAliadasProximas(square: Square, cor: 'w' | 'b', raio: number): { square: Square; mesh: THREE.Group }[] {
      const origem = squareToPos(square)
      const resultado: { square: Square; mesh: THREE.Group }[] = []
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== cor || casa.square === square) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (!mesh) continue
          const pos = squareToPos(casa.square)
          if (Math.hypot(pos.x - origem.x, pos.z - origem.z) <= raio) {
            resultado.push({ square: casa.square as Square, mesh })
          }
        }
      }
      return resultado
    }

    // true enquanto a aura pulsante da peça selecionada (abaixo) deve continuar rodando — vira
    // false assim que os destaques são limpos, pra parar o loop de animação na próxima checagem
    let auraSelecaoAtiva = false

    function limparDestaques() {
      auraSelecaoAtiva = false
      descartarFilhos(highlightGroup)
    }

    function destacarSelecao(square: Square, destinos: Square[]) {
      limparDestaques()
      const posSel = squareToPos(square)

      // anel na casa atual (de onde a peça está saindo)
      const selMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.38, 32),
        new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide }),
      )
      selMesh.rotation.x = -Math.PI / 2
      selMesh.position.set(posSel.x, 0.02, posSel.z)
      highlightGroup.add(selMesh)

      // círculos nas casas de destino (pra onde a peça pode ir)
      const destGeo = new THREE.CircleGeometry(0.14, 24)
      const destMat = new THREE.MeshBasicMaterial({ color: COR_DESTINO })
      for (const dest of destinos) {
        const destMesh = new THREE.Mesh(destGeo, destMat)
        destMesh.rotation.x = -Math.PI / 2
        const pos = squareToPos(dest)
        destMesh.position.set(pos.x, 0.02, pos.z)
        highlightGroup.add(destMesh)
      }

      // aura pulsante bem junto da própria peça — destaca a peça selecionada em si, não só a casa
      const auraGeo = new THREE.RingGeometry(0.15, 0.2, 28)
      const auraMat = new THREE.MeshBasicMaterial({ color: COR_SELECIONADA, side: THREE.DoubleSide, transparent: true })
      const auraMesh = new THREE.Mesh(auraGeo, auraMat)
      auraMesh.rotation.x = -Math.PI / 2
      auraMesh.position.set(posSel.x, 0.045, posSel.z)
      highlightGroup.add(auraMesh)

      auraSelecaoAtiva = true
      const inicioAura = performance.now()
      function pulsar(agora: number) {
        if (!auraSelecaoAtiva) return
        const onda = (Math.sin(((agora - inicioAura) / 850) * Math.PI * 2) + 1) / 2
        auraMesh.scale.setScalar(1 + onda * 0.22)
        auraMat.opacity = 0.5 + onda * 0.5
        requestAnimationFrame(pulsar)
      }
      requestAnimationFrame(pulsar)
    }

    // BRANCAS/PRETAS venceram, ou EMPATE — só chamar quando chess.isGameOver() for true
    function resultadoAtual(chess: Chess): ResultadoPartidaXadrez {
      if (chess.isCheckmate()) return chess.turn() === 'w' ? 'PRETAS' : 'BRANCAS'
      return 'EMPATE'
    }

    // salva o progresso da partida atual (PGN + status) depois de cada lance — assim o jogo
    // nunca se perde, mesmo fechando a aba no meio de uma partida. Quando a partida termina,
    // também alimenta o aprendizado da máquina com o que ela jogou nessa partida.
    function salvarProgresso() {
      const partida = partidaAtualRef.current
      // a partida contra outra pessoa fica guardada no servidor, lance a lance
      if (!partida || salaRef.current) return
      const chess = chessRef.current
      partida.pgn = chess.pgn()
      partida.atualizadaEm = Date.now()
      if (chess.isCheckmate()) {
        partida.status = 'FINALIZADA'
        partida.resultado =
          chess.turn() === corHumanoRef.current ? 'A máquina venceu (xeque-mate)' : 'Você venceu (xeque-mate)'
      } else if (chess.isStalemate()) {
        partida.status = 'FINALIZADA'
        partida.resultado = 'Empate por afogamento'
      } else if (chess.isDraw()) {
        partida.status = 'FINALIZADA'
        partida.resultado = 'Empate'
      }
      const finalizouAgora = partida.status === 'FINALIZADA'
      salvarPartida(partida)
        .then(() => {
          if (finalizouAgora) {
            setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
            setPartidasFinalizadas((prev) => [partida, ...prev])
          }
        })
        .catch(() => {
          // sem servidor no momento — a partida segue salva só localmente até o próximo lance
        })
      // só o difícil ensina a máquina: os descuidos de propósito dos outros níveis a ensinariam a jogar mal
      if (finalizouAgora && (partida.dificuldade ?? 'dificil') === 'dificil') {
        const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
        registrarAprendizadoDaPartida(chess.history({ verbose: true }), resultadoAtual(chess), [corMaquina])
      }
    }

    // xeque-mate: faz as peças do lado vencedor comemorarem (pulando, com os braços erguidos) e
    // mostra "Você venceu"/"Você perdeu" em destaque — só uma vez por mate (comemoracaoDisparada
    // só volta a false quando uma partida nova é carregada, em carregarPgn)
    function dispararComemoracaoDeXequeMate(chess: Chess) {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true

      const corVencedora: 'w' | 'b' = chess.turn() === 'w' ? 'b' : 'w'
      let atraso = 0
      for (const linha of chess.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== corVencedora) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (mesh) animarComemoracao(mesh, atraso)
          atraso += 60
        }
      }
      const venceu = corVencedora === corHumanoRef.current
      tocarSom(venceu ? 'vitoria' : 'derrota')
      setResultadoOverlay(venceu ? 'venceu' : 'perdeu')
    }

    /** Desistência ou tempo na partida contra outra pessoa: o tabuleiro não mostra quem ganhou. */
    function comemorarFimDaSala(corVencedora: 'w' | 'b', motivo: string) {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true
      const chess = chessRef.current
      let atraso = 0
      for (const linha of chess.board()) {
        for (const casa of linha) {
          if (!casa || casa.color !== corVencedora) continue
          const mesh = pieceMeshBySquare.get(casa.square)
          if (mesh) animarComemoracao(mesh, atraso)
          atraso += 60
        }
      }
      const venceu = corVencedora === corHumanoRef.current
      tocarSom(venceu ? 'vitoria' : 'derrota')
      setResultadoOverlay(venceu ? 'venceu' : motivo === 'desistencia' ? 'desistiu' : 'perdeu')
    }

    function tocarEmpateUmaVez() {
      if (comemoracaoDisparada) return
      comemoracaoDisparada = true
      tocarSom('empate')
      setResultadoOverlay('empate')
    }

    function atualizarStatusTexto() {
      const chess = chessRef.current
      setHistorico(chess.history())
      marcarXeque()
      const partidaDoJogador = partidaAtualRef.current
      const salaAtual = salaRef.current?.estado ?? null
      const adversario = (salaAtual?.minhaCor === 'w' ? salaAtual.pretas : salaAtual?.brancas) ?? ''
      const jogando = !!partidaDoJogador && partidaDoJogador.status !== 'FINALIZADA' && !chess.isGameOver() && (!salaAtual || salaAtual.status === 'andamento')
      const corHumano = corHumanoRef.current
      setPodeDesistir(jogando)
      setPodeEmpatar(
        jogando && ultimoPedidoDeEmpate !== chess.history().length && (salaAtual ? !salaAtual.empate : chess.turn() === corHumano && !vezDaMaquinaRef.current),
      )
      const t = tRef.current
      const nomeCor = (c: 'w' | 'b') => t(c === 'w' ? 'status.brancas' : 'status.pretas')
      const venciASala = !!salaAtual?.resultado && (salaAtual.resultado === 'brancas') === (salaAtual.minhaCor === 'w')
      if (salaAtual?.status === 'aguardando') {
        setStatusTexto(t('online.aguardando', { nome: adversario }))
      } else if (salaAtual?.status === 'expirada') {
        setStatusTexto(t('online.expirou'))
      } else if (salaAtual?.status === 'recusada') {
        setStatusTexto(t('online.recusou', { nome: adversario }))
      } else if (salaAtual?.motivo === 'desistencia') {
        setStatusTexto(t(venciASala ? 'online.adversarioDesistiu' : 'online.voceDesistiu', { nome: adversario }))
      } else if (salaAtual?.motivo === 'tempo') {
        setStatusTexto(t(venciASala ? 'online.venceuTempo' : 'online.perdeuTempo', { nome: adversario }))
      } else if (salaAtual?.motivo === 'acordo') {
        setStatusTexto(t('online.empateAcordo', { nome: adversario }))
        tocarEmpateUmaVez()
      } else if (partidaDoJogador?.status === 'FINALIZADA' && partidaDoJogador.resultado?.includes('desistiu')) {
        setStatusTexto(t('status.desistiu'))
      } else if (partidaDoJogador?.status === 'FINALIZADA' && partidaDoJogador.resultado === EMPATE_POR_ACORDO) {
        setStatusTexto(t('status.empateAcordo'))
        tocarEmpateUmaVez()
      } else if (!partidaAtualRef.current) {
        setStatusTexto('')
      } else if (chess.isCheckmate()) {
        setStatusTexto(
          chess.turn() === corHumano
            ? salaAtual
              ? t('online.adversarioVenceu', { nome: adversario, cor: nomeCor(corHumano === 'w' ? 'b' : 'w') })
              : t('status.maquinaVenceu', { cor: nomeCor(corHumano === 'w' ? 'b' : 'w') })
            : t('status.voceVenceu', { cor: nomeCor(corHumano) }),
        )
        dispararComemoracaoDeXequeMate(chess)
      } else if (chess.isStalemate()) {
        setStatusTexto(t('status.afogamento'))
        tocarEmpateUmaVez()
      } else if (chess.isDraw()) {
        setStatusTexto(t('status.empate'))
        tocarEmpateUmaVez()
      } else if (chess.turn() !== corHumano) {
        if (salaAtual) setStatusTexto(t(chess.isCheck() ? 'online.xequeVezDoAdversario' : 'online.vezDoAdversario', { nome: adversario }))
        else setStatusTexto(t(chess.isCheck() ? 'status.xequePensando' : 'status.pensando'))
      } else {
        setStatusTexto(chess.isCheck() ? t('status.xequeSuaVez', { cor: nomeCor(corHumano) }) : t('status.suaVez', { cor: nomeCor(corHumano) }))
      }
    }

    /**
     * Aplica um lance (SAN da máquina, ou {from,to} do clique do jogador) já animando a peça da
     * posição de origem até o destino; numa captura, o golpe (corpo a corpo, à distância ou o
     * atropelo do cavalo) vem antes, e a vítima cai e some (inclusive en passant). No roque a torre
     * anda junto com o rei. A promoção só assume a forma final ao ressincronizar no fim.
     */
    function executarLanceComAnimacao(
      entrada: string | { from: Square; to: Square; promotion?: string },
      aoTerminar: () => void,
    ) {
      const chess = chessRef.current
      let origem: Square | undefined
      let destino: Square | undefined

      if (typeof entrada === 'string') {
        const candidato = chess.moves({ verbose: true }).find((m) => m.san === entrada)
        if (candidato) {
          origem = candidato.from as Square
          destino = candidato.to as Square
        }
      } else {
        origem = entrada.from
        destino = entrada.to
      }

      const meshMovendo = origem ? pieceMeshBySquare.get(origem) : undefined

      // chess.js (v1.x) lança exceção pra um lance que não é mais válido na posição atual (ex: um
      // lance calculado antes de outro já ter sido aplicado nesse meio-tempo) — sem isso, essa
      // exceção ficava sem tratamento dentro do setTimeout assíncrono e travava a tela pra sempre
      // em "a máquina está pensando…", já que aoTerminar() nunca era chamado.
      let resultado: ReturnType<typeof chess.move> | null
      try {
        resultado =
          typeof entrada === 'string' ? chess.move(entrada) : chess.move({ ...entrada, promotion: entrada.promotion ?? 'q' })
      } catch {
        resultado = null
      }
      if (!resultado) {
        aoTerminar()
        return
      }

      // registra o lance assim que é aplicado no motor — atualiza a lista de "Lances" e salva no
      // servidor na hora, sem esperar a animação (que numa captura leva vários segundos) terminar.
      // Antes só acontecia no fim da animação: fechar a aba nesse meio-tempo perdia o último lance,
      // e a lista de lances ficava visivelmente atrasada em relação ao que já tinha acontecido.
      setHistorico(chess.history())
      salvarProgresso()

      // a partir daqui o lance é desse tabuleiro: se outro entrar no meio (novo jogo, outra partida),
      // nada do que falta (chegada, captura, ajuste das peças, próximo lance) acontece mais
      const minhaGeracao = geracao
      const vigente = () => minhaGeracao === geracao
      lancesEmAndamento++
      const terminar = () => {
        if (!vigente()) return
        lancesEmAndamento = Math.max(0, lancesEmAndamento - 1)
        aoTerminar()
      }

      // daqui pra frente o lance e as casas não mudam mais (constantes pros callbacks das animações)
      const lance = resultado
      const casaOrigem = origem
      const casaDestino = destino

      /** A peça chegou: o mapa casa → peça passa a apontar pra ela na casa nova — ela é
       * reaproveitada no fim do lance (ver sincronizarPecas), não recriada. */
      function chegou(mesh: THREE.Group, de: Square, para: Square) {
        if (!vigente()) return
        if (pieceMeshBySquare.get(de) === mesh) pieceMeshBySquare.delete(de)
        pieceMeshBySquare.set(para, mesh)
      }

      // roque: a torre também anda até a casa dela, junto com o rei
      const linhaDoRoque = resultado.color === 'w' ? '1' : '8'
      const torreDe = resultado.isKingsideCastle()
        ? (`h${linhaDoRoque}` as Square)
        : resultado.isQueensideCastle()
          ? (`a${linhaDoRoque}` as Square)
          : undefined
      const torrePara = resultado.isKingsideCastle()
        ? (`f${linhaDoRoque}` as Square)
        : resultado.isQueensideCastle()
          ? (`d${linhaDoRoque}` as Square)
          : undefined

      /** A peça (e, no roque, a torre) anda de onde está agora até a casa de destino; no fim, o
       * tabuleiro se ajusta reaproveitando as peças. */
      function seguirParaDestino() {
        if (!vigente()) return
        if (!meshMovendo || !casaOrigem || !casaDestino) {
          sincronizarPecas()
          terminar()
          return
        }
        let pendentes = 1
        const terminouUma = () => {
          if (!vigente()) return
          pendentes--
          if (pendentes === 0) {
            sincronizarPecas()
            terminar()
          }
        }
        // de onde a peça está agora — numa captura corpo a corpo ela já está perto da vítima
        const de = { x: meshMovendo.position.x, z: meshMovendo.position.z }
        animarPosicao(meshMovendo, de, squareToPosPeca(casaDestino), () => {
          chegou(meshMovendo, casaOrigem, casaDestino)
          if (!lance.isPromotion()) {
            terminouUma()
            return
          }
          // promoção: a ascensão — a luz envolve o peão, ele levita e vira a peça nova
          tocarSom('promocao')
          animarAscensao(
            scene,
            meshMovendo,
            materiaisPorFaccao[lance.color].brilho.color,
            () => {
              if (!vigente()) return undefined
              sincronizarPecas()
              return pieceMeshBySquare.get(casaDestino)
            },
            terminouUma,
          )
        })
        const torre = torreDe ? pieceMeshBySquare.get(torreDe) : undefined
        if (torre && torreDe && torrePara) {
          tocarSom('roque')
          pendentes++
          animarPosicao(torre, squareToPosPeca(torreDe), squareToPosPeca(torrePara), () => {
            chegou(torre, torreDe, torrePara)
            terminouUma()
          })
        }
      }

      // captura: golpe primeiro, só depois a vítima cai e some — o peão (geométrico ou RPG) e
      // qualquer peça RPG golpeiam; uma peça geométrica de outro tipo mantém a remoção direta. O
      // golpe só acontece aqui, na hora da captura
      const casaDaVitima = (resultado.isEnPassant() && casaOrigem && casaDestino ? `${casaDestino[0]}${casaOrigem[1]}` : casaDestino) as
        | Square
        | undefined
      const vitima = casaDaVitima ? pieceMeshBySquare.get(casaDaVitima) : undefined
      const golpeia = resultado.piece === 'p' || Boolean(meshMovendo?.userData.acoesRPG)

      if (vitima && golpeia && meshMovendo && casaOrigem && casaDestino) {
        const atacante = meshMovendo
        const tipoAtacante = resultado.piece
        const ehRPG = Boolean(atacante.userData.acoesRPG)
        const corAtacante = resultado.color
        const posVitima = { x: vitima.position.x, z: vitima.position.z }

        const removerVitima = () => {
          if (!vigente()) return
          vitima.removeFromParent()
          if (casaDaVitima && pieceMeshBySquare.get(casaDaVitima) === vitima) pieceMeshBySquare.delete(casaDaVitima)
        }
        // peças aliadas da atacante que estejam por perto comemoram junto, numa versão curta da
        // comemoração de xeque-mate
        const comemorarAliadas = () => {
          let atraso = 0
          for (const aliada of pecasAliadasProximas(casaDestino, corAtacante, 2.2)) {
            if (aliada.mesh === atacante) continue
            animarComemoracao(aliada.mesh, atraso, 900)
            atraso += 80
          }
        }

        // cavalo: salta até a casa e pousa com as patas em cima da vítima, que sai voando longe
        if (tipoAtacante === 'n' && ehRPG && pecaSaltaRPG(atacante)) {
          const de = { x: atacante.position.x, z: atacante.position.z }
          // o lance só termina com o cavalo pousado E a vítima já fora de cena — antes a vez passava
          // com ela ainda voando, e ficava uma peça a mais no tabuleiro até ela sumir
          let faltam = 2
          const umaParte = () => {
            if (!vigente()) return
            faltam--
            if (faltam === 0) {
              sincronizarPecas()
              terminar()
            }
          }
          animarPosicaoRPG(
            atacante,
            de,
            squareToPosPeca(casaDestino),
            () => {
              if (!vigente()) return
              chegou(atacante, casaOrigem, casaDestino)
              umaParte()
            },
            () => {
              tocarSom('golpe:n')
              if (atacante.userData.arma === 'lanca') tocarSom('golpe:lanca')
              tocarSom('voo:vitima')
              animarImpacto(scene, posVitima.x, posVitima.z)
              arremessarPeca(vitima, { x: posVitima.x - de.x, z: posVitima.z - de.z }, () => {
                removerVitima()
                umaParte()
              })
              comemorarAliadas()
            },
          )
          return
        }

        // peão capturando peão: às vezes o derrotado se rende com a honra de um samurai — o vencedor
        // vai até ele com a katana guardada e se curva em respeito; o derrotado vira de frente pra
        // ele, ajoelha, faz uma reverência profunda e tomba pra frente, entre pétalas de cerejeira
        const acoesVitima = vitima.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
        const acoesAtacante = atacante.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
        if (
          tipoAtacante === 'p' &&
          vitima.userData.tipo === 'p' &&
          acoesVitima?.Sacrificio &&
          acoesAtacante?.Reverencia &&
          Math.random() < CHANCE_HONRA_SAMURAI
        ) {
          novaSequenciaRPG(atacante)
          const de = { x: atacante.position.x, z: atacante.position.z }
          const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
          const parada = DISTANCIA_REVERENCIA * atacante.scale.x
          const fracao = Math.max(0, (distancia - parada) / distancia)
          const ate = { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }
          virarRPG(atacante, rumoEntre(de, posVitima), () =>
            deslocarRPG(atacante, de, ate, () => {
              pararRPG(atacante)
              tocarClipeRPGUmaVez(atacante, 'Reverencia', { entrada: 0.3, saida: 0.4 })
              novaSequenciaRPG(vitima)
              mostrarEspadaRPG(vitima, false)
              // quem luta de espada se despede com outro som: sino de capela e trompas, no lugar da flauta de bambu
              tocarSom(atacante.userData.arma === 'espada' ? 'honra:espada' : 'honra')
              animarPetalas(scene, vitima.position.clone(), 5200)
              virarRPG(vitima, rumoEntre(vitima.position, atacante.position), () =>
                tocarClipeRPGUmaVez(vitima, 'Sacrificio', {
                  entrada: 0.3,
                  voltarAoParado: false,
                  aoTerminar: () => {
                    // caído, imóvel — some aos poucos, e o vencedor entra na casa
                    const definirOpacidade = prepararParaSumir(vitima)
                    const inicioSumir = performance.now()
                    const sumir = (agora: number) => {
                      const t = Math.min(1, (agora - inicioSumir) / 900)
                      definirOpacidade(1 - t)
                      if (t < 1) {
                        requestAnimationFrame(sumir)
                        return
                      }
                      removerVitima()
                      seguirParaDestino()
                    }
                    requestAnimationFrame(sumir)
                  },
                }),
              )
            }),
          )
          return
        }

        // sorteia o estilo do golpe a cada captura, pra não ser sempre a mesma animação
        const estilo: EstiloAtaque = Math.random() < 0.5 ? 'corte' : 'derrubada'
        const senha = novaSequenciaRPG(atacante)
        // só rei, dama e bispo atacam à distância (cada um com o seu poder); peão e torre vão até a
        // vítima e golpeiam com o corpo (o peão com a espada)
        const aDistancia = ehRPG && (tipoAtacante === 'b' || tipoAtacante === 'q' || tipoAtacante === 'k')

        // no instante em que o golpe acerta: a vítima cai (pra longe do atacante) e as aliadas
        // por perto comemoram
        const acertar = (direcaoGolpe: { x: number; z: number }) => {
          tocarSom(`queda:${vitima.userData.tipo as string}`)
          animarImpacto(scene, posVitima.x, posVitima.z)
          const nocaute = estilo === 'derrubada' ? direcaoGolpe : undefined
          animarQuedaEDesaparecimento(
            vitima,
            () => {
              removerVitima()
              seguirParaDestino()
            },
            nocaute,
            direcaoGolpe,
          )
          comemorarAliadas()
        }
        // o retalhamento: o peão de katana de quem comprou o ataque especial dá uma série de cortes rápidos e a peça
        // se desfaz em pedaços
        const retalha =
          tipoAtacante === 'p' &&
          ehRPG &&
          armaDoPeaoNoTabuleiro(atacante) === 'katana' &&
          corAtacante === vestimenta.cor &&
          (retalhamentoDeTeste || opcaoLiberada(personalizacaoAtual(), 'p', 'golpe', 'retalhamento'))
        const retalhar = () => {
          const cortes = 4
          let feitos = 0
          const corDoCorte = materiaisPorFaccao[corAtacante].brilho.color
          const proximo = () => {
            if (!vigente() || !sequenciaRPGValida(atacante, senha)) return
            if (feitos === cortes) {
              tocarSom('retalho:pedacos')
              despedacar(scene, vitima, () => {
                removerVitima()
                seguirParaDestino()
              })
              comemorarAliadas()
              guardarEspadaRPG(atacante, senha)
              return
            }
            feitos++
            const golpes = clipesRPGComPrefixo(atacante, 'Attack')
            const tocou = golpes.length > 0 && tocarClipeRPGUmaVez(atacante, golpes[(feitos - 1) % golpes.length], { entrada: 0.06, voltarAoParado: false, velocidade: 2.3, aoTerminar: proximo })
            window.setTimeout(() => {
              if (!vigente()) return
              tocarSom('retalho:corte')
              rastroDeCorte(scene, vitima, corDoCorte)
            }, 170)
            if (!tocou) window.setTimeout(proximo, 300)
          }
          proximo()
        }
        const golpear = () => {
          if (retalha) {
            retalhar()
            return
          }
          // a torre só bate de marreta (ou machado, ou maça) se tiver uma na mão; sem arma, golpeia como as outras
          if (tipoAtacante === 'r' && ehRPG && ARMAS_DA_TORRE.includes(atacante.userData.arma as string)) {
            pararRPG(atacante)
            tocarSom('marreta:ergue')
            const armaDaTorre = atacante.userData.arma as string
            const continua = () => vigente() && sequenciaRPGValida(atacante, senha)
            const fim = () => {
              removerVitima()
              seguirParaDestino()
            }
            if (armaDaTorre === 'machado') {
              // o machado corta a peça ao meio
              baterComMarreta(atacante, corAtacante, continua, () => {
                tocarSom('machado:corte')
                animarImpacto(scene, posVitima.x, posVitima.z)
                rachadurasNoTabuleiro(scene, posVitima.x, posVitima.z, 0.9, 1300)
                tremerTabuleiro(scene, 0.06, 300)
                cortarAoMeio(scene, vitima, { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }, fim)
                comemorarAliadas()
              })
              return
            }
            if (armaDaTorre === 'maca') {
              // a maça: a peça fica presa nos espinhos, a torre sacode e ela cai no tabuleiro
              const maca = baterComMarreta(
                atacante,
                corAtacante,
                continua,
                () => {
                  tocarSom('maca:espinhos')
                  tocarSom('maca:sacode', (MACA_ERGUIDA_ATE_MS - MARRETA_PANCADA_MS) / 1000)
                  animarImpacto(scene, posVitima.x, posVitima.z)
                  tremerTabuleiro(scene, 0.08, 360)
                  const acoesDaVitima = vitima.userData.acoesRPG as Record<string, THREE.AnimationAction> | undefined
                  if (acoesDaVitima?.Morte) {
                    novaSequenciaRPG(vitima)
                    mostrarEspadaRPG(vitima, false)
                    tocarClipeRPGUmaVez(vitima, 'Morte', { entrada: 0.1, voltarAoParado: false })
                  }
                  // presa nos espinhos: vai junto com a cabeça da maça
                  maca.attach(vitima)
                  comemorarAliadas()
                },
                () => {
                  tocarSom('maca:solta')
                  cairDaMaca(piecesGroup, vitima, fim)
                },
              )
              return
            }
            baterComMarreta(atacante, corAtacante, continua, () => {
              tocarSom('marreta:impacto')
              tocarSom('esmagado', 0.05)
              animarImpacto(scene, posVitima.x, posVitima.z)
              ondaDaMarretada(scene, posVitima.x, posVitima.z, materiaisPorFaccao[corAtacante].detalhe.color)
              // rachaduras de verdade na madeira e o tabuleiro inteiro tremendo
              rachadurasNoTabuleiro(scene, posVitima.x, posVitima.z)
              poeiraDaPancada(scene, posVitima.x, posVitima.z)
              tremerTabuleiro(scene)
              esmagarPeca(vitima, fim)
              comemorarAliadas()
            })
            return
          }
          const direcaoGolpe = { x: posVitima.x - atacante.position.x, z: posVitima.z - atacante.position.z }
          const alvo = vitima.position.clone().add(new THREE.Vector3(0, 0.45 * vitima.scale.y, 0))
          const corPoder = materiaisPorFaccao[corAtacante].brilho.color
          const acerto = () => acertar(direcaoGolpe)
          // o poder sai no instante do golpe; o acerto (a queda da vítima) só quando ele chega nela
          const armaAtacante = atacante.userData.arma as string | undefined
          const fimDoPoder = () => {
            removerVitima()
            seguirParaDestino()
          }
          const noGolpe = () => {
            if (!aDistancia) {
              tocarSom(`golpe:${tipoAtacante}`)
              acerto()
            } else if (armaAtacante === 'cajado') {
              // o raio, como era o da rainha, saindo da mão do cajado
              tocarSom('raio:q')
              lancarRaioDaDama(scene, atacante, alvo, corPoder, acerto, tipoAtacante === 'b' ? 'LeftHand' : 'RightHand')
            } else if (armaAtacante === 'cristal') {
              convocarCristal(scene, vitima, atacante.position.clone(), corPoder, () => tocarSom('cristal:convoca'), () => {
                tocarSom('cristal:quebra')
                acerto()
              })
            } else if (armaAtacante === 'cetro') {
              tocarSom('gravidade')
              afundarPelaGravidade(scene, vitima, corPoder, fimDoPoder)
              comemorarAliadas()
            } else if (armaAtacante === 'lua') {
              tocarSom('tornado')
              tornadoDaLua(scene, vitima, direcaoGolpe, corPoder, fimDoPoder)
              comemorarAliadas()
            } else if (tipoAtacante === 'b') {
              tocarSom('magia:b')
              lancarPoderDoBispo(scene, atacante, alvo, corPoder, () => {
                tocarSom('explosao:b')
                acerto()
              })
            } else if (tipoAtacante === 'q') {
              tocarSom('raio:q')
              lancarRaioDaDama(scene, atacante, alvo, corPoder, acerto)
            } else {
              tocarSom('onda:k')
              lancarOndaDoRei(scene, atacante, alvo, materialCoroa.color, acerto)
            }
          }
          tocarGolpeRPG(atacante)
          animarAtaqueEspada(atacante, direcaoGolpe, estilo, noGolpe, () => {
            if (sequenciaRPGValida(atacante, senha)) guardarEspadaRPG(atacante, senha)
          })
        }
        // o peão RPG desembainha a espada primeiro (e vai até a vítima com ela na mão), golpeia e
        // guarda de volta — a espada entra na bainha antes de a vítima terminar de sumir
        // o som do saque cai no instante em que a lâmina deixa a bainha: o da katana, agudo; o da espada, mais grave
        const espadaDoPeao = atacante.userData.espadaRPG as EspadaRPG | undefined
        const armaDoPeao = atacante.userData.arma as string | undefined
        if (espadaDoPeao && !espadaDoPeao.fora && (armaDoPeao === 'katana' || armaDoPeao === 'espada')) {
          tocarSom(armaDoPeao === 'katana' ? 'katana:saca' : 'espada:saca', espadaDoPeao.segundoSaque)
        }
        sacarEspadaRPG(atacante, senha, () => {
          if (!ehRPG) {
            golpear()
            return
          }
          const rumo = rumoEntre(atacante.position, posVitima)
          if (aDistancia) {
            virarRPG(atacante, rumo, golpear)
            return
          }
          // corpo a corpo: vira, vai até a vítima (para no alcance do golpe) e golpeia
          const alcance = (ALCANCE_GOLPE[tipoAtacante] ?? 0.55) * atacante.scale.x
          const de = { x: atacante.position.x, z: atacante.position.z }
          const distancia = Math.hypot(posVitima.x - de.x, posVitima.z - de.z)
          virarRPG(atacante, rumo, () => {
            if (distancia <= alcance + 0.05) {
              golpear()
              return
            }
            const fracao = (distancia - alcance) / distancia
            const ate = { x: de.x + (posVitima.x - de.x) * fracao, z: de.z + (posVitima.z - de.z) * fracao }
            deslocarRPG(atacante, de, ate, golpear)
          })
        })
        return
      }

      if (vitima) removerSemAnimacao(vitima)
      seguirParaDestino()

      function removerSemAnimacao(mesh: THREE.Group) {
        piecesGroup.remove(mesh)
        if (casaDaVitima && pieceMeshBySquare.get(casaDaVitima) === mesh) pieceMeshBySquare.delete(casaDaVitima)
      }
    }

    /** Partida do jogador encerrada por desistência (o tabuleiro ainda teria lances legais). */
    function partidaDesistida(): boolean {
      return partidaAtualRef.current?.status === 'FINALIZADA' && !chessRef.current.isGameOver()
    }

    function jogarLanceDaMaquina() {
      if (partidaDesistida() || salaRef.current) return
      const chess = chessRef.current
      // vezDaMaquinaRef.current já true = já tem um cálculo de lance em andamento — chamar de
      // novo nesse meio-tempo (ex: efeito remontado em dev) faria duas buscas concorrentes brigando
      // pelo mesmo tabuleiro, e a segunda a terminar tentaria aplicar um lance já ilegal
      if (chess.isGameOver() || chess.turn() === corHumanoRef.current || vezDaMaquinaRef.current) return
      vezDaMaquinaRef.current = true
      atualizarStatusTexto()
      const minhaGeracao = geracao
      // as partidas de antes da escolha de dificuldade jogavam como o difícil
      const dificuldade = partidaAtualRef.current?.dificuldade ?? 'dificil'
      window.setTimeout(async () => {
        if (minhaGeracao !== geracao) return
        const lance = await escolherJogadaDaMaquina(chess, livroRef.current, dificuldade)
        // outra partida (ou novo jogo) entrou enquanto a máquina pensava: esse lance era da anterior
        if (minhaGeracao !== geracao) return
        // o jogador desistiu enquanto a máquina pensava — o lance não entra mais
        if (!lance || partidaDesistida()) {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
          return
        }
        executarLanceComAnimacao(lance, () => {
          vezDaMaquinaRef.current = false
          atualizarStatusTexto()
        })
      }, usaLivro(dificuldade) && buscarNoLivro(chess, livroRef.current) ? PAUSA_MAQUINA_LIVRO_MS : PAUSA_MAQUINA_MS)
    }

    /** Anda com os lances do adversário, um de cada vez e nunca por cima de outra animação. */
    function processarFilaDaSala() {
      if (animandoDaSala || lancesEmAndamento > 0) return
      const san = filaDaSala.shift()
      if (!san) return
      animandoDaSala = true
      // trava os cliques enquanto a peça do adversário anda
      vezDaMaquinaRef.current = true
      executarLanceComAnimacao(san, () => {
        animandoDaSala = false
        vezDaMaquinaRef.current = false
        atualizarStatusTexto()
        processarFilaDaSala()
      })
    }

    /** Retorno ao tocar numa peça: som e, no celular, uma vibração curta. */
    function tocarToque(som: string) {
      if (!configRef.current.toque) return
      tocarSom(som)
      navigator.vibrate?.(12)
    }

    function tentarSelecionar(square: Square) {
      if (!partidaAtualRef.current || partidaDesistida()) return
      const salaSemJogo = salaRef.current && salaRef.current.estado?.status !== 'andamento'
      if (salaSemJogo) return
      const chess = chessRef.current
      if (chess.isGameOver()) return
      if (chess.turn() !== corHumanoRef.current || vezDaMaquinaRef.current) {
        // clicou numa peça do próprio time fora da vez — ela reage em vez de simplesmente ignorar
        const pecaClicada = chess.get(square)
        const mesh = pieceMeshBySquare.get(square)
        if (pecaClicada && pecaClicada.color === corHumanoRef.current && mesh) {
          const dx = camera.position.x - mesh.position.x
          const dz = camera.position.z - mesh.position.z
          const dist = Math.hypot(dx, dz) || 1
          tocarToque('recusa')
          animarRecusa(mesh, { x: dx / dist, z: dz / dist })
        }
        return
      }
      const peca = chess.get(square)
      if (!peca || peca.color !== corHumanoRef.current) {
        selecionadaRef.current = null
        limparDestaques()
        return
      }
      const jogadas = chess.moves({ square, verbose: true })
      const destinos = jogadas.map((j) => j.to as Square)
      selecionadaRef.current = square
      destinosRef.current = destinos
      destacarSelecao(square, destinos)

      tocarToque(`selecionar:${peca.type}`)
      // peças aliadas por perto reagem (gesto sorteado) na direção da peça que acabou de ser
      // selecionada, cada uma com um pequeno atraso pra não ficarem todas sincronizadas
      const posSel = squareToPos(square)
      let atrasoReacao = 0
      for (const aliada of pecasAliadasProximas(square, peca.color, 2.2)) {
        const pos = squareToPos(aliada.square)
        animarGestoAmigavel(aliada.mesh, { x: posSel.x - pos.x, z: posSel.z - pos.z }, undefined, atrasoReacao)
        atrasoReacao += 120
      }
    }

    function tentarMover(destino: Square) {
      const chess = chessRef.current
      const origem = selecionadaRef.current
      if (!origem) return
      if (!destinosRef.current.includes(destino)) {
        selecionadaRef.current = null
        limparDestaques()
        tentarSelecionar(destino)
        return
      }
      selecionadaRef.current = null
      destinosRef.current = []
      limparDestaques()
      const jogar = (promotion?: PecaPromocao) => {
        const conexaoDaSala = salaRef.current?.conexao
        const numeroDoLance = chess.history().length
        executarLanceComAnimacao({ from: origem, to: destino, promotion }, () => {
          atualizarStatusTexto()
          if (salaRef.current) processarFilaDaSala()
          else if (!chess.isGameOver()) jogarLanceDaMaquina()
        })
        conexaoDaSala?.enviarLance(numeroDoLance, origem, destino, promotion)
      }
      if (!chess.moves({ square: origem, verbose: true }).some((m) => m.to === destino && m.promotion)) {
        jogar()
        return
      }
      // o peão chegou ao outro lado: o lance só sai depois de escolher a peça. Cancelando, ele fica
      // onde está e a vez continua de quem ia jogar
      resolverPromocaoRef.current = (peca) => {
        resolverPromocaoRef.current = null
        setPromocaoPendente(null)
        if (peca) jogar(peca)
      }
      setPromocaoPendente(chess.turn())
    }

    function onClick(event: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(squareMeshes)
      if (hits.length === 0) return

      const square = hits[0].object.userData.square as Square
      if (selecionadaRef.current) {
        tentarMover(square)
      } else {
        tentarSelecionar(square)
      }
    }
    renderer.domElement.addEventListener('click', onClick)

    acoesRef.current = {
      // carrega uma partida salva (PGN) ou começa uma nova (pgn vazio) — usado tanto pra
      // retomar a partida em andamento ao abrir quanto pra começar uma partida nova depois
      carregarPgn(pgn: string, corHumano: 'w' | 'b') {
        setTela('jogo')
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        const chess = chessRef.current
        corHumanoRef.current = corHumano
        setCorDoJogador(corHumano)
        virarCameraPara(corHumano === 'w' ? 1 : -1)
        if (pgn) {
          try {
            chess.loadPgn(pgn)
          } catch {
            chess.reset()
          }
        } else {
          chess.reset()
          tocarSom('inicio')
        }
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        atualizarStatusTexto()
        if (!chess.isGameOver() && chess.turn() !== corHumanoRef.current) jogarLanceDaMaquina()
      },
      // partida contra outra pessoa: o tabuleiro inteiro a partir do que o servidor mandou
      carregarSala() {
        const estado = salaRef.current?.estado
        if (!estado) return
        setTela('jogo')
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        const chess = chessRef.current
        corHumanoRef.current = estado.minhaCor
        setCorDoJogador(estado.minhaCor)
        virarCameraPara(estado.minhaCor === 'w' ? 1 : -1)
        chess.reset()
        for (const san of estado.lances) chess.move(san)
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        atualizarStatusTexto()
      },
      // a conexão voltou ou a partida mudou de fase: confere se este tabuleiro está igual ao do servidor
      receberEstadoDaSala(estado) {
        const atual = salaRef.current
        if (!atual) return
        atual.estado = estado
        const local = [...chessRef.current.history(), ...filaDaSala]
        const faltaUm = estado.lances.length === local.length + 1 && local.every((san, i) => san === estado.lances[i])
        if (faltaUm) {
          filaDaSala.push(estado.lances[estado.lances.length - 1])
          processarFilaDaSala()
        } else if (estado.lances.length !== local.length || local.some((san, i) => san !== estado.lances[i])) {
          acoesRef.current?.carregarSala()
        } else {
          atualizarStatusTexto()
        }
      },
      receberLanceDaSala(lance) {
        const atual = salaRef.current
        if (!atual?.estado) return
        atual.estado = { ...atual.estado, empate: null, lances: [...atual.estado.lances.slice(0, lance.n), lance.san] }
        // o nosso próprio lance voltando: já está no tabuleiro desde o clique
        if (lance.n < chessRef.current.history().length + filaDaSala.length) return
        filaDaSala.push(lance.san)
        processarFilaDaSala()
      },
      receberFimDaSala(resultado, motivo) {
        const atual = salaRef.current
        if (!atual?.estado) return
        atual.estado = { ...atual.estado, status: 'fim', resultado, motivo }
        if (partidaAtualRef.current) partidaAtualRef.current.status = 'FINALIZADA'
        selecionadaRef.current = null
        destinosRef.current = []
        limparDestaques()
        if ((motivo === 'desistencia' || motivo === 'tempo') && resultado !== 'empate') comemorarFimDaSala(resultado === 'brancas' ? 'w' : 'b', motivo)
        atualizarStatusTexto()
      },
      // volta pra tela inicial: as peças na posição de início, vistas de lado. A partida que estava
      // aberta continua salva, a cada lance, e volta pelo "Continuar partida"
      mostrarMenu() {
        partidaAtualRef.current = null
        corHumanoRef.current = 'w'
        comemoracaoDisparada = false
        setResultadoOverlay(null)
        setTela('menu')
        chessRef.current.reset()
        selecionadaRef.current = null
        destinosRef.current = []
        vezDaMaquinaRef.current = false
        novoTabuleiro()
        sincronizarPecas(true)
        limparDestaques()
        atualizarStatusTexto()
        irParaVistaDoMenu()
      },
      // o jogador desiste: a partida termina como vitória da máquina (conta como derrota), vai pras
      // finalizadas, as peças da máquina comemoram e o tabuleiro fica parado na posição
      desistir() {
        if (salaRef.current) {
          // quem decide é o servidor: a partida termina quando ele avisar os dois
          salaRef.current.conexao.desistir()
          return
        }
        const partida = partidaAtualRef.current
        const chess = chessRef.current
        if (!partida || partida.status === 'FINALIZADA' || chess.isGameOver()) return
        partida.status = 'FINALIZADA'
        partida.resultado = 'A máquina venceu (você desistiu)'
        partida.pgn = chess.pgn()
        partida.atualizadaEm = Date.now()
        selecionadaRef.current = null
        destinosRef.current = []
        limparDestaques()
        salvarPartida(partida)
          .then(() => {
            setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
            setPartidasFinalizadas((prev) => [partida, ...prev.filter((p) => p.id !== partida.id)])
          })
          .catch(() => {
            // sem servidor no momento — fica marcada aqui e vai no próximo salvamento
          })
        const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
        if ((partida.dificuldade ?? 'dificil') === 'dificil') registrarAprendizadoDaPartida(chess.history({ verbose: true }), corMaquina === 'w' ? 'BRANCAS' : 'PRETAS', [corMaquina])
        if (!comemoracaoDisparada) {
          comemoracaoDisparada = true
          let atraso = 0
          for (const linha of chess.board()) {
            for (const casa of linha) {
              if (!casa || casa.color !== corMaquina) continue
              const mesh = pieceMeshBySquare.get(casa.square)
              if (mesh) animarComemoracao(mesh, atraso)
              atraso += 60
            }
          }
        }
        tocarSom('derrota')
        setResultadoOverlay('desistiu')
        atualizarStatusTexto()
      },
      // pedido de empate: contra a máquina, ela pensa um instante e aceita se não estiver bem na frente; contra outra
      // pessoa, o pedido vai pela partida ao vivo e quem decide é ela
      pedirEmpate() {
        const chess = chessRef.current
        const partida = partidaAtualRef.current
        const noLance = chess.history().length
        if (!partida || partida.status === 'FINALIZADA' || chess.isGameOver() || ultimoPedidoDeEmpate === noLance) return
        if (salaRef.current) {
          ultimoPedidoDeEmpate = noLance
          salaRef.current.conexao.pedirEmpate()
          atualizarStatusTexto()
          return
        }
        if (chess.turn() !== corHumanoRef.current || vezDaMaquinaRef.current) return
        ultimoPedidoDeEmpate = noLance
        setEmpate({ tipo: 'pensando' })
        atualizarStatusTexto()
        const minhaGeracao = geracao
        window.setTimeout(() => {
          // outra partida entrou, ou a pessoa jogou enquanto a máquina pensava: o pedido era de outra posição
          if (minhaGeracao !== geracao || partida.status === 'FINALIZADA' || chess.history().length !== noLance) {
            if (minhaGeracao === geracao) setEmpate(null)
            return
          }
          const corMaquina: 'w' | 'b' = corHumanoRef.current === 'w' ? 'b' : 'w'
          if (!maquinaAceitaEmpate(chess, corMaquina, partida.dificuldade ?? 'dificil')) {
            setEmpate({ tipo: 'recusado', por: 'maquina' })
            atualizarStatusTexto()
            return
          }
          setEmpate(null)
          partida.status = 'FINALIZADA'
          partida.resultado = EMPATE_POR_ACORDO
          partida.pgn = chess.pgn()
          partida.atualizadaEm = Date.now()
          selecionadaRef.current = null
          destinosRef.current = []
          limparDestaques()
          salvarPartida(partida)
            .then(() => {
              setPartidasEmAndamento((prev) => prev.filter((p) => p.id !== partida.id))
              setPartidasFinalizadas((prev) => [partida, ...prev.filter((p) => p.id !== partida.id)])
            })
            .catch(() => {
              // sem servidor no momento — fica marcada aqui e vai no próximo salvamento
            })
          if ((partida.dificuldade ?? 'dificil') === 'dificil') registrarAprendizadoDaPartida(chess.history({ verbose: true }), 'EMPATE', [corMaquina])
          atualizarStatusTexto()
        }, PAUSA_MAQUINA_MS)
      },
      atualizarTextos: atualizarStatusTexto,
      aplicarQualidade,
      aplicarTelaMovel: liberarCamera,
      revestir: () => sincronizarPecas(),
    }

    sincronizarPecas()
    atualizarStatusTexto()

    // os modelos RPG das peças carregam em segundo plano — quando (e se) chegarem, re-sincroniza
    // pra trocar as peças já desenhadas (geométricas) pelos modelos novos, sem recarregar a página
    let montado = true
    garantirModelosRPG(() => {
      if (montado) sincronizarPecas()
    })

    /** As coordenadas do lado de quem está olhando, e de pé pra essa pessoa. */
    function virarCoordenadas(lado: 1 | -1) {
      labelsGroup.children.forEach((rotulo, i) => {
        if (i < 8) rotulo.position.z = 4.35 * lado
        else rotulo.position.x = -4.35 * lado
        rotulo.rotation.z = lado === 1 ? 0 : Math.PI
      })
    }

    // a câmera viaja em torno do tabuleiro: da vista de lado do menu até o lado de quem joga, e de um
    // lado pro outro quando a cor muda
    interface PoseCamera {
      raio: number
      phi: number
      theta: number
    }
    let giroCamera: { de: PoseCamera; para: PoseCamera; inicio: number; coordenadasViradas: boolean } | null = null
    let emMenu = true

    function poseAtualDaCamera(): PoseCamera {
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
      return { raio: s.radius, phi: s.phi, theta: s.theta }
    }

    function colocarCamera(pose: PoseCamera) {
      camera.position.setFromSphericalCoords(pose.raio, pose.phi, pose.theta).add(controls.target)
    }

    /** Arrastar pra girar só vale na partida, e se a tela do jogo estiver como movimentável. */
    function liberarCamera() {
      if (!giroCamera) controls.enabled = !emMenu && configRef.current.telaMovel
    }

    function levarCameraPara(para: PoseCamera, instantaneo = false) {
      const de = poseAtualDaCamera()
      const distancia = Math.abs(diferencaAngular(de.theta, para.theta)) + Math.abs(de.phi - para.phi) + Math.abs(de.raio - para.raio)
      // quem pediu menos movimento no sistema vai direto pro fim
      if (instantaneo || distancia < 0.001 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        colocarCamera(para)
        virarCoordenadas(ladoDaCamera)
        giroCamera = null
        liberarCamera()
        return
      }
      tocarSom('giro')
      giroCamera = { de, para, inicio: performance.now(), coordenadasViradas: false }
      controls.enabled = false
    }

    function atualizarGiroCamera(agora: number) {
      if (!giroCamera) return
      const { de, para } = giroCamera
      const t = Math.min(1, (agora - giroCamera.inicio) / GIRO_CAMERA_MS)
      const suave = t * t * (3 - 2 * t)
      colocarCamera({
        raio: de.raio + (para.raio - de.raio) * suave,
        phi: de.phi + (para.phi - de.phi) * suave,
        theta: de.theta + diferencaAngular(de.theta, para.theta) * suave,
      })
      // na metade do giro o tabuleiro está de lado: é quando a troca das coordenadas menos aparece
      if (t >= 0.5 && !giroCamera.coordenadasViradas) {
        giroCamera.coordenadasViradas = true
        virarCoordenadas(ladoDaCamera)
      }
      if (t >= 1) {
        giroCamera = null
        liberarCamera()
      }
    }

    /** A distância em que o tabuleiro cabe inteiro, olhando dessa inclinação e desse lado. */
    function raioQueEnquadra(phi: number, theta: number): number {
      const posicao = camera.position.clone()
      const orientacao = camera.quaternion.clone()
      colocarCamera({ raio: distanciaPadrao, phi, theta })
      camera.lookAt(controls.target)
      const raio = distanciaQueEnquadra()
      camera.position.copy(posicao)
      camera.quaternion.copy(orientacao)
      camera.updateMatrixWorld()
      return raio
    }

    /** Põe a câmera do lado da cor da pessoa. Na troca de partida, mantém a inclinação e o zoom que ela
     * escolheu; vindo do menu, volta pra vista de jogo. */
    function virarCameraPara(lado: 1 | -1) {
      const atual = poseAtualDaCamera()
      const vemDoMenu = emMenu
      emMenu = false
      ladoDaCamera = lado
      const theta = lado === 1 ? 0 : Math.PI
      if (vemDoMenu) distanciaAutomatica = raioQueEnquadra(INCLINACAO_CAMERA_JOGO, theta)
      levarCameraPara({ raio: vemDoMenu ? distanciaAutomatica : atual.raio, phi: vemDoMenu ? INCLINACAO_CAMERA_JOGO : atual.phi, theta })
    }

    /** Vista da tela inicial: de lado, com as brancas de um lado e as pretas do outro, em qualquer tela. Na tela em
     * pé a câmera recua até o tabuleiro caber na largura, e os botões ficam embaixo dele. */
    function irParaVistaDoMenu(instantaneo = false) {
      emMenu = true
      ladoDaCamera = 1
      levarCameraPara(
        { raio: Math.max(RAIO_CAMERA_MENU, raioQueEnquadra(INCLINACAO_CAMERA_MENU, Math.PI / 2)), phi: INCLINACAO_CAMERA_MENU, theta: Math.PI / 2 },
        instantaneo,
      )
    }

    /** Resolução que vale agora, pela qualidade escolhida. */
    function resolucaoDoJogo(largura: number, altura: number): number {
      return QUALIDADES[configRef.current.qualidade].resolucao(largura, altura)
    }

    function aplicarQualidade(qualidade: QualidadeXadrez) {
      const { sombras } = QUALIDADES[qualidade]
      dirLight.castShadow = sombras > 0
      if (sombras > 0 && dirLight.shadow.mapSize.x !== sombras) {
        dirLight.shadow.mapSize.set(sombras, sombras)
        dirLight.shadow.map?.dispose()
        dirLight.shadow.map = null
      }
      onResize()
    }

    const relogio = new THREE.Clock()
    let frameId = 0
    let ultimoQuadro = 0
    function animate() {
      frameId = requestAnimationFrame(animate)
      // na qualidade leve, no máximo 30 quadros por segundo: metade do trabalho pro aparelho fraco. O tempo que passou
      // entra todo no quadro seguinte, então as animações andam no mesmo ritmo
      const teto = QUALIDADES[configRef.current.qualidade].quadrosPorSegundo
      const agoraDoQuadro = performance.now()
      if (teto && agoraDoQuadro - ultimoQuadro < 1000 / teto - 2) return
      ultimoQuadro = agoraDoQuadro
      const delta = relogio.getDelta()
      const agora = performance.now()
      for (const peca of piecesGroup.children) {
        ;(peca.userData.mixer as THREE.AnimationMixer | undefined)?.update(delta)
        atualizarGestoRPG(peca, agora)
      }
      atualizarMarretadas(agora)
      atualizarGiroCamera(agora)
      if (xequeMesh.visible) xequeMat.opacity = 0.45 + 0.25 * ((Math.sin(agora / 260) + 1) / 2)
      controls.update()
      // nos testes com dois jogadores ao mesmo tempo, sem placa de vídeo, é o desenho que trava. O clique
      // nas casas depende das matrizes que o desenho atualizaria
      if (import.meta.env.DEV && (window as unknown as { __semDesenho?: boolean }).__semDesenho) {
        scene.updateMatrixWorld()
        camera.updateMatrixWorld()
      } else renderer.render(scene, camera)
    }
    animate()

    // distância da câmera que o enquadramento automático escolheu por último — se o jogador não mexeu
    // no zoom desde então, a próxima mudança de tamanho pode reajustar (aproximar ou afastar)
    const distanciaPadrao = camera.position.distanceTo(controls.target)
    let distanciaAutomatica = distanciaPadrao

    /** Menor distância (a partir da padrão) em que o tabuleiro inteiro cabe na tela — numa tela em pé
     * (celular) a câmera precisa ir mais pra trás pra caber a largura. */
    function distanciaQueEnquadra(): number {
      const direcao = camera.position.clone().sub(controls.target).normalize()
      const cantos = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * MEIA_LARGURA_TABULEIRO, 0, sz * MEIA_LARGURA_TABULEIRO)))
      const original = camera.position.clone()
      let distancia = distanciaPadrao
      for (; distancia < 90; distancia += 0.5) {
        camera.position.copy(controls.target).addScaledVector(direcao, distancia)
        camera.updateMatrixWorld()
        if (cantos.every((c) => {
          const p = c.clone().project(camera)
          return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.97
        })) break
      }
      camera.position.copy(original)
      camera.updateMatrixWorld()
      return distancia
    }

    function onResize() {
      const el = containerRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(resolucaoDoJogo(el.clientWidth, el.clientHeight))
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      const atual = camera.position.distanceTo(controls.target)
      const necessaria = distanciaQueEnquadra()
      if (emMenu) {
        irParaVistaDoMenu(true)
      } else if (giroCamera && Math.abs(giroCamera.para.raio - distanciaAutomatica) < 0.01) {
        // o menu ocupa a tela toda e a partida não: o giro que sai dele foi calculado no formato antigo
        distanciaAutomatica = raioQueEnquadra(giroCamera.para.phi, giroCamera.para.theta)
        giroCamera.para = { ...giroCamera.para, raio: distanciaAutomatica }
      } else if (atual < necessaria - 0.01 || Math.abs(atual - distanciaAutomatica) < 0.01) {
        // só mexe na câmera se o tabuleiro não cabe, ou se a distância ainda é a que o enquadramento
        // pôs (o jogador não deu zoom desde então)
        const direcao = camera.position.clone().sub(controls.target).normalize()
        camera.position.copy(controls.target).addScaledVector(direcao, necessaria)
        distanciaAutomatica = necessaria
      }
      controls.maxDistance = Math.max(20, necessaria * 1.3)
      // a névoa acompanha a distância: de longe o tabuleiro não some
      const fog = scene.fog as THREE.Fog
      fog.near = Math.max(11, necessaria - 2.5)
      fog.far = Math.max(55, necessaria + 41.5)
    }
    window.addEventListener('resize', onResize)
    // só no desenvolvimento: os testes conferem o que está dentro do desenho 3D (casa em xeque, câmera)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __xadrez?: object }).__xadrez = {
        casaEmXeque: () => (xequeMesh.visible ? (xequeMesh.userData.casa as string) : null),
        /** Veste as peças de quem joga como se fosse a escolha da conta. */
        vestirParaTeste: (escolhas: Record<string, Record<string, string>> | null, retalhamento = false) => {
          vestimentaDeTeste = escolhas
          retalhamentoDeTeste = retalhamento
          sincronizarPecas()
        },
        /** O que as conquistas contam nessas partidas. */
        contarConquistas: (partidas: PartidaXadrez[]) => contarPartidas(partidas),
        /** As partes da personalização que a peça daquela casa está vestindo. */
        vestimentaDaCasa: (casa: string) => {
          const nomes: string[] = []
          pieceMeshBySquare.get(casa)?.traverse((filho) => {
            if (filho.name.startsWith('vestimenta:')) nomes.push(filho.name)
          })
          return nomes
        },
        /** As partes da katana do modelo que aparecem na peça da casa. */
        katanaDaCasa: (casa: string) => {
          const partes: string[] = []
          pieceMeshBySquare.get(casa)?.traverse((filho) => {
            const material = filho.userData.material as string | undefined
            if (filho.visible && material && ['EspadaLamina', 'EspadaCabo', 'CaboBainha', 'BainhaKatana'].includes(material)) partes.push(material)
          })
          return partes
        },
        distanciaCamera: () => camera.position.distanceTo(controls.target),
        /** Câmera perto de uma casa, pras fotos dos efeitos (theta em graus, 0 = do lado das brancas). */
        aproximarDaCasa: (casa: string, raio = 4.5, theta = 0, inclinacao = 55) => {
          const { x, z } = squareToPos(casa)
          controls.target.set(x, 0.5, z)
          colocarCamera({ raio, phi: THREE.MathUtils.degToRad(inclinacao), theta: THREE.MathUtils.degToRad(theta) })
          camera.lookAt(controls.target)
          controls.update()
        },
        /** Lance ou máquina ainda em andamento. */
        ocupado: () => vezDaMaquinaRef.current || lancesEmAndamento > 0,
        /** Lado da câmera (z positivo = brancas perto da tela) e se ela ainda está girando. */
        camera: () => ({ z: camera.position.z, girando: giroCamera !== null, coordenadaA: labelsGroup.children[0].position.z, distancia: camera.position.distanceTo(controls.target), distanciaIdeal: distanciaQueEnquadra() }),
        /** Onde a casa aparece no tabuleiro, em pixels da janela. */
        casaNaTela: (casa: string) => {
          const { x, z } = squareToPos(casa)
          const p = new THREE.Vector3(x, 0, z).project(camera)
          const r = renderer.domElement.getBoundingClientRect()
          return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
        },
        /** O navegador já liberou o som, e o som ambiente está tocando? */
        estadoDoSom: () => ({ destravado: somDestravado(), ambiente: ambienteTocando() }),
        /** Câmera na vista da tela inicial, resolução do desenho e sombras: o que a configuração muda. */
        cena: () => ({ menu: emMenu, resolucao: renderer.getPixelRatio(), sombras: dirLight.castShadow, arrastavel: controls.enabled, theta: poseAtualDaCamera().theta }),
        /** Golpes de marreta em andamento. */
        marretadas: () => marretadas.size,
        /** A vez já é da máquina: da peça da pessoa parar até o fim do lance dela. */
        vezDaMaquina: () => vezDaMaquinaRef.current,
        sala: () => salaRef.current?.estado ?? null,
        /** Cada peça do motor tem a sua peça 3D, do tipo/cor certos, na cena e no centro da casa — e nada sobrando. */
        problemasDoTabuleiro: () => {
          const problemas: string[] = []
          const casas = chessRef.current.board().flat().filter((c): c is NonNullable<typeof c> => !!c)
          for (const casa of casas) {
            const mesh = pieceMeshBySquare.get(casa.square)
            if (!mesh) {
              problemas.push(`sem peça 3D em ${casa.square}`)
              continue
            }
            if (mesh.userData.tipo !== casa.type || mesh.userData.cor !== casa.color) problemas.push(`peça errada em ${casa.square}`)
            if (mesh.parent !== piecesGroup) problemas.push(`peça de ${casa.square} fora da cena`)
            const alvo = squareToPosPeca(casa.square)
            const erro = Math.hypot(mesh.position.x - alvo.x, mesh.position.z - alvo.z)
            if (erro > 0.12) problemas.push(`peça de ${casa.square} fora do lugar (${erro.toFixed(2)})`)
          }
          if (pieceMeshBySquare.size !== casas.length) problemas.push(`mapa com ${pieceMeshBySquare.size} peças, motor com ${casas.length}`)
          if (piecesGroup.children.length !== casas.length) problemas.push(`cena com ${piecesGroup.children.length} peças, motor com ${casas.length}`)
          return problemas
        },
        /** Clica numa casa como quem joga: seleciona a peça ou, fora da vez, faz ela recusar. */
        clicarCasa: (casa: string) => tentarSelecionar(casa as Square),
        /** Quanto a peça da casa está fora do centro dela e do giro de descanso. */
        descansoDaPeca: (casa: string) => {
          const mesh = pieceMeshBySquare.get(casa as Square)
          if (!mesh) return null
          const alvo = squareToPosPeca(casa as Square)
          return { distancia: Math.hypot(mesh.position.x - alvo.x, mesh.position.z - alvo.z), giro: Math.abs(diferencaAngular(mesh.rotation.y, rumoDeDescanso(mesh))) }
        },
        /** Joga como o jogador (clique na peça e na casa). */
        jogar: (de: string, para: string) => {
          tentarSelecionar(de as Square)
          tentarMover(para as Square)
        },
        lancesDoJogador: () => (chessRef.current.turn() === corHumanoRef.current ? chessRef.current.moves({ verbose: true }).map((m) => [m.from, m.to]) : []),
        fen: () => chessRef.current.fen(),
        /** O lance que a máquina dessa dificuldade escolhe na posição, sem mexer no tabuleiro. */
        lanceDaMaquina: (fen: string, dificuldade: Dificuldade) => escolherJogadaDaMaquina(new Chess(fen), livroRef.current, dificuldade),
        dificuldadeDaPartida: () => partidaAtualRef.current?.dificuldade ?? null,
        /** Começa uma partida de teste a partir de um PGN (não aparece nas partidas do jogador). */
        carregarTeste: (pgn: string, cor: 'w' | 'b', dificuldade?: PartidaXadrez['dificuldade']) => {
          const agora = Date.now()
          partidaAtualRef.current = { id: `teste-${agora}`, jogador: '__teste__', corJogador: cor, pgn, status: 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora, ...(dificuldade ? { dificuldade } : {}) }
          acoesRef.current?.carregarPgn(pgn, cor)
        },
      }
    }
    // o espaço do tabuleiro também muda sem a janela mudar — recolher/abrir o menu, tela cheia
    const observador = new ResizeObserver(() => onResize())
    observador.observe(container)
    onResize()
    irParaVistaDoMenu(true)

    // interações casuais entre peças aliadas — de vez em quando (não depende de nenhuma ação do
    // jogador), duas peças do mesmo time que estejam próximas viram uma pra outra e acenam, só pra
    // dar uma sensação de vida no tabuleiro enquanto esperam a vez. Roda tanto na tela inicial quanto
    // numa partida de verdade.
    let interacaoTimeoutId: number | undefined
    function agendarProximaInteracaoAmigavel() {
      interacaoTimeoutId = window.setTimeout(tentarInteracaoAmigavel, 6000 + Math.random() * 7000)
    }
    function tentarInteracaoAmigavel() {
      const casasComPeca: { square: Square; color: 'w' | 'b' }[] = []
      for (const linha of chessRef.current.board()) {
        for (const casa of linha) {
          if (casa) casasComPeca.push({ square: casa.square as Square, color: casa.color })
        }
      }
      const origem = casasComPeca[Math.floor(Math.random() * casasComPeca.length)]
      const meshOrigem = origem ? pieceMeshBySquare.get(origem.square) : undefined
      if (origem && meshOrigem) {
        const aliadas = pecasAliadasProximas(origem.square, origem.color, 1.6)
        if (aliadas.length > 0) {
          const alvo = aliadas[Math.floor(Math.random() * aliadas.length)]
          const posOrigem = squareToPos(origem.square)
          const posAlvo = squareToPos(alvo.square)
          // as duas fazem o mesmo gesto sorteado, uma respondendo a outra com um pequeno atraso —
          // fica mais com cara de "interação" do que dois gestos aleatórios sem relação
          const gesto = POOL_GESTOS[Math.floor(Math.random() * POOL_GESTOS.length)]
          animarGestoAmigavel(meshOrigem, { x: posAlvo.x - posOrigem.x, z: posAlvo.z - posOrigem.z }, gesto)
          animarGestoAmigavel(alvo.mesh, { x: posOrigem.x - posAlvo.x, z: posOrigem.z - posAlvo.z }, gesto, 400)
        }
      }
      agendarProximaInteracaoAmigavel()
    }
    agendarProximaInteracaoAmigavel()

    return () => {
      montado = false
      window.clearTimeout(interacaoTimeoutId)
      window.removeEventListener('resize', onResize)
      observador.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('webglcontextrestored', gerarReflexoDoAmbiente)
      cancelAnimationFrame(frameId)
      controls.dispose()
      reflexo?.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  function fecharSala() {
    salaRef.current?.conexao.fechar()
    salaRef.current = null
    setSala(null)
    setConectadoNaSala(true)
    setRevanche(null)
  }

  function abrirSala(codigo: string) {
    const token = sessaoAtual()?.token
    if (!token) return
    fecharSala()

    const conexao = abrirConexaoDaSala(codigo, token, {
      estado(estado) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao) return
        setEmpate(estado.empate ? { tipo: estado.empate === estado.minhaCor ? 'enviado' : 'recebido' } : null)
        if (atual.estado) {
          acoesRef.current?.receberEstadoDaSala(estado)
        } else {
          atual.estado = estado
          const agora = Date.now()
          const encerrada = estado.status === 'fim' || estado.status === 'expirada' || estado.status === 'recusada'
          partidaAtualRef.current = { id: `sala-${codigo}`, jogador, corJogador: estado.minhaCor, pgn: '', status: encerrada ? 'FINALIZADA' : 'EM_ANDAMENTO', criadaEm: agora, atualizadaEm: agora }
          acoesRef.current?.carregarSala()
        }
        setSala(estado)
      },
      lance(lance) {
        if (salaRef.current?.conexao !== conexao) return
        // jogar em vez de responder recusa o empate pedido
        setEmpate((agora) => (agora?.tipo === 'recusado' ? agora : null))
        acoesRef.current?.receberLanceDaSala(lance)
      },
      fim(resultado, motivo) {
        if (salaRef.current?.conexao !== conexao) return
        setEmpate(null)
        acoesRef.current?.receberFimDaSala(resultado, motivo)
        setSala((atual) => atual && { ...atual, status: 'fim', resultado, motivo })
      },
      presenca(adversarioConectado) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao) return
        if (atual.estado) atual.estado = { ...atual.estado, adversarioConectado }
        setSala((estado) => estado && { ...estado, adversarioConectado })
      },
      conexao(ligada) {
        if (salaRef.current?.conexao === conexao) setConectadoNaSala(ligada)
      },
      recusada() {
        if (salaRef.current?.conexao === conexao) handleMenu()
      },
      revanche(codigo) {
        if (salaRef.current?.conexao === conexao) setRevanche({ codigo, vencida: false })
      },
      empate(de) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao || !atual.estado) return
        atual.estado = { ...atual.estado, empate: de }
        setEmpate({ tipo: de === atual.estado.minhaCor ? 'enviado' : 'recebido' })
        acoesRef.current?.atualizarTextos()
      },
      empateRecusado(de) {
        const atual = salaRef.current
        if (atual?.conexao !== conexao || !atual.estado) return
        atual.estado = { ...atual.estado, empate: null }
        setEmpate(de === atual.estado.minhaCor ? { tipo: 'recusado', por: 'adversario' } : null)
        acoesRef.current?.atualizarTextos()
      },
    })
    salaRef.current = { conexao, estado: null }
  }

  // espera o servidor: a lista de partidas do menu não pode trazer de volta o convite cancelado
  async function handleCancelarConvite() {
    if (sala) await recusarSala(sala.codigo).catch(() => {})
    handleMenu()
  }

  function handleNovoJogo() {
    setRevancheFalhou(false)
    // o resultado da partida (a taça) fica por cima da escolha de cor: sai antes
    setResultadoOverlay(null)
    setEscolhendoCor(true)
  }

  async function handleAceitarRevanche() {
    if (!revanche) return
    try {
      await entrarEmSala(revanche.codigo)
      abrirSala(revanche.codigo)
    } catch {
      setRevanche({ ...revanche, vencida: true })
    }
  }

  function handleRecusarRevanche() {
    if (revanche && !revanche.vencida) void recusarSala(revanche.codigo).catch(() => {})
    setRevanche(null)
  }

  function handleMenu() {
    fecharSala()
    setConfirmandoDesistencia(false)
    setEscolhendoCor(false)
    acoesRef.current?.mostrarMenu()
  }

  function handleContinuar() {
    const partida = partidasEmAndamento[0]
    if (partida) handleRetomarPartida(partida)
  }

  // não existe mais tela normal: o jogo ocupa sempre a página inteira. No celular, a tela cheia do navegador (que
  // esconde a barra de endereço) só pode ser pedida num toque: cada toque pede de novo, se ela tiver saído (o voltar do
  // celular, um gesto). No iPhone não existe pra página, e lá fica só o jogo ocupando a tela
  useEffect(() => {
    if (!ehCelular()) return
    const pedir = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    }
    window.addEventListener('pointerup', pedir)
    return () => window.removeEventListener('pointerup', pedir)
  }, [])

  // tabuleiro em tela cheia: a página de trás não rola junto
  useEffect(() => {
    if (!ocupaATela) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [ocupaATela])

  function handleDesistir() {
    setConfirmandoDesistencia(false)
    acoesRef.current?.desistir()
  }

  async function handleEscolherCor(cor: 'w' | 'b') {
    // numa partida amistosa, "Novo jogo" chama o mesmo amigo de novo, não a máquina
    if (sala) {
      try {
        const nova = await pedirRevanche(sala.codigo, cor)
        setEscolhendoCor(false)
        abrirSala(nova.codigo)
      } catch {
        setRevancheFalhou(true)
      }
      return
    }
    fecharSala()
    setEscolhendoCor(false)
    const nova = novaPartida(jogador, cor, config.dificuldade)
    try {
      await salvarPartida(nova)
    } catch {
      // sem servidor — segue mesmo assim, só não fica persistido até a conexão voltar
    }
    partidaAtualRef.current = nova
    setPartidasEmAndamento((prev) => [nova, ...prev])
    acoesRef.current?.carregarPgn('', cor)
  }

  // serve também pra rever uma partida terminada: como não sobra lance legal pro chess.js aceitar, o
  // tabuleiro fica naturalmente travado, sem precisar de nenhuma trava extra
  function handleRetomarPartida(partida: PartidaXadrez) {
    fecharSala()
    partidaAtualRef.current = partida
    acoesRef.current?.carregarPgn(partida.pgn, partida.corJogador)
  }

  const adversarioDaSala = sala && (sala.minhaCor === 'w' ? sala.pretas : sala.brancas)
  /** Quem joga de cada cor, pra aba de lances: você, a máquina ou o amigo. */
  const nomeDoLado = (cor: 'w' | 'b') => (cor === corDoJogador ? t('lances.voce') : sala ? ((cor === 'w' ? sala.brancas : sala.pretas) ?? '…') : t('lances.maquina'))
  const avisoDoEmpate =
    empate?.tipo === 'pensando'
      ? t('empate.pensando')
      : empate?.tipo === 'recusado'
        ? empate.por === 'maquina'
          ? t('empate.maquinaRecusou')
          : t('empate.adversarioRecusou', { nome: adversarioDaSala ?? '' })
        : empate?.tipo === 'enviado'
          ? t('empate.enviado', { nome: adversarioDaSala ?? '' })
          : null

  function handlePedirEmpate() {
    acoesRef.current?.pedirEmpate()
  }

  function handleResponderEmpate(aceito: boolean) {
    salaRef.current?.conexao.responderEmpate(aceito)
    setEmpate(null)
  }

  return (
    <div className="space-y-3">
      <div
        ref={tabuleiroRef}
        className={ocupaATela ? `fixed inset-0 z-[65] ${tela === 'menu' ? 'bg-[#1c120a]' : 'bg-[#f5f0e6]'}` : 'relative'}
        aria-label={t('menu.tabuleiroCheio')}
      >
        <div
          ref={containerRef}
          className={ocupaATela ? 'h-full w-full touch-none' : 'w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden border border-ink-100 touch-none'}
        />

        {tela === 'menu' && (
          <MenuXadrez
            t={t}
            config={config}
            onConfig={mudarConfig}
            temPartida={partidasEmAndamento.length > 0}
            partidasTerminadas={partidasFinalizadas}
            partidasContraMaquina={partidasContraMaquina}
            onVerPartida={handleRetomarPartida}
            onContinuar={handleContinuar}
            onNovoJogo={handleNovoJogo}
            onAbrirSala={abrirSala}
            montarVitrine={montarVitrine}
            montarExpositor={montarExpositor}
            onImportou={atualizarListaDePartidas}
          />
        )}

        {tela === 'jogo' && config.registro && <PainelDeLances t={t} lances={historico} brancas={nomeDoLado('w')} pretas={nomeDoLado('b')} />}

        {tela === 'jogo' && (
          // por cima do tabuleiro, no alto: o menu no canto, com as ações da partida logo abaixo. A situação da partida
          // fica embaixo, longe das peças
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="pointer-events-auto flex items-start justify-between gap-2">
              <button type="button" onClick={handleMenu} className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow backdrop-blur">
                {t('menu.menu')}
              </button>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              {podeDesistir && <BotaoDesistir t={t} confirmando={confirmandoDesistencia} onPedir={setConfirmandoDesistencia} onConfirmar={handleDesistir} sobreTabuleiro />}
              {podeEmpatar && <BotaoEmpate t={t} onPedir={handlePedirEmpate} sobreTabuleiro />}
              {!podeDesistir && !resultadoOverlay && sala?.status !== 'aguardando' && (
                <button type="button" onClick={handleNovoJogo} className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#3a2a1a] shadow">
                  {t('menu.novoJogo')}
                </button>
              )}
            </div>
          </div>
        )}

        {tela === 'jogo' && (
          // embaixo: o convite esperando o amigo, o pedido de empate, a revanche e a situação da partida
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {sala?.status === 'aguardando' && (
              <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-lg" role="status" data-convite>
                <p className="text-xs text-[#5a4630]">{t('online.esperaDica')}</p>
                <Button variant="secondary" onClick={handleCancelarConvite}>
                  {t('online.cancelarConvite')}
                </Button>
              </div>
            )}
            {empate?.tipo === 'recebido' && (
              <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-lg" role="alertdialog" data-pedido-empate>
                <p className="text-sm font-medium text-[#3a2a1a]">{t('empate.recebido', { nome: adversarioDaSala ?? '' })}</p>
                <span className="flex gap-2">
                  <Button variant="primary" onClick={() => handleResponderEmpate(true)}>
                    {t('empate.aceitar')}
                  </Button>
                  <Button variant="secondary" onClick={() => handleResponderEmpate(false)}>
                    {t('empate.recusar')}
                  </Button>
                </span>
              </div>
            )}
            {revanche && (
              <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-lg" role="status" data-revanche>
                <p className="text-sm font-medium text-[#3a2a1a]">{t(revanche.vencida ? 'amigos.erroPartidaVencida' : 'online.revancheRecebida', { nome: adversarioDaSala ?? '' })}</p>
                <span className="flex gap-2">
                  {!revanche.vencida && (
                    <Button variant="primary" onClick={() => void handleAceitarRevanche()}>
                      {t('amigos.jogar')}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={handleRecusarRevanche}>
                    {t(revanche.vencida ? 'resultado.fechar' : 'amigos.recusar')}
                  </Button>
                </span>
              </div>
            )}
            {!resultadoOverlay && (statusTexto || avisoDoEmpate) && (
              <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1" data-status-partida>
                {statusTexto && <p className="rounded-lg bg-white/85 px-3 py-1.5 text-center text-sm font-medium text-[#3a2a1a] shadow backdrop-blur">{statusTexto}</p>}
                {/* na partida com um amigo, contra quem é (ficava na barra da tela normal, que não existe mais) */}
                {adversarioDaSala && (
                  <p className="rounded-lg bg-white/70 px-2.5 py-0.5 text-center text-xs font-medium text-[#5a4630] shadow" data-adversario>
                    {t('online.contra', { nome: adversarioDaSala })}
                  </p>
                )}
                {avisoDoEmpate && (
                  <p className="rounded-lg bg-[#1c120a]/85 px-3 py-1 text-center text-xs font-medium text-[#f5e6c8] shadow" data-aviso-empate>
                    {avisoDoEmpate}
                  </p>
                )}
                {sala && !conectadoNaSala && <p className="rounded-lg bg-rose-700/90 px-3 py-1 text-xs font-medium text-white shadow">{t('online.reconectando')}</p>}
                {sala?.status === 'andamento' && conectadoNaSala && !sala.adversarioConectado && adversarioDaSala && (
                  <p className="rounded-lg bg-[#1c120a]/85 px-3 py-1 text-xs font-medium text-[#f5e6c8] shadow">{t('online.adversarioAusente', { nome: adversarioDaSala })}</p>
                )}
              </div>
            )}
          </div>
        )}

        {resultadoOverlay && tela === 'jogo' && (
          <ResultadoDaPartida
            t={t}
            fim={resultadoOverlay}
            detalhe={statusTexto}
            // contra a máquina, com conta, a vitória paga óticoins pela dificuldade (o servidor paga ao voltar ao menu)
            premio={resultadoOverlay === 'venceu' && !sala && sessao && partidaAtualRef.current?.dificuldade ? PREMIO_DA_VITORIA[partidaAtualRef.current.dificuldade] : 0}
            onNovoJogo={handleNovoJogo}
            onFechar={() => setResultadoOverlay(null)}
          />
        )}

        {promocaoPendente && (
          <div
            role="dialog"
            aria-label={t('promocao.rotulo')}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4"
          >
            <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-xl text-center">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">{t('promocao.titulo')}</h3>
              <p className="text-xs text-ink-400 mb-4">{t('promocao.texto')}</p>
              <div className="grid grid-cols-4 gap-2">
                {PECAS_PROMOCAO.map(({ peca, nome, branca, preta }, i) => (
                  <button
                    key={peca}
                    type="button"
                    autoFocus={i === 0}
                    onClick={() => resolverPromocaoRef.current?.(peca)}
                    className="flex flex-col items-center gap-1 rounded-xl border border-ink-200 py-3 transition hover:border-ink-400 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <span aria-hidden className="text-3xl leading-none text-ink-900">
                      {promocaoPendente === 'w' ? branca : preta}
                    </span>
                    <span className="text-xs font-medium text-ink-800">{t(nome)}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => resolverPromocaoRef.current?.(null)}
                className="mt-4 text-xs text-ink-400 underline hover:text-ink-600"
              >
                {t('promocao.voltar')}
              </button>
            </div>
          </div>
        )}

        {escolhendoCor && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4">
            <div className="w-full max-w-xs rounded-xl bg-surface p-4 shadow-xl text-center">
              <h3 className="font-display text-base font-semibold text-ink-900 mb-1">{sala ? t('online.revancheTitulo', { nome: adversarioDaSala ?? '' }) : t('cor.titulo')}</h3>
              <p className="text-xs text-ink-400 mb-4">{sala ? t('online.revancheTexto', { nome: adversarioDaSala ?? '' }) : t('cor.texto')}</p>
              {revancheFalhou && (
                <p role="alert" className="mb-3 text-xs font-medium text-rose-700">
                  {t('online.revancheErro', { nome: adversarioDaSala ?? '' })}
                </p>
              )}
              {!sala && (
                <div className="mb-4" data-dificuldade>
                  <p className="mb-1.5 text-xs font-semibold text-ink-700">{t('dificuldade.titulo')}</p>
                  <div role="radiogroup" aria-label={t('dificuldade.titulo')} className="grid grid-cols-3 gap-1.5">
                    {DIFICULDADES.map((nivel) => (
                      <button
                        key={nivel}
                        type="button"
                        role="radio"
                        aria-checked={config.dificuldade === nivel}
                        onClick={() => mudarConfig({ dificuldade: nivel })}
                        className={`rounded-lg border px-1 py-1.5 text-xs font-semibold transition ${config.dificuldade === nivel ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400 hover:bg-ink-50'}`}
                      >
                        {t(`dificuldade.${nivel}`)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[0.7rem] leading-snug text-ink-400">{t(`dificuldade.${config.dificuldade}Dica`)}</p>
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => handleEscolherCor('w')}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
                >
                  <span className="h-10 w-10 rounded-full border-2 border-[#b9b2a6] bg-[#f7f4ee] shadow-inner" />
                  <span className="text-sm font-medium text-ink-800">{t('cor.brancas')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleEscolherCor('b')}
                  className="flex flex-col items-center gap-2 rounded-xl border border-ink-200 hover:border-ink-400 hover:bg-ink-50 transition px-5 py-4"
                >
                  <span className="h-10 w-10 rounded-full border-2 border-[#6b6358] bg-[#14110e] shadow-inner" />
                  <span className="text-sm font-medium text-ink-800">{t('cor.pretas')}</span>
                </button>
              </div>
              <button type="button" onClick={() => setEscolhendoCor(false)} className="mt-4 text-xs text-ink-400 underline hover:text-ink-600">
                {t(tela === 'jogo' ? 'cor.voltarPartida' : 'cor.voltarMenu')}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
