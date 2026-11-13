import * as THREE from 'three'
import { vestirPeca } from './equipamentos'
import { criarContorno } from '../casas'
import { CONFIG_BRACO_DIR, CONFIG_BRACO_ESQ, CONFIG_PERNA_DIR, CONFIG_PERNA_ESQ, criarMembro, ESCALA_MODELO_RPG, ESCALA_POR_TIPO, geometriasDoTipo, type MembrosPersonagem, POSE_BASE_NEUTRA, type PoseBaseMembros } from './geometricas'
import { geoCaboEspada, materiaisDaPeca, materialCaboEspada, materialDaParte } from './materiais'
import { buildPecaRPG, modelosRPG } from './modelosRPG'
import { assinaturaDaVestimenta, vestimenta } from './vestimenta'

// Monta a peça de uma casa: o modelo RPG vestido ou, sem ele, a geométrica.

/** `porParte`: cada equipamento numa malha própria, pra ele aparecer sozinho (a peça da promoção). */
export function buildPieceMesh(tipo: string, cor: 'w' | 'b', { porParte = false } = {}): THREE.Group {
  // peça com o modelo RPG carregado (malha + esqueleto + animações do Blender) em vez da
  // geométrica de sempre — mesmo "contrato" externo (userData.tipo/cor, rotação por cor, escala),
  // só a montagem interna que muda. Sem bainha/espada procedural aqui: o modelo é autocontido. Os
  // modelos olham pra +Z, como as peças geométricas (inclusive o cavalo, que lá é exceção)
  const modeloRPG = modelosRPG[tipo]
  if (modeloRPG) {
    const grupo = buildPecaRPG(modeloRPG, cor)
    // toda peça passa por aqui: sem escolha (o adversário, a máquina), fica sem arma
    const escolhas = cor === vestimenta.cor ? vestimenta.escolhas[tipo] : undefined
    vestirPeca(grupo, tipo, escolhas ?? {}, materiaisDaPeca(cor), { porParte })
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
