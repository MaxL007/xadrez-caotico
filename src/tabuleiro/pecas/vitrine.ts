import * as THREE from 'three'
import { type OssoSalvo, restaurarOssos } from './ossos'
import { emblemaDaHabilidade } from './emblemas'
import { cajadoDoModelo, equipamentoSozinho, katanaDoModelo, vestirPeca, type VitrineDaPeca } from './equipamentos'
import { ARMAS_DA_TORRE, criarMarreta, posarComMarreta, POSE_MARRETA_GUARDA, salvarOssosDoGolpe } from '../combate/marreta'
import { materiaisDaPeca } from './materiais'
import { buildPecaRPG, modelosRPG, mostrarEspadaRPG } from './modelosRPG'

// A peça sozinha da vitrine da Personalização e o equipamento sozinho dos expositores (Personalização e Loja).

/** A peça sozinha, vestida, pra vitrine da Personalização: o peão com a espada na mão, a torre com a arma na pose
 * de guarda do golpe. Null enquanto os modelos não chegaram. */
export function montarVitrine(tipo: string, escolhas: Record<string, string>): VitrineDaPeca | null {
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
export function montarExpositor(tipo: string, parte: string, opcao: string): THREE.Object3D | null {
  if (parte === 'arma' && tipo === 'r') return ARMAS_DA_TORRE.includes(opcao) ? criarMarreta('w', opcao) : null
  // a habilidade especial aparece como o símbolo dela
  if (parte === 'golpe') return emblemaDaHabilidade(opcao)
  const modelo = modelosRPG[tipo]
  if (parte === 'arma' && modelo && (opcao === 'katana' || opcao === 'cajado')) {
    const peca = buildPecaRPG(modelo, 'w')
    return tipo === 'p' ? katanaDoModelo(peca) : cajadoDoModelo(peca, tipo)
  }
  return equipamentoSozinho(tipo, parte, opcao, materiaisDaPeca('w'))
}
