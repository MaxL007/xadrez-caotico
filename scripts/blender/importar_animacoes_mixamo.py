"""
Monta as peças do xadrez do jogo no esqueleto e nas animações que vieram do Mixamo.

O peão foi riggado no Mixamo a partir da versão gerada pelo exportar_peao_mixamo.py (pose T, sem
chapéu nem bainha, remalhada numa peça só, em tamanho de gente). Do Mixamo vêm:
    peao_rpgrtp.fbx                    — o peão riggado (esqueleto "mixamorig", 25 ossos)
    sword and shield <nome>.fbx         — as animações (só esqueleto, sem malha)

Todas as peças usam o MESMO esqueleto e as mesmas animações de base: o corpo é o do peão (a malha de
baixo polígono do criar_peao_rpg.py) e cada tipo muda só os acessórios (ver ACESSORIOS) — elmo com
ameias da torre, mitra e cajado do bispo, coroa/capa/cetro da dama, coroa com cruz do rei. O cavalo
vira um cavaleiro com elmo de cavalo (orelhas e crina): um cavalo de verdade precisaria de outro
esqueleto. Cada peça tem os seus próprios golpes (ver GOLPES) — nenhum golpe se repete entre peças.

O que o script faz: monta cada peça na mesma pose T do arquivo do Mixamo, encaixa nela o esqueleto
do Mixamo (de volta ao tamanho do jogo), prende cada parte no osso correspondente e grava os clipes
com os nomes que o jogo usa (ver ChessBoard3D.tsx):
    Parado        — em pé normal, braços caídos (a pose original do peão)
    Gesto1/2      — movimentos que o jogo toca de vez em quando, sorteados
    Walk          — andar no lugar (quem leva a peça de casa em casa é o código)
    Attack1, 2…   — os golpes da peça, sorteados a cada captura
Também cria o osso "Hand_R" (filho da mão direita do Mixamo), onde o jogo pendura a espada no golpe.
Os modelos saem olhando pra +Z do Three.js, a frente de todas as peças do tabuleiro.

Roda sem abrir a interface:
    blender --background --python scripts/blender/importar_animacoes_mixamo.py

Grava public/models/<peça>_rpg.glb (ver PECAS) e uma imagem de conferência, peao_rpg_jogo.png,
nesta pasta.
"""

import json
import math
import os
import struct
import sys

import bmesh
import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)
sys.dont_write_bytecode = True  # sem pasta __pycache__ no projeto
import criar_peao_rpg as base  # noqa: E402 — só as funções (o main() de lá não roda ao importar)
import exportar_peao_mixamo as mixamo  # noqa: E402 — idem

CAMINHO_RIG = os.path.join(PASTA, "peao_rpgrtp.fbx")
PASTA_MODELOS = os.path.join(PASTA, "..", "..", "public", "models")
CAMINHO_PNG = os.path.join(PASTA, "peao_rpg_jogo.png")
CAMINHO_PNG_MORTAL = os.path.join(PASTA, "peao_rpg_mortal.png")
CAMINHO_PNG_ESPADA = os.path.join(PASTA, "peao_rpg_espada.png")
CAMINHO_PNG_CAVALO = os.path.join(PASTA, "peao_rpg_cavalo.png")

# tipo da peça (letra do chess.js) → arquivo do modelo em public/models
PECAS = {
    "p": "peao_rpg.glb",
    "r": "torre_rpg.glb",
    "n": "cavalo_rpg.glb",
    "b": "bispo_rpg.glb",
    "q": "dama_rpg.glb",
    "k": "rei_rpg.glb",
}

# clipes comuns a todas as peças → arquivo do Mixamo. Parado o peão fica em pé normal (o clipe
# "Parado", montado aqui — ver criar_parado); os "Gesto…" são movimentos que o jogo toca de vez em
# quando, num intervalo sorteado pra cada peça (ver atualizarGestoRPG em ChessBoard3D.tsx)
ANIMACOES = {
    "Gesto1": "sword and shield idle.fbx",
    "Gesto2": "sword and shield idle (2).fbx",
    "Walk": "sword and shield walk.fbx",
    "Run": "sword and shield run.fbx",
    # a peça capturada cai de costas (o jogo vira ela de frente pro atacante antes)
    "Morte": "sword and shield death.fbx",
}
# andar e correr: o Mixamo anda pra frente de verdade; aqui ficam no lugar (quem leva a peça é o
# jogo), e a velocidade com que o corpo avançava vai pro .glb ("velocidade_walk"/"velocidade_run",
# em unidades por segundo) — o jogo desloca a peça nessa velocidade, então os pés não escorregam
ANDAR_NO_LUGAR = ("Walk", "Run")

# resolução das peças: 16 lados nos cilindros/cones/esferas (antes 8, facetado) e sombreado suave
# com as quinas vivas (ver suavizar)
LADOS_HD = 16

# golpes de cada peça, sorteados pelo jogo a cada captura — nenhum se repete entre peças. Cada um:
# (arquivo, quadro de início, quadro do impacto, quadro do fim, anda?). O golpe do jogo
# (animarAtaqueEspada em ChessBoard3D.tsx) dura DURACAO_ATAQUE_MS = 520 ms, com o impacto em
# INSTANTE_IMPACTO = 0,55 dele (~0,29 s), e a espada some da mão no fim — então cada golpe é cortado
# entre o início e o fim escolhidos e acelerado/desacelerado pro impacto (mão ou pé mais rápido,
# medido quadro a quadro) cair nesse instante; depois do fim o jogo mistura de volta com o Parado.
# "anda?" = o golpe do Mixamo dá passos pra frente: o quadril perde o avanço, como no Walk (quem
# avança na direção da vítima é o próprio jogo).
GOLPES = {
    "p": [
        ("sword and shield slash.fbx", 1, 19, 34, False),  # corte diagonal
        ("sword and shield attack (4).fbx", 1, 14, 17, False),  # estocada curta
    ],
    "r": [
        ("sword and shield slash (2).fbx", 1, 21, 28, False),  # golpe de cima pra baixo
        ("sword and shield kick.fbx", 1, 13, 17, False),  # chute
    ],
    # o cavalo não está aqui: os golpes dele (empinar e pisotear, investida) são do cavalo, feitos
    # no próprio script (ver CLIPES_CAVALO)
    "b": [
        ("sword and shield casting (2).fbx", 1, 7, 10, False),  # magia lançada com a mão
        ("sword and shield power up.fbx", 1, 16, 20, False),  # carga de energia
    ],
    "q": [
        ("sword and shield slash (4).fbx", 24, 41, 46, False),  # golpe giratório de cima, com o cetro
        ("sword and shield slash (3).fbx", 17, 26, 29, False),  # golpe de baixo pra cima, com o cetro
    ],
    "k": [
        ("sword and shield attack (3).fbx", 8, 24, 28, True),  # estocada com passo, com o cajado
        ("sword and shield attack (2).fbx", 1, 20, 22, True),  # investida, com o cajado
    ],
}
FPS = 30  # o Mixamo exporta a 30 quadros por segundo
DURACAO_GOLPE_JOGO = 0.52
INSTANTE_IMPACTO_JOGO = 0.55

# em pé: cada membro do Mixamo volta da pose T girando em volta da junta do peão original (o
# inverso do que o exportar_peao_mixamo.py fez pra montar a pose T) — osso do Mixamo, junta do
# peão original, ângulo em volta do eixo Y
VOLTA_DA_POSE_T = (
    ("mixamorig:LeftArm", "Arm_L", -mixamo.ANGULO_BRACOS),
    ("mixamorig:RightArm", "Arm_R", mixamo.ANGULO_BRACOS),
    ("mixamorig:LeftUpLeg", "Leg_L", -mixamo.ANGULO_PERNAS),
    ("mixamorig:RightUpLeg", "Leg_R", mixamo.ANGULO_PERNAS),
)

# parte do corpo (criar_peao_rpg.py) → osso do Mixamo; peso 100% rígido, igual ao peão antigo. O
# tronco é o único dividido (ver pesar_por_altura): a base segue o quadril e o topo, o peito.
OSSO_DA_PARTE = {
    "Cabeca": "mixamorig:Head",
    "Chapeu": "mixamorig:Head",
    "Ombro_L": "mixamorig:LeftArm",
    "Ombro_R": "mixamorig:RightArm",
    "Braco_L": "mixamorig:LeftArm",
    "Braco_R": "mixamorig:RightArm",
    "Antebraco_L": "mixamorig:LeftForeArm",
    "Antebraco_R": "mixamorig:RightForeArm",
    "Perna_L": "mixamorig:LeftUpLeg",
    "Perna_R": "mixamorig:RightUpLeg",
    "Canela_L": "mixamorig:LeftLeg",
    "Canela_R": "mixamorig:RightLeg",
    "Bota_L": "mixamorig:LeftLeg",
    "Bota_R": "mixamorig:RightLeg",
    # a bainha do corpo base sai de todas as peças (ver prender_malha) — só o peão tem espada, e a
    # dele é refeita no lugar certo (ver armar_peao)
    "Bainha": "mixamorig:Hips",
    "CaboBainha": "mixamorig:Hips",
}
PARTES_TIRADAS = ("Bainha", "CaboBainha")
OSSO_BASE_TRONCO = "mixamorig:Hips"
OSSO_TOPO_TRONCO = "mixamorig:Spine2"
MISTURA_TRONCO = "tronco"  # alvo das peças que dobram com a coluna (tronco, capa)

# osso do Mixamo → osso do peão original que leva a peça junto na pose T (os acessórios são
# montados com o peão em pé, igual ao corpo, e vão pra pose T pelo esqueleto antigo)
OSSO_ANTIGO = {
    "mixamorig:Head": "Head",
    "mixamorig:LeftForeArm": "Forearm_L",
    "mixamorig:RightForeArm": "Forearm_R",
    "mixamorig:LeftArm": "Arm_L",
    "mixamorig:RightArm": "Arm_R",
    "mixamorig:Spine2": "Spine",
    "mixamorig:Hips": "Spine",
    MISTURA_TRONCO: "Spine",
}

# materiais — o jogo troca cada um pela cor da facção pelo nome (ver buildPecaRPG): Corpo e Detalhe
# seguem a facção (branca/preta), Coroa é dourado e Brilho é a cor clara de destaque
MATERIAIS = {
    "Corpo": (0.75, 0.75, 0.78, 1.0),
    "Detalhe": (0.3, 0.35, 0.55, 1.0),
    "Coroa": (0.88, 0.73, 0.24, 1.0),
    "Brilho": (0.56, 0.89, 1.0, 1.0),
    # espada do peão: a da mão (aparece só desembainhada) e o cabo que fica pra fora da bainha
    # (some enquanto a espada está na mão) — o jogo mostra/esconde cada uma pelo nome
    "EspadaLamina": (0.54, 0.58, 0.64, 1.0),
    "EspadaCabo": (0.55, 0.35, 0.17, 1.0),
    "CaboBainha": (0.55, 0.35, 0.17, 1.0),
    # saya (bainha da katana): laca preta
    "BainhaKatana": (0.04, 0.04, 0.05, 1.0),
}
# peças de túnica: o tronco vai na cor de detalhe (como a batina/vestido das peças geométricas)
TRONCO_DETALHE = {"b", "q", "k"}

# Acessórios por peça, com o peão em pé (Z pra cima, frente em +Y, esquerda do peão em -X). Só o
# peão tem espada; a dama e o rei golpeiam com o cetro/cajado (na mão direita, que é a mão dos
# golpes), o bispo segura o cajado na esquerda (as magias dele saem da direita). O cavalo é
# montado à parte (ver CAVALO). Cada um: (nome, forma, medidas, posição, giro, material, osso do
# Mixamo). Medidas: caixa (x, y, z), cilindro/cone (raio, raio do
# topo, altura), esfera (raio,), anel (raio, espessura). Os números seguem os acessórios das peças
# geométricas do tabuleiro (geometriasDoTipo em ChessBoard3D.tsx), no tamanho deste corpo (cabeça
# com centro em z=0,70 e raio 0,07; mãos em x=±0,11, z≈0,33).
ACESSORIOS = {
    "p": [],
    "r": [
        ("Ombreira_L", "caixa", (0.08, 0.09, 0.05), (-0.115, 0, 0.615), (0, 0, 0), "Detalhe", "mixamorig:LeftArm"),
        ("Ombreira_R", "caixa", (0.08, 0.09, 0.05), (0.115, 0, 0.615), (0, 0, 0), "Detalhe", "mixamorig:RightArm"),
        ("Elmo", "caixa", (0.15, 0.15, 0.06), (0, 0, 0.765), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_1", "caixa", (0.04, 0.04, 0.04), (-0.055, -0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_2", "caixa", (0.04, 0.04, 0.04), (0.055, -0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_3", "caixa", (0.04, 0.04, 0.04), (-0.055, 0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Ameia_4", "caixa", (0.04, 0.04, 0.04), (0.055, 0.055, 0.81), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Viseira", "caixa", (0.05, 0.015, 0.015), (0, 0.068, 0.705), (0, 0, 0), "Brilho", "mixamorig:Head"),
    ],
    # o cavaleiro: capacete pontudo (o do peão) e capa curta esvoaçando pra trás — o cavalo vem à parte
    "n": [
        ("Capa", "caixa", (0.09, 0.02, 0.18), (0, -0.105, 0.5), (0.2, 0, 0), "Detalhe", MISTURA_TRONCO),
    ],
    "b": [
        ("Mitra", "cone", (0.055, 0.0, 0.26), (0, 0, 0.88), (0, 0, 0), "Detalhe", "mixamorig:Head"),
        ("Cajado", "cilindro", (0.011, 0.011, 0.46), (-0.11, 0.04, 0.36), (0, 0, 0), "Corpo", "mixamorig:LeftForeArm"),
        ("Orbe", "esfera", (0.032,), (-0.11, 0.04, 0.61), (0, 0, 0), "Brilho", "mixamorig:LeftForeArm"),
    ],
    "q": [
        ("Coroa", "anel", (0.052, 0.014), (0, 0, 0.765), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Ponta_1", "cone", (0.012, 0.0, 0.04), (0.045, 0, 0.795), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Ponta_2", "cone", (0.012, 0.0, 0.04), (-0.045, 0, 0.795), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Ponta_3", "cone", (0.012, 0.0, 0.04), (0, 0.045, 0.795), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Joia", "esfera", (0.02,), (0, -0.045, 0.79), (0, 0, 0), "Brilho", "mixamorig:Head"),
        ("Colar", "anel", (0.045, 0.008), (0, 0, 0.615), (0, 0, 0), "Coroa", "mixamorig:Spine2"),
        ("Capa", "caixa", (0.15, 0.025, 0.44), (0, -0.115, 0.4), (0.08, 0, 0), "Detalhe", MISTURA_TRONCO),
        ("Cetro", "cilindro", (0.009, 0.009, 0.32), (0.11, 0.04, 0.38), (0, 0, 0), "Coroa", "mixamorig:RightForeArm"),
        ("JoiaCetro", "esfera", (0.025,), (0.11, 0.04, 0.55), (0, 0, 0), "Brilho", "mixamorig:RightForeArm"),
    ],
    "k": [
        ("Coroa", "anel", (0.055, 0.016), (0, 0, 0.765), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Cruz", "caixa", (0.02, 0.02, 0.11), (0, 0, 0.84), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("BracoCruz", "caixa", (0.06, 0.02, 0.02), (0, 0, 0.86), (0, 0, 0), "Coroa", "mixamorig:Head"),
        ("Capa", "caixa", (0.16, 0.025, 0.48), (0, -0.115, 0.38), (0.1, 0, 0), "Detalhe", MISTURA_TRONCO),
        ("Emblema", "caixa", (0.03, 0.012, 0.03), (0, 0.095, 0.55), (0, math.pi / 4, 0), "Brilho", "mixamorig:Spine2"),
        ("Cajado", "cilindro", (0.011, 0.011, 0.48), (0.11, 0.04, 0.37), (0, 0, 0), "Corpo", "mixamorig:RightForeArm"),
        ("CruzCajado", "caixa", (0.018, 0.018, 0.07), (0.11, 0.04, 0.64), (0, 0, 0), "Coroa", "mixamorig:RightForeArm"),
        ("BracoCruzCajado", "caixa", (0.05, 0.018, 0.018), (0.11, 0.04, 0.65), (0, 0, 0), "Coroa", "mixamorig:RightForeArm"),
    ],
}
# o chapéu pontudo é só do peão e do cavaleiro (as outras peças têm o próprio elmo/coroa)
CHAPEU = "Chapeu"
COM_CHAPEU = {"p", "n"}

# ---- espada do peão (ver armar_peao) ----
# direção da lâmina no espaço da mão direita, com o peão em pose T: um prolongamento do antebraço,
# um pouco pra frente — escolhida testando quadro a quadro nas animações do Mixamo: lâmina erguida
# na preparação do golpe, apontando pro alvo no impacto e descendo junto do quadril esquerdo ao
# embainhar (as outras direções testadas ficavam de lado no golpe ou apontando pra cima ao guardar)
EMPUNHADURA = Vector((0.93, 0.31, -0.18)).normalized()
# pra onde a katana curva (as costas da lâmina), com o peão em pose T: pra cima, perpendicular à lâmina
CURVA_EMPUNHADURA = (Vector((0, 0, 1)) - EMPUNHADURA * EMPUNHADURA.z).normalized()
# centro do punho fechado, em pose T: logo depois da ponta do antebraço direito
PUNHO = Vector((0.36, 0, 0.57))
# katana: tsuka (cabo longo, de duas mãos — o punho direito fica perto da guarda), tsuba (a guarda
# redonda), lâmina curva de um gume só que afina até a ponta, e a saya (bainha) laqueada de preto,
# curva como a lâmina. Medidas em metros, no tamanho do peão.
CABO_KATANA = (0.0105, 0.085)  # raio, comprimento
CABO_ATRAS_DO_PUNHO = 0.055  # quanto do cabo fica atrás do punho (o resto vai até a tsuba)
TSUBA = (0.026, 0.008)  # raio, espessura
LAMINA_KATANA = (0.007, 0.026, 0.27)  # espessura, largura, comprimento
CURVATURA_KATANA = 0.022  # quanto a ponta sai da linha reta do cabo (o "sori")
SAYA = (0.016, 0.29)  # raio, comprimento
# desembainhar/embainhar: as duas animações de bainha do pacote do Mixamo — "sheath sword 1" sai da
# postura de espada e leva a mão até o quadril esquerdo, enfiando a espada (a mão para no quadril
# perto do quadro 30); "sheath sword 2" solta o cabo e relaxa os braços. Embainhar = 1 + 2;
# desembainhar = as duas ao contrário (2 de trás pra frente, depois 1 de trás pra frente).
ARQUIVOS_BAINHA = ("sheath sword 1.fbx", "sheath sword 2.fbx")
VELOCIDADE_BAINHA = 1.6


def log(mensagem):
    print(f"[importar_animacoes_mixamo] {mensagem}")


def material(nome):
    """Um material de cada por arquivo, compartilhado entre as peças (o jogo procura pelo nome)."""
    existente = bpy.data.materials.get(nome)
    if existente:
        return existente
    novo = bpy.data.materials.new(nome)
    novo.diffuse_color = MATERIAIS[nome]
    return novo


def primitiva(nome, forma, medidas, posicao, giro, nome_material):
    """Caixa (x, y, z), cilindro/cone (raio, raio do topo, altura), esfera (raio,) ou anel (raio,
    espessura), já com o material."""
    if forma == "caixa":
        bpy.ops.mesh.primitive_cube_add(size=1, location=posicao, rotation=giro)
        bpy.context.object.scale = medidas
    elif forma in ("cilindro", "cone"):
        raio, raio_topo, altura = medidas
        bpy.ops.mesh.primitive_cone_add(vertices=LADOS_HD, radius1=raio, radius2=raio_topo, depth=altura, location=posicao, rotation=giro)
    elif forma == "esfera":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=medidas[0], segments=LADOS_HD, ring_count=LADOS_HD // 2, location=posicao, rotation=giro)
    elif forma == "anel":
        raio, espessura = medidas
        bpy.ops.mesh.primitive_torus_add(major_radius=raio, minor_radius=espessura, major_segments=LADOS_HD * 2, minor_segments=LADOS_HD // 2, location=posicao, rotation=giro)
    objeto = bpy.context.object
    objeto.name = nome
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    objeto.data.materials.append(material(nome_material))
    return objeto


def criar_acessorio(nome, forma, medidas, posicao, giro, nome_material, alvo):
    """Uma peça de acessório já com o grupo do osso antigo (pra ir junto pra pose T), o grupo
    "alvo:<osso do Mixamo>" (pra prender depois) e o material."""
    objeto = primitiva(nome, forma, medidas, posicao, giro, nome_material)
    todos = list(range(len(objeto.data.vertices)))
    objeto.vertex_groups.new(name=OSSO_ANTIGO[alvo]).add(todos, 1.0, "REPLACE")
    objeto.vertex_groups.new(name=f"alvo:{alvo}").add(todos, 1.0, "REPLACE")
    return objeto


def montar_peca(tipo):
    """O corpo do peão (malha + esqueleto antigo do criar_peao_rpg.py) com os acessórios da peça."""
    malha, contagens_vertices, contagens_faces = base.criar_malha(lados=LADOS_HD)
    malha.name = f"Peca_{tipo}"
    base.criar_grupos_de_vertice(malha, contagens_vertices)
    for nome in MATERIAIS:
        malha.data.materials.append(material(nome))
    indices = {nome: i for i, nome in enumerate(MATERIAIS)}
    inicio = 0
    for parte, quantidade in contagens_faces:
        nome_material = "Detalhe" if parte in base.PARTES_DETALHE or (parte == "Torso" and tipo in TRONCO_DETALHE) else "Corpo"
        for i in range(inicio, inicio + quantidade):
            malha.data.polygons[i].material_index = indices[nome_material]
        inicio += quantidade

    acessorios = [criar_acessorio(*definicao) for definicao in ACESSORIOS[tipo]]
    if acessorios:
        # o join mantém a malha ativa (o corpo) no começo e põe os acessórios depois — as faixas
        # de vértices do corpo continuam valendo; materiais e grupos se juntam pelo nome
        bpy.ops.object.select_all(action="DESELECT")
        for objeto in acessorios:
            objeto.select_set(True)
        malha.select_set(True)
        bpy.context.view_layer.objects.active = malha
        bpy.ops.object.join()
        bpy.ops.object.shade_flat()

    esqueleto = base.criar_esqueleto()
    base.vincular_malha_ao_esqueleto(malha, esqueleto)
    return malha, esqueleto, contagens_vertices


def peca_em_pose_t(tipo):
    """A peça na mesma pose T do arquivo que foi pro Mixamo, sem esqueleto. Devolve a malha, as
    faixas de vértices de cada parte do corpo, o alvo de cada vértice de acessório, as juntas
    (ombros e quadris) em volta das quais os membros giraram pra pose T e a posição de cada vértice
    com a peça em pé (antes da pose T) — as duas últimas montam e conferem o "Parado"."""
    malha, esqueleto, contagens_vertices = montar_peca(tipo)
    em_pe = [malha.matrix_world @ vertice.co for vertice in malha.data.vertices]
    juntas = {nome: esqueleto.matrix_world @ esqueleto.data.bones[nome].head_local for nome in ("Arm_L", "Arm_R", "Leg_L", "Leg_R")}
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "XYZ"
        pose_osso.location = (0, 0, 0)
        pose_osso.rotation_euler = (0, 0, 0)
        pose_osso.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    mixamo.girar_osso_no_mundo(esqueleto, "Arm_L", mixamo.ANGULO_BRACOS)
    mixamo.girar_osso_no_mundo(esqueleto, "Arm_R", -mixamo.ANGULO_BRACOS)
    mixamo.girar_osso_no_mundo(esqueleto, "Leg_L", mixamo.ANGULO_PERNAS)
    mixamo.girar_osso_no_mundo(esqueleto, "Leg_R", -mixamo.ANGULO_PERNAS)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = malha
    malha.select_set(True)
    for modificador in list(malha.modifiers):
        if modificador.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=modificador.name)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.data.objects.remove(esqueleto, do_unlink=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    alvos = {}
    for grupo in malha.vertex_groups:
        if grupo.name.startswith("alvo:"):
            for vertice in malha.data.vertices:
                if any(g.group == grupo.index for g in vertice.groups):
                    alvos[vertice.index] = grupo.name.removeprefix("alvo:")
    malha.vertex_groups.clear()

    faixas = {}
    inicio = 0
    for nome, quantidade in contagens_vertices:
        faixas[nome] = range(inicio, inicio + quantidade)
        inicio += quantidade
    assert inicio + len(alvos) == len(malha.data.vertices), "as faixas das partes não batem com a malha"
    return malha, faixas, alvos, juntas, em_pe


def importar_fbx(caminho):
    """Importa um FBX e devolve os objetos novos que vieram nele."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=caminho)
    return [o for o in bpy.data.objects if o not in antes]


def esqueleto_do_mixamo():
    """O esqueleto do peão riggado, de volta ao tamanho e à direção do jogo (o arquivo do Mixamo
    foi feito com o peão dobrado de tamanho e virado 180°). Devolve o esqueleto, a conversão do
    mundo do FBX pro mundo do jogo e o comprimento de cada osso no FBX (pra conferir que as
    animações são do mesmo esqueleto)."""
    novos = importar_fbx(CAMINHO_RIG)
    esqueleto = next(o for o in novos if o.type == "ARMATURE")
    for objeto in novos:
        if objeto.type == "MESH":
            bpy.data.objects.remove(objeto, do_unlink=True)
    esqueleto.animation_data_clear()
    comprimentos = {osso.name: osso.length for osso in esqueleto.data.bones}

    conversao = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(1 / mixamo.ESCALA_MIXAMO, 4)
    esqueleto.matrix_world = conversao @ esqueleto.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    esqueleto.name = "Esqueleto"

    # confere o encaixe: braço esquerdo do Mixamo do lado esquerdo do peão (-X), pulsos na ponta
    # dos antebraços (±0,33 m) e quadril na altura da base do tronco
    pulso_esq = esqueleto.data.bones["mixamorig:LeftHand"].head_local
    pulso_dir = esqueleto.data.bones["mixamorig:RightHand"].head_local
    quadril = esqueleto.data.bones["mixamorig:Hips"].head_local
    assert pulso_esq.x < -0.3 and pulso_dir.x > 0.3, f"lados trocados: pulsos {pulso_esq}, {pulso_dir}"
    assert abs(pulso_dir.z - 0.57) < 0.03, f"pulso fora da altura do ombro: {pulso_dir}"
    assert 0.3 < quadril.z < 0.45, f"quadril fora do lugar: {quadril}"
    return esqueleto, conversao, comprimentos


def pesar_por_altura(malha, indices):
    """Tronco/capa: os vértices de baixo seguem o quadril e os de cima o peito, misturando pela
    altura — assim acompanham a coluna quando o personagem se inclina."""
    alturas = [malha.data.vertices[i].co.z for i in indices]
    baixo, alto = min(alturas), max(alturas)
    grupo_base = malha.vertex_groups[OSSO_BASE_TRONCO]
    grupo_topo = malha.vertex_groups[OSSO_TOPO_TRONCO]
    for i in indices:
        t = (malha.data.vertices[i].co.z - baixo) / (alto - baixo)
        if t < 1:
            grupo_base.add([i], 1 - t, "REPLACE")
        if t > 0:
            grupo_topo.add([i], t, "REPLACE")


def prender_malha(malha, faixas, alvos, esqueleto, tipo):
    ossos = set(OSSO_DA_PARTE.values()) | {OSSO_BASE_TRONCO, OSSO_TOPO_TRONCO} | set(alvos.values())
    for osso in sorted(ossos - {MISTURA_TRONCO}):
        malha.vertex_groups.new(name=osso)
    for parte, faixa in faixas.items():
        if parte == "Torso":
            pesar_por_altura(malha, faixa)
        else:
            malha.vertex_groups[OSSO_DA_PARTE[parte]].add(list(faixa), 1.0, "REPLACE")
    # acessórios: cada peça inteira (grupo de vértices ligados) no seu alvo
    misturados = [i for i, alvo in alvos.items() if alvo == MISTURA_TRONCO]
    if misturados:
        pesar_por_altura(malha, misturados)
    for indice, alvo in alvos.items():
        if alvo != MISTURA_TRONCO:
            malha.vertex_groups[alvo].add([indice], 1.0, "REPLACE")
    for vertice in malha.data.vertices:
        total = sum(g.weight for g in vertice.groups)
        assert abs(total - 1) < 1e-4, f"{tipo}: vértice {vertice.index} com peso total {total}"

    modificador = malha.modifiers.new(name="Armature", type="ARMATURE")
    modificador.object = esqueleto
    malha.parent = esqueleto

    # tira a bainha do corpo base (só o peão tem espada, e a dele é refeita em armar_peao) e o
    # chapéu pontudo das peças que têm o próprio elmo/coroa
    tirar = list(PARTES_TIRADAS) + ([] if tipo in COM_CHAPEU else [CHAPEU])
    bm = bmesh.new()
    bm.from_mesh(malha.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for parte in tirar for i in faixas[parte]], context="VERTS")
    bm.to_mesh(malha.data)
    bm.free()
    malha.data.update()


def peca_alinhada(nome, forma, medidas, centro, direcao, nome_material, osso):
    """Uma peça (caixa ou cilindro) com o comprimento ao longo de `direcao`, centrada em `centro`,
    presa 100% no `osso`. Caixa: medidas (x, y, comprimento); cilindro: (raio, comprimento)."""
    z = direcao.normalized()
    referencia = Vector((0, 0, 1)) if abs(z.z) < 0.9 else Vector((1, 0, 0))
    x = referencia.cross(z).normalized()
    y = z.cross(x)
    giro = Matrix((x, y, z)).transposed().to_4x4()
    if forma == "caixa":
        bpy.ops.mesh.primitive_cube_add(size=1)
        bpy.context.object.scale = medidas
    else:
        raio, comprimento = medidas
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=raio, depth=comprimento)
    objeto = bpy.context.object
    objeto.name = nome
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    objeto.matrix_world = Matrix.Translation(centro) @ giro
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    objeto.vertex_groups.new(name=osso).add(list(range(len(objeto.data.vertices))), 1.0, "REPLACE")
    objeto.data.materials.append(material(nome_material))
    return objeto


def juntar_na_malha(malha, objetos):
    """Junta as peças na malha (materiais e grupos de vértices se juntam pelo nome)."""
    bpy.ops.object.select_all(action="DESELECT")
    for objeto in objetos:
        objeto.select_set(True)
    malha.select_set(True)
    bpy.context.view_layer.objects.active = malha
    bpy.ops.object.join()
    bpy.ops.object.shade_flat()


def malha_curva(nome, base, direcao, curva, comprimento, secao, nome_material, osso, afinar=False, segmentos=12):
    """Peça comprida e curva (lâmina, saya): uma seção (lista de pontos (u, v) em volta do eixo —
    u na direção de `curva`, v na outra) varrida ao longo de `direcao` a partir de `base`, com o
    eixo se afastando da reta na direção de `curva` como uma parábola (a curvatura da katana).
    `afinar`: a seção encolhe até a ponta (a ponta da lâmina)."""
    lado = direcao.cross(curva).normalized()
    vertices = []
    for i in range(segmentos + 1):
        t = i / segmentos
        centro = base + direcao * (comprimento * t) + curva * (CURVATURA_KATANA * t * t)
        escala = 1.0 if not afinar else (1.0 if t < 0.8 else 1.0 - (t - 0.8) / 0.2 * 0.9)
        for u, v in secao:
            vertices.append(centro + curva * (u * escala) + lado * (v * (1.0 if not afinar else max(escala, 0.5))))
    n = len(secao)
    faces = []
    for i in range(segmentos):
        for j in range(n):
            a = i * n + j
            b = i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    faces.append(tuple(reversed(range(n))))  # tampa da base
    faces.append(tuple(segmentos * n + j for j in range(n)))  # tampa da ponta
    dados = bpy.data.meshes.new(nome)
    dados.from_pydata([tuple(p) for p in vertices], [], faces)
    # faces viradas pra fora (no jogo o material só desenha a frente da face)
    bm = bmesh.new()
    bm.from_mesh(dados)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(dados)
    bm.free()
    dados.update()
    objeto = bpy.data.objects.new(nome, dados)
    bpy.context.scene.collection.objects.link(objeto)
    objeto.vertex_groups.new(name=osso).add(list(range(len(vertices))), 1.0, "REPLACE")
    objeto.data.materials.append(material(nome_material))
    return objeto


def partes_da_katana(prefixo, punho, direcao, curva, material_cabo, material_lamina, osso):
    """Cabo, tsuba e (com `material_lamina`) a lâmina de uma katana empunhada em `punho`, com a
    lâmina saindo na `direcao` e curvando pra `curva`. Sem lâmina: a parte que fica pra fora da
    bainha (cabo e tsuba)."""
    raio_cabo, comprimento_cabo = CABO_KATANA
    centro_cabo = punho + direcao * (comprimento_cabo / 2 - CABO_ATRAS_DO_PUNHO)
    frente_cabo = punho + direcao * (comprimento_cabo - CABO_ATRAS_DO_PUNHO)
    raio_tsuba, espessura_tsuba = TSUBA
    partes = [
        peca_alinhada(f"{prefixo}Tsuka", "cilindro", CABO_KATANA, centro_cabo, direcao, material_cabo, osso),
        peca_alinhada(f"{prefixo}Tsuba", "cilindro", (raio_tsuba, espessura_tsuba), frente_cabo + direcao * (espessura_tsuba / 2), direcao, material_cabo, osso),
    ]
    if material_lamina:
        espessura, largura, comprimento = LAMINA_KATANA
        # seção da lâmina: mais grossa nas costas (lado da curva), fina no gume
        secao = [(largura / 2, espessura / 2), (largura / 2, -espessura / 2), (-largura / 2, -espessura / 6), (-largura / 2, espessura / 6)]
        partes.append(malha_curva(f"{prefixo}Lamina", frente_cabo + direcao * espessura_tsuba, direcao, curva, comprimento, secao, material_lamina, osso, afinar=True))
    return partes


def curvas(acao):
    return anim_utils.action_get_channelbag_for_slot(acao, acao.slots[0]).fcurves


def usar_acao_nova(esqueleto, acao):
    """Ação ainda vazia: o slot dela nasce no primeiro keyframe."""
    esqueleto.animation_data_create()
    esqueleto.animation_data.action = acao


def usar_acao(esqueleto, acao):
    esqueleto.animation_data_create()
    esqueleto.animation_data.action = acao
    esqueleto.animation_data.action_slot = acao.slots[0]


def pontos(esqueleto, matriz=None):
    """Mão direita e cabeça em relação ao quadril, e a altura do quadril (no mundo)."""
    matriz = Matrix() if matriz is None else matriz

    def mundo(nome):
        return matriz @ (esqueleto.matrix_world @ esqueleto.pose.bones[nome].head)

    quadril = mundo("mixamorig:Hips")
    return mundo("mixamorig:RightHand") - quadril, mundo("mixamorig:Head") - quadril, quadril.z


def carregar_animacao(nome_clipe, arquivo, esqueleto, conversao, comprimentos):
    """Passa a animação do arquivo do Mixamo pro esqueleto da peça, quadro a quadro.

    O esqueleto das animações é o mesmo do peão (ossos do mesmo tamanho), mas o Mixamo grava as
    animações sobre outra pose de descanso (pernas retas, braços nivelados) — as rotações gravadas
    são relativas a essa pose, então copiar as curvas direto entortaria o peão. Em vez disso, em
    cada quadro, cada osso recebe a orientação de verdade (no espaço do esqueleto) do osso de mesmo
    nome no arquivo, que independe da pose de descanso; o quadril recebe também a posição."""
    novos = importar_fbx(os.path.join(PASTA, arquivo))
    origem = next(o for o in novos if o.type == "ARMATURE")
    diferenca = max(abs(osso.length - comprimentos[osso.name]) for osso in origem.data.bones)
    assert diferenca < 0.05, f"{arquivo}: o esqueleto não é o do peão (ossos com até {diferenca:.2f} de diferença)"
    acao_origem = origem.animation_data.action
    inicio, fim = (int(q) for q in acao_origem.frame_range)

    acao = bpy.data.actions.new(nome_clipe)
    acao.use_fake_user = True
    usar_acao_nova(esqueleto, acao)
    ossos = [pose_osso for pose_osso in esqueleto.pose.bones if pose_osso.name in origem.pose.bones]
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "QUATERNION"
    # do espaço do esqueleto do arquivo pro espaço do esqueleto da peça (que já está no mundo, sem
    # transformação): o próprio objeto do arquivo (escala do FBX, Z pra cima do Blender), depois
    # giro de 180° e metade do tamanho
    para_peca = conversao @ origem.matrix_world
    anteriores = {}
    for quadro in range(inicio, fim + 1):
        bpy.context.scene.frame_set(quadro)
        posados = {}
        for pose_osso in ossos:
            posicao, giro, _ = (para_peca @ origem.pose.bones[pose_osso.name].matrix).decompose()
            posados[pose_osso.name] = Matrix.LocRotScale(posicao, giro, None)
        for pose_osso in ossos:
            descanso = pose_osso.bone.matrix_local
            pai = pose_osso.parent
            if pai is None:
                local = descanso.inverted() @ posados[pose_osso.name]
            else:
                relativo_descanso = pai.bone.matrix_local.inverted() @ descanso
                local = relativo_descanso.inverted() @ posados[pai.name].inverted() @ posados[pose_osso.name]
            giro = local.to_quaternion()
            # mesma volta, sinal do quatérnio contínuo (senão a interpolação dá a volta longa)
            if pose_osso.name in anteriores and anteriores[pose_osso.name].dot(giro) < 0:
                giro.negate()
            anteriores[pose_osso.name] = giro
            pose_osso.rotation_quaternion = giro
            pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
            # posição com chave em todos os ossos (não só no quadril): o Parado desloca ombros e
            # quadris, e um osso sem chave aqui herdaria esse deslocamento (no Blender e na mistura
            # entre clipes do Three.js) — nos outros ossos ela dá zero (mesmo comprimento de osso)
            pose_osso.location = local.translation
            pose_osso.keyframe_insert("location", frame=quadro)

    # confere quadro a quadro que a peça faz o mesmo movimento do arquivo do Mixamo
    usar_acao(esqueleto, acao)
    pior = 0.0
    for quadro in range(inicio, fim + 1, 3):
        bpy.context.scene.frame_set(quadro)
        mao_o, cabeca_o, z_o = pontos(origem, conversao)
        mao, cabeca, z = pontos(esqueleto)
        pior = max(pior, (mao - mao_o).length, (cabeca - cabeca_o).length, abs(z - z_o))
    assert pior < 0.005, f"{arquivo}: movimento diferente do original ({pior:.4f} m)"

    for objeto in novos:
        bpy.data.objects.remove(objeto, do_unlink=True)
    log(f"{nome_clipe} ← {arquivo}: quadros {inicio}-{fim}, igual ao Mixamo (diferença máx. {pior * 1000:.1f} mm)")
    return acao


def ficar_no_lugar(esqueleto, acao):
    """Tira o avanço do quadril (o Mixamo anda pra frente de verdade no walk e em alguns golpes;
    no jogo quem leva a peça é o código) — fica só o sobe-e-desce e o balanço do corpo. Só os eixos
    horizontais: o vertical do quadril (o eixo do osso que aponta pra cima) fica como está.
    Devolve a velocidade (unidades por segundo) com que o corpo avançava antes."""

    def quadril_nas_pontas():
        usar_acao(esqueleto, acao)
        posicoes = []
        # o golpe acelerado tem chaves em quadros fracionados: avalia exatamente no primeiro e no último
        for quadro in acao.frame_range:
            bpy.context.scene.frame_set(int(quadro), subframe=quadro - int(quadro))
            posicoes.append(esqueleto.matrix_world @ esqueleto.pose.bones["mixamorig:Hips"].head)
        return (posicoes[1] - posicoes[0]).xy.length

    duracao = (acao.frame_range[1] - acao.frame_range[0]) / FPS
    velocidade = quadril_nas_pontas() / duracao
    descanso = esqueleto.data.bones["mixamorig:Hips"].matrix_local
    vertical = max(range(3), key=lambda eixo: abs(descanso.col[eixo].z))
    for curva in curvas(acao):
        if curva.data_path != 'pose.bones["mixamorig:Hips"].location' or curva.array_index == vertical:
            continue
        pontos_curva = curva.keyframe_points
        q0, v0 = pontos_curva[0].co
        q1, v1 = pontos_curva[-1].co
        for ponto in pontos_curva:
            correcao = (v1 - v0) * (ponto.co.x - q0) / (q1 - q0)
            ponto.co.y -= correcao
            ponto.handle_left.y -= correcao
            ponto.handle_right.y -= correcao
    deriva = quadril_nas_pontas()
    assert deriva < 0.005, f"{acao.name} ainda sai do lugar ({deriva:.3f} m)"
    return velocidade


def ajustar_golpe(acao, inicio, impacto, fim):
    """Corta o golpe entre o início e o fim e muda a velocidade pro impacto cair no instante do
    impacto do jogo."""
    quadro_impacto_jogo = 1 + DURACAO_GOLPE_JOGO * INSTANTE_IMPACTO_JOGO * FPS
    escala = (quadro_impacto_jogo - 1) / (impacto - inicio)
    for curva in curvas(acao):
        pontos_curva = curva.keyframe_points
        for indice in reversed(range(len(pontos_curva))):
            quadro = pontos_curva[indice].co.x
            if quadro < inicio - 1e-3 or quadro > fim + 1e-3:
                pontos_curva.remove(pontos_curva[indice])
        for ponto in pontos_curva:
            for par in (ponto.co, ponto.handle_left, ponto.handle_right):
                par.x = 1 + (par.x - inicio) * escala
        curva.update()
    duracao = (acao.frame_range[1] - 1) / FPS
    log(f"{acao.name}: quadros {inicio}-{fim}, velocidade {1 / escala:.2f}x → {duracao:.2f} s, impacto em {(quadro_impacto_jogo - 1) / FPS:.2f} s")


def criar_parado(esqueleto, malha, juntas, em_pe):
    """Clipe "Parado": em pé normal (braços caídos, pernas retas, corpo ereto) — exatamente a pose
    original do peão. Cada membro volta da pose T girando em volta da MESMA junta do peão original
    (não da junta do Mixamo, que fica uns 3 cm pra fora — o braço sairia do ombro), então o osso
    ganha também um deslocamento além do giro. Todos os ossos têm chave (os não citados em
    VOLTA_DA_POSE_T ficam no descanso): ossos sem chave voltariam pra pose T no Three.js ao terminar
    um gesto."""
    acao = bpy.data.actions.new("Parado")
    acao.use_fake_user = True
    usar_acao_nova(esqueleto, acao)
    posados = {}
    for osso_mixamo, junta, angulo in VOLTA_DA_POSE_T:
        pivo = juntas[junta]
        giro = Matrix.Translation(pivo) @ Matrix.Rotation(angulo, 4, "Y") @ Matrix.Translation(-pivo)
        posados[osso_mixamo] = giro @ esqueleto.data.bones[osso_mixamo].matrix_local
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "QUATERNION"
        # pai sempre no descanso aqui (só ombros/quadris giram), então a base local é direta
        local = pose_osso.bone.matrix_local.inverted() @ posados[pose_osso.name] if pose_osso.name in posados else Matrix()
        pose_osso.rotation_quaternion = local.to_quaternion()
        pose_osso.location = local.translation
        # duas chaves iguais (1 s): clipe com duração zero dá problema no AnimationMixer do Three.js
        for quadro in (1, 1 + FPS):
            pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
            pose_osso.keyframe_insert("location", frame=quadro)

    # confere: com o Parado, cada vértice volta pro lugar em que estava no peão original em pé
    usar_acao(esqueleto, acao)
    bpy.context.scene.frame_set(1)
    avaliada = malha.evaluated_get(bpy.context.evaluated_depsgraph_get())
    pior = max((avaliada.matrix_world @ v.co - original).length for v, original in zip(avaliada.data.vertices, em_pe))
    assert pior < 0.002, f"o Parado não bate com o peão original em pé ({pior * 1000:.1f} mm)"
    log(f"Parado: em pé igual ao peão original (diferença máx. {pior * 1000:.2f} mm)")
    return acao


def mortal(tombo):
    """Chaves do mortal pra trás, quadro a quadro (30 por segundo) — cada chave dá o valor de
    alguns controles do corpo naquele quadro; entre as chaves cada controle segue uma curva suave.
    Controles (graus, ou metros no z/y):
        giro         corpo inteiro em volta do quadril (eixo X): + = pra trás; 360 = volta completa
        tronco       coluna (- = curva pra frente), cabeca (- = queixo no peito)
        cabeca_lado  cabeça balançando de lado (tontura)
        braco        os dois braços pra frente/cima (+) ou pra trás (-); cotovelo dobra o antebraço
        coxa         quadril dobrado (+ = coxa pra frente), joelho (- = dobra), pe (+ = ponta pra cima)
        plantar      1 = pés presos no chão (o quadril se ajusta sozinho); 0 = altura livre, dada por z
        z            altura do quadril acima da altura em pé (só vale quando não está plantado)
    O mortal de verdade: agacha (anticipação), estende o corpo jogando os braços pra cima
    (impulso), sobe grupado (joelhos no peito, mãos nas canelas — gira mais rápido), abre antes de
    chegar ao chão, aterrissa com os joelhos dobrados amortecendo e levanta. No tombo, gira demais:
    aterrissa inclinado pra trás, perde o equilíbrio agitando os braços, cai sentado, fica meio tonto
    e levanta."""
    chaves = {
        1: dict(giro=0, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
        7: dict(tronco=-25, cabeca=10, braco=-45, cotovelo=10, coxa=65, joelho=-100, pe=30, plantar=1),
        12: dict(giro=15, tronco=8, cabeca=5, braco=165, cotovelo=5, coxa=5, joelho=-5, pe=-25, plantar=1),
        16: dict(giro=70, tronco=-10, braco=125, cotovelo=20, coxa=60, joelho=-80, pe=0),
        20: dict(giro=150, tronco=-35, cabeca=-20, braco=60, cotovelo=70, coxa=115, joelho=-140),
        25: dict(giro=250, tronco=-35, cabeca=-20, braco=60, cotovelo=70, coxa=115, joelho=-140),
        30: dict(giro=320, tronco=-15, cabeca=0, braco=90, cotovelo=20, coxa=70, joelho=-70),
    }
    # no ar o quadril faz um arco de salto (parábola) entre a saída (quadro 13) e a chegada
    saida, chegada = 13, 36
    altura_saida, altura_chegada, apice = 0.02, -0.12 if not tombo else -0.08, 0.42
    chaves[saida] = dict(plantar=0)
    for quadro in range(saida, chegada + 1, 3):
        s = (quadro - saida) / (chegada - saida)
        chaves.setdefault(quadro, {})["z"] = altura_saida + (altura_chegada - altura_saida) * s + 4 * apice * s * (1 - s)
    if not tombo:
        chaves.update(
            {
                34: dict(giro=355, tronco=-10, braco=70, cotovelo=15, coxa=35, joelho=-40, pe=10, z=-0.06, plantar=0),
                37: dict(giro=360, tronco=-25, cabeca=5, braco=45, cotovelo=10, coxa=65, joelho=-100, pe=30, plantar=1),
                42: dict(giro=360, tronco=-15, braco=30, coxa=45, joelho=-70, pe=20, plantar=1),
                50: dict(giro=360, tronco=0, cabeca=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1),
                56: dict(giro=360, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
            }
        )
        return chaves
    chaves.update(
        {
            33: dict(giro=375, tronco=-5, braco=110, cotovelo=10, coxa=40, joelho=-40, pe=10, plantar=0),
            36: dict(giro=395, tronco=0, braco=140, cotovelo=20, coxa=55, joelho=-60, pe=20, plantar=1),
            # perdeu o equilíbrio: os braços agitam pra frente e o quadril cai
            40: dict(giro=405, braco=150, cotovelo=35, coxa=80, joelho=-40, pe=10, plantar=0, z=-0.2),
            # sentado no chão (tronco um pouco pra trás, pernas esticadas na horizontal: coxa =
            # 90 - inclinação), braços pra trás apoiando, cabeça chicoteia pra trás
            44: dict(giro=384, tronco=0, cabeca=25, braco=-50, cotovelo=10, coxa=68, joelho=-8, pe=0, plantar=0, z=-0.33),
            47: dict(giro=388, cabeca=10, coxa=66, z=-0.31),
            52: dict(giro=380, cabeca=-10, coxa=70, z=-0.33),
            # tontura: a cabeça balança de um lado pro outro
            56: dict(cabeca=-5, cabeca_lado=20),
            60: dict(cabeca_lado=-20),
            64: dict(cabeca_lado=15),
            68: dict(cabeca=0, cabeca_lado=0, giro=380, braco=-50, coxa=70, joelho=-8, z=-0.33, plantar=0),
            # levanta: inclina pra frente com os pés por baixo do corpo e empurra o chão
            75: dict(giro=345, tronco=-30, braco=60, cotovelo=20, coxa=125, joelho=-150, pe=35, z=-0.24, plantar=0),
            82: dict(giro=360, tronco=-25, braco=30, cotovelo=10, coxa=70, joelho=-100, pe=30, plantar=1),
            92: dict(giro=360, tronco=0, cabeca=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1),
            96: dict(giro=360, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
        }
    )
    return chaves


def comemorar():
    """Comemoração (xeque-mate, ou um aliado que capturou): dois pulos com os braços erguidos —
    agacha, salta esticando o corpo, aterrissa dobrando os joelhos e salta de novo. Mesmos controles
    do mortal (ver mortal)."""
    chaves = {
        1: dict(giro=0, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
        6: dict(tronco=-15, cabeca=5, braco=25, cotovelo=20, coxa=50, joelho=-85, pe=28, plantar=1),
        10: dict(tronco=5, cabeca=-15, braco=170, cotovelo=10, coxa=0, joelho=-5, pe=-20, plantar=1),
        11: dict(plantar=0, z=0.02),
        15: dict(braco=178, cotovelo=25, coxa=25, joelho=-45, pe=10, z=0.17),
        19: dict(braco=160, cotovelo=15, coxa=10, joelho=-15, pe=0, z=0.03, plantar=0),
        20: dict(plantar=1),
        24: dict(tronco=-12, braco=140, cotovelo=30, coxa=48, joelho=-80, pe=26, cabeca=0),
        28: dict(tronco=5, cabeca=-15, braco=175, cotovelo=10, coxa=0, joelho=-5, pe=-20, plantar=1),
        29: dict(plantar=0, z=0.02),
        33: dict(braco=178, cotovelo=25, coxa=25, joelho=-45, pe=10, z=0.15),
        37: dict(braco=150, cotovelo=15, coxa=10, joelho=-15, pe=0, z=0.03, plantar=0),
        38: dict(plantar=1),
        42: dict(tronco=-10, braco=90, cotovelo=30, coxa=40, joelho=-65, pe=20, cabeca=0),
        50: dict(tronco=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1),
        54: dict(giro=0, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0),
    }
    return chaves


# controles "dos dois lados" e os de cada lado que eles preenchem
PARES_DE_LADO = {
    "braco": ("bd", "be"),
    "cotovelo": ("cd", "ce"),
    "coxa": ("coxa_d", "coxa_e"),
    "joelho": ("joelho_d", "joelho_e"),
    "pe": ("pe_d", "pe_e"),
}


def com(base, **valores):
    """Pose `base` com os valores por cima — um controle dos dois lados (ex.: coxa) vale pros dois
    lados (coxa_d e coxa_e), a não ser que a chave traga o lado separado."""
    pose = dict(base)
    for nome, valor in valores.items():
        pose[nome] = valor
        for lado in PARES_DE_LADO.get(nome, ()):
            if lado not in valores:
                pose[lado] = valor
    return pose


def pose_parada(**valores):
    """Todos os controles do corpo no neutro (em pé, Parado), com os valores dados por cima."""
    neutro = dict(
        giro=0, tronco=0, cabeca=0, cabeca_lado=0, braco=0, cotovelo=0, coxa=0, joelho=0, pe=0, plantar=1, z=0,
        bd=0, be=0, cd=0, ce=0, bd_lado=0, be_lado=0, cd_giro=0, ce_giro=0, tronco_giro=0,
        coxa_d=0, coxa_e=0, joelho_d=0, joelho_e=0, abre=0, pe_d=0, pe_e=0,
    )
    return com(neutro, **valores)


def segurar(pose, inicio, fim, respiracao=2.5, passo=12):
    """Mantém a pose de `inicio` a `fim` respirando (o tronco e a cabeça sobem e descem de leve)."""
    chaves = {}
    for n, quadro in enumerate(range(inicio, fim + 1, passo)):
        sinal = 1 if n % 2 == 0 else -1
        chaves[quadro] = com(pose, tronco=pose["tronco"] + sinal * respiracao * 0.5, cabeca=pose["cabeca"] - sinal * respiracao * 0.3)
    return chaves


# base de samurai: pés afastados e os dois joelhos dobrados por igual (os dois pés no chão)
BASE_SAMURAI = dict(coxa=26, joelho=-48, pe=22, abre=11)


def kamae():
    """Chudan no kamae — a guarda do samurai: base firme com os joelhos dobrados, katana apontada
    pra frente na altura do peito do adversário, a mão esquerda junto da direita no cabo."""
    guarda = pose_parada(
        **BASE_SAMURAI, tronco=-6, cabeca=4, tronco_giro=-8,
        bd=62, cd=18, bd_lado=-12, be=58, ce=52, be_lado=-38, ce_giro=20,
    )
    chaves = {1: pose_parada(), 14: guarda}
    chaves.update(segurar(guarda, 26, 110))
    chaves[124] = pose_parada(bd=20, cd=10, be=15, ce=15)
    chaves[134] = pose_parada()
    return chaves


def hasso():
    """Hasso no kamae — a katana erguida na vertical ao lado da cabeça, a mão esquerda junto."""
    guarda = pose_parada(
        **BASE_SAMURAI, tronco=-3, tronco_giro=-14, cabeca=-4,
        bd=40, bd_lado=40, cd=118, cd_giro=10, be=72, ce=105, be_lado=-48, ce_giro=15,
    )
    chaves = {1: pose_parada(), 16: guarda}
    chaves.update(segurar(guarda, 28, 110))
    chaves[124] = pose_parada(bd=25, cd=40, be=20, ce=30)
    chaves[134] = pose_parada()
    return chaves


# ajoelhando: apoia um joelho primeiro, como se ajoelha de verdade
AJOELHANDO = dict(coxa_d=70, joelho_d=-95, coxa_e=-5, joelho_e=-110, pe_d=25, pe_e=40, tronco=-12, bd=10, be=10)
# seiza: sentado sobre os calcanhares
SEIZA = dict(coxa=95, joelho=-165, pe=55)


def meditar():
    """Meditação: ajoelha (seiza), junta as mãos na frente do peito (gassho), baixa a cabeça e
    respira devagar; depois levanta."""
    sentado = pose_parada(
        **SEIZA, tronco=0, cabeca=-14,
        bd=25, be=25, cd=85, ce=85, bd_lado=-10, be_lado=-10, cd_giro=55, ce_giro=55,
    )
    chaves = {
        1: pose_parada(),
        12: pose_parada(**AJOELHANDO),
        24: com(sentado, cabeca=-6, cd_giro=20, ce_giro=20, cd=60, ce=60),
        32: sentado,
    }
    chaves.update(segurar(sentado, 40, 150, respiracao=3, passo=22))
    chaves[164] = pose_parada(**AJOELHANDO)
    chaves[176] = pose_parada()
    return chaves


def reverencia():
    """Reverência de respeito: curva o tronco devagar com as mãos nas coxas, segura e levanta."""
    curvado = pose_parada(tronco=-52, cabeca=-12, bd=12, be=12, cd=8, ce=8)
    return {
        1: pose_parada(),
        22: curvado,
        40: com(curvado, tronco=-55),
        58: curvado,
        78: pose_parada(),
        84: pose_parada(),
    }


def sacrificio():
    """Honra do samurai derrotado (peão capturado por outro peão): ajoelha (seiza), pousa as mãos nas
    coxas, curva-se numa reverência profunda e devagar e tomba pra frente, imóvel — estilizado, sem
    mostrar ferimento nenhum. Termina caído (o jogo some com ele em seguida)."""
    sentado = pose_parada(**SEIZA, cabeca=-6, bd=14, be=14, cd=20, ce=20)
    curvado = com(sentado, tronco=-62, cabeca=-22, bd=40, be=40, cd=30, ce=30)
    caido = com(curvado, giro=-72, tronco=-26, cabeca=-8, bd=-20, be=-15, cd=5, ce=5, coxa=78, joelho=-148, plantar=0, z=-0.325)
    return {
        1: pose_parada(),
        12: pose_parada(**AJOELHANDO),
        26: sentado,
        44: com(sentado, cabeca=-14),
        70: curvado,
        86: com(curvado, tronco=-66),
        # tomba pra frente: o corpo inteiro gira por cima dos joelhos até o chão (a altura passa aos
        # poucos de "plantada nos pés" pra livre, sem pulo)
        104: com(caido, giro=-68, tronco=-30, cabeca=-10, coxa=80, joelho=-150, z=-0.3),
        112: com(caido, giro=-74, z=-0.33),
        120: caido,
    }


# clipes do peão feitos aqui (nome no jogo → chaves). Os "Gesto…" entram no sorteio dos gestos
# ocasionais do peão (a guarda e a katana erguida com a katana na mão; a meditação sem ela);
# "Reverencia"/"Sacrificio" são da captura de peão por peão (ver capturarComHonra no jogo)
CLIPES_PEAO = {
    "GestoKamae": kamae,
    "GestoHasso": hasso,
    "GestoMeditar": meditar,
    "Reverencia": reverencia,
    "Sacrificio": sacrificio,
}


def suavizar(malha):
    """Sombreado suave nas superfícies curvas (cilindros, esferas) e quinas vivas onde as faces se
    encontram num ângulo forte (caixas, tampas) — o visual "HD" sem perder o recorte das peças."""
    malha.data.shade_smooth()
    malha.data.set_sharp_from_angle(angle=math.radians(40))


def curva_suave(pontos, quadro):
    """Catmull-Rom entre as chaves (passa por todas, sem parar em cada uma); fora delas, constante."""
    quadros = sorted(pontos)
    if quadro <= quadros[0]:
        return pontos[quadros[0]]
    if quadro >= quadros[-1]:
        return pontos[quadros[-1]]
    i = max(k for k in range(len(quadros)) if quadros[k] <= quadro)
    q1, q2 = quadros[i], quadros[i + 1]
    q0 = quadros[i - 1] if i > 0 else q1
    q3 = quadros[i + 2] if i + 2 < len(quadros) else q2
    p0, p1, p2, p3 = pontos[q0], pontos[q1], pontos[q2], pontos[q3]
    t = (quadro - q1) / (q2 - q1)
    # tangentes com o espaçamento irregular das chaves levado em conta
    m1 = (p2 - p0) / (q2 - q0) * (q2 - q1) if q2 != q0 else 0
    m2 = (p3 - p1) / (q3 - q1) * (q2 - q1) if q3 != q1 else 0
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2


def criar_mortal(esqueleto, parado, nome, chaves):
    """Monta o clipe do mortal quadro a quadro a partir das chaves de mortal(): cada controle vira
    um giro de osso em volta de um eixo do corpo (como se o peão estivesse em pé), aplicado por cima
    da pose Parado; o quadril é posto por último — nos quadros plantados, de modo que o pé mais baixo
    fique no chão e os pés não escorreguem pra frente/trás; no ar, na altura z."""
    controles = {}
    for quadro, valores in chaves.items():
        for controle, valor in valores.items():
            controles.setdefault(controle, {})[quadro] = valor
    ultimo = max(chaves)

    usar_acao(esqueleto, parado)
    bpy.context.scene.frame_set(1)
    ossos = esqueleto.pose.bones
    base_parado = {p.name: p.matrix_basis.copy() for p in ossos}
    giro_parado = {p.name: p.matrix.to_3x3().normalized() for p in ossos}
    pes_parado = [(esqueleto.matrix_world @ ossos[n].head).copy() for n in ("mixamorig:LeftFoot", "mixamorig:RightFoot")]
    descanso_quadril = ossos["mixamorig:Hips"].bone.matrix_local
    cabeca_quadril_parado = (esqueleto.matrix_world @ ossos["mixamorig:Hips"].head).copy()

    def no_corpo(nome_osso, eixo, graus):
        """Giro em volta de um eixo do corpo em pé, convertido pro espaço do osso."""
        giro = Matrix.Rotation(math.radians(graus), 3, eixo)
        frame = giro_parado[nome_osso]
        return (frame.inverted() @ giro @ frame).to_4x4()

    acao = bpy.data.actions.new(nome)
    acao.use_fake_user = True
    usar_acao_nova(esqueleto, acao)
    anteriores = {}
    for quadro in range(1, ultimo + 1):
        v = {controle: curva_suave(pontos, quadro) for controle, pontos in controles.items()}
        # controles por lado (bd/be, cd/ce, coxa_d/coxa_e, joelho_d/joelho_e) caem no controle dos
        # dois lados quando a chave não traz o lado separado
        def c(nome, padrao=0.0):
            return v.get(nome, padrao)

        extra = {
            "mixamorig:Hips": no_corpo("mixamorig:Hips", "X", v["giro"]),
            # giro + em X leva o topo pra trás (-Y): curvar pra frente (tronco/cabeça negativos) é
            # giro negativo; num membro pendurado, giro + leva a ponta pra frente
            "mixamorig:Spine": no_corpo("mixamorig:Spine", "X", v["tronco"] / 3),
            "mixamorig:Spine1": no_corpo("mixamorig:Spine1", "X", v["tronco"] / 3),
            "mixamorig:Spine2": no_corpo("mixamorig:Spine2", "X", v["tronco"] / 3) @ no_corpo("mixamorig:Spine2", "Z", c("tronco_giro")),
            "mixamorig:Head": no_corpo("mixamorig:Head", "X", v["cabeca"]) @ no_corpo("mixamorig:Head", "Z", v["cabeca_lado"]),
            # braço: pra frente (X) e abrindo pro lado (Y; negativo cruza pra frente do corpo);
            # antebraço: dobra (X) e gira na horizontal pra dentro (Z)
            "mixamorig:LeftArm": no_corpo("mixamorig:LeftArm", "X", c("be", v["braco"])) @ no_corpo("mixamorig:LeftArm", "Y", c("be_lado")),
            "mixamorig:RightArm": no_corpo("mixamorig:RightArm", "X", c("bd", v["braco"])) @ no_corpo("mixamorig:RightArm", "Y", -c("bd_lado")),
            # (o giro pra dentro vem depois de dobrar — com o antebraço ainda pendurado na vertical,
            # girar em volta da vertical não faria nada)
            "mixamorig:LeftForeArm": no_corpo("mixamorig:LeftForeArm", "Z", -c("ce_giro")) @ no_corpo("mixamorig:LeftForeArm", "X", c("ce", v["cotovelo"])),
            "mixamorig:RightForeArm": no_corpo("mixamorig:RightForeArm", "Z", c("cd_giro")) @ no_corpo("mixamorig:RightForeArm", "X", c("cd", v["cotovelo"])),
            "mixamorig:LeftUpLeg": no_corpo("mixamorig:LeftUpLeg", "Y", c("abre")) @ no_corpo("mixamorig:LeftUpLeg", "X", c("coxa_e", v["coxa"])),
            "mixamorig:RightUpLeg": no_corpo("mixamorig:RightUpLeg", "Y", -c("abre")) @ no_corpo("mixamorig:RightUpLeg", "X", c("coxa_d", v["coxa"])),
            "mixamorig:LeftLeg": no_corpo("mixamorig:LeftLeg", "X", c("joelho_e", v["joelho"])),
            "mixamorig:RightLeg": no_corpo("mixamorig:RightLeg", "X", c("joelho_d", v["joelho"])),
            "mixamorig:LeftFoot": no_corpo("mixamorig:LeftFoot", "X", c("pe_e", v["pe"])),
            "mixamorig:RightFoot": no_corpo("mixamorig:RightFoot", "X", c("pe_d", v["pe"])),
        }
        for pose_osso in ossos:
            pose_osso.rotation_mode = "QUATERNION"
            pose_osso.matrix_basis = base_parado[pose_osso.name] @ extra.get(pose_osso.name, Matrix())
        quadril = ossos["mixamorig:Hips"]
        quadril.location = base_parado["mixamorig:Hips"].translation
        bpy.context.view_layer.update()

        # onde o quadril tem que ficar: plantado (pé mais baixo no chão, pés no lugar) ou no ar
        atual = esqueleto.matrix_world @ quadril.head
        pes = [esqueleto.matrix_world @ ossos[n].head for n in ("mixamorig:LeftFoot", "mixamorig:RightFoot")]
        baixo = min(pes, key=lambda p: p.z)
        alvo_plantado = atual + Vector((0, (pes_parado[0].y - (pes[0].y + pes[1].y) / 2), pes_parado[0].z - baixo.z))
        alvo_livre = cabeca_quadril_parado + Vector((0, 0, v["z"]))
        peso = min(1.0, max(0.0, v["plantar"]))
        alvo = alvo_plantado * peso + alvo_livre * (1 - peso)
        quadril.location = base_parado["mixamorig:Hips"].translation + descanso_quadril.to_3x3().inverted() @ (alvo - atual)

        for pose_osso in ossos:
            giro = pose_osso.rotation_quaternion.copy()
            if pose_osso.name in anteriores and anteriores[pose_osso.name].dot(giro) < 0:
                giro.negate()
                pose_osso.rotation_quaternion = giro
            anteriores[pose_osso.name] = giro
            pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
            pose_osso.keyframe_insert("location", frame=quadro)
    log(f"{nome}: {ultimo} quadros ({(ultimo - 1) / FPS:.1f} s)")
    return acao


def chavear_pose(esqueleto, bases, quadro, anteriores):
    """Grava a pose (matriz local de cada osso) como chave no quadro, com o sinal do quatérnio
    contínuo em relação ao quadro anterior (senão a interpolação dá a volta longa)."""
    for pose_osso in esqueleto.pose.bones:
        pose_osso.rotation_mode = "QUATERNION"
        posicao, giro, _ = bases[pose_osso.name].decompose()
        if pose_osso.name in anteriores and anteriores[pose_osso.name].dot(giro) < 0:
            giro.negate()
        anteriores[pose_osso.name] = giro
        pose_osso.location = posicao
        pose_osso.rotation_quaternion = giro
        pose_osso.scale = (1, 1, 1)
        pose_osso.keyframe_insert("rotation_quaternion", frame=quadro)
        pose_osso.keyframe_insert("location", frame=quadro)


def compor(esqueleto, nome, partes, velocidade):
    """Clipe novo emendando trechos de outros clipes — cada trecho (ação, quadro inicial, quadro
    final) vai de um quadro ao outro, de trás pra frente se o final vier antes —, tocado na
    velocidade dada. Devolve a ação e uma função que diz em que segundo do clipe novo cai um quadro
    de um dos trechos (pra marcar o instante em que a espada entra/sai da bainha)."""
    comprimentos = [abs(fim - inicio) for _, inicio, fim in partes]
    total = sum(comprimentos)
    quadros_novos = round(total / velocidade) + 1
    amostras = []
    for i in range(quadros_novos):
        u = i * total / (quadros_novos - 1)
        for (acao, inicio, fim), comprimento in zip(partes, comprimentos):
            if u <= comprimento + 1e-6 or (acao, inicio, fim) == partes[-1]:
                sentido = 1 if fim >= inicio else -1
                amostras.append((acao, inicio + sentido * min(u, comprimento)))
                break
            u -= comprimento
    bases_por_quadro = []
    for acao, quadro in amostras:
        usar_acao(esqueleto, acao)
        bpy.context.scene.frame_set(int(quadro), subframe=quadro - int(quadro))
        bases_por_quadro.append({p.name: p.matrix_basis.copy() for p in esqueleto.pose.bones})
    nova = bpy.data.actions.new(nome)
    nova.use_fake_user = True
    usar_acao_nova(esqueleto, nova)
    anteriores = {}
    for i, bases in enumerate(bases_por_quadro):
        chavear_pose(esqueleto, bases, i + 1, anteriores)

    def segundo(indice_parte, quadro_origem):
        _, inicio, _ = partes[indice_parte]
        antes = sum(comprimentos[:indice_parte])
        return (antes + abs(quadro_origem - inicio)) / total * (quadros_novos - 1) / FPS

    log(f"{nome}: {quadros_novos} quadros ({(quadros_novos - 1) / FPS:.2f} s)")
    return nova, segundo


def armar_peao(malha, esqueleto, embainhar_mixamo, cabo_antigo):
    """Espada e bainha do peão, encaixadas nas animações de bainha do Mixamo:
    - a espada fica na malha, presa na mão direita, empunhada no PUNHO na direção EMPUNHADURA (o
      jogo só mostra quando ela está desembainhada — material EspadaLamina/EspadaCabo);
    - a bainha vai exatamente onde a mão do "sheath sword 1" para no quadril (o quadro em que a mão
      passa mais perto da bainha antiga), na direção em que a lâmina chega ali — assim a espada entra
      e sai dela de verdade. O cabo que fica pra fora (material CaboBainha) é o mesmo da espada, e o
      jogo esconde enquanto a espada está na mão.
    Devolve o quadro do "sheath sword 1" em que a espada entra na bainha."""
    ossos = esqueleto.pose.bones
    mao_descanso = esqueleto.data.bones["mixamorig:RightHand"].matrix_local
    quadril_descanso = esqueleto.data.bones["mixamorig:Hips"].matrix_local
    punho_na_mao = mao_descanso.inverted() @ PUNHO
    usar_acao(esqueleto, embainhar_mixamo)
    inicio, fim = (int(q) for q in embainhar_mixamo.frame_range)

    def no_quadro(quadro):
        bpy.context.scene.frame_set(quadro)
        mao = ossos["mixamorig:RightHand"].matrix
        quadril = ossos["mixamorig:Hips"].matrix
        punho = mao @ punho_na_mao
        cabo = quadril @ quadril_descanso.inverted() @ cabo_antigo
        giro_mao = mao.to_3x3() @ mao_descanso.to_3x3().inverted()
        lamina = (giro_mao @ EMPUNHADURA).normalized()
        curva = (giro_mao @ CURVA_EMPUNHADURA).normalized()
        return punho, cabo, lamina, curva, quadril

    contato = min(range(inicio, fim + 1), key=lambda q: (no_quadro(q)[0] - no_quadro(q)[1]).length)
    punho, _, lamina, curva, quadril = no_quadro(contato)
    para_descanso = quadril_descanso @ quadril.inverted()
    punho_bainha = para_descanso @ punho
    direcao_bainha = (para_descanso.to_3x3() @ lamina).normalized()
    curva_bainha = (para_descanso.to_3x3() @ curva).normalized()
    esqueleto.animation_data.action = None

    # a saya começa logo depois da tsuba e curva junto com a lâmina guardada dentro dela
    raio_saya, comprimento_saya = SAYA
    boca = punho_bainha + direcao_bainha * (CABO_KATANA[1] - CABO_ATRAS_DO_PUNHO + TSUBA[1])
    secao_saya = [(raio_saya * math.cos(a), raio_saya * 0.75 * math.sin(a)) for a in (2 * math.pi * k / 12 for k in range(12))]
    partes = partes_da_katana("Katana", PUNHO, EMPUNHADURA, CURVA_EMPUNHADURA, "EspadaCabo", "EspadaLamina", "mixamorig:RightHand")
    partes += partes_da_katana("Embainhada", punho_bainha, direcao_bainha, curva_bainha, "CaboBainha", None, "mixamorig:Hips")
    partes.append(malha_curva("Saya", boca, direcao_bainha, curva_bainha, comprimento_saya, secao_saya, "BainhaKatana", "mixamorig:Hips"))
    juntar_na_malha(malha, partes)
    log(f"peão: katana na mão e saya no quadril (a mão chega na bainha no quadro {contato} do {ARQUIVOS_BAINHA[0]})")
    return contato


def clipes_da_bainha(esqueleto, conversao, comprimentos, malha_peao, cabo_antigo):
    """Desembainhar e Embainhar (ver ARQUIVOS_BAINHA), já com a espada e a bainha montadas no peão.
    Grava no esqueleto (vai pro .glb como "extras") em que segundo de cada clipe a espada sai da
    bainha e em que segundo ela entra — o jogo mostra/esconde a espada nesses instantes."""
    bainha1 = carregar_animacao("_Bainha1", ARQUIVOS_BAINHA[0], esqueleto, conversao, comprimentos)
    bainha2 = carregar_animacao("_Bainha2", ARQUIVOS_BAINHA[1], esqueleto, conversao, comprimentos)
    contato = armar_peao(malha_peao, esqueleto, bainha1, cabo_antigo)
    fim1, fim2 = int(bainha1.frame_range[1]), int(bainha2.frame_range[1])
    embainhar, segundo_embainhar = compor(esqueleto, "Embainhar", [(bainha1, 1, fim1), (bainha2, 1, fim2)], VELOCIDADE_BAINHA)
    desembainhar, segundo_desembainhar = compor(esqueleto, "Desembainhar", [(bainha2, fim2, 1), (bainha1, fim1, 1)], VELOCIDADE_BAINHA)
    esqueleto["segundo_saque"] = round(segundo_desembainhar(1, contato), 3)
    esqueleto["segundo_guarda"] = round(segundo_embainhar(0, contato), 3)
    log(f"espada sai da bainha em {esqueleto['segundo_saque']} s do Desembainhar e entra em {esqueleto['segundo_guarda']} s do Embainhar")
    for acao in (bainha1, bainha2):
        bpy.data.actions.remove(acao)
    return {"Desembainhar": desembainhar, "Embainhar": embainhar}


# ---- cavalo: o cavaleiro (mesmo corpo e esqueleto das outras peças) montado num cavalo ----
# Cavalo parado: frente em +Y como as peças, esquerda em -X, cascos no chão (z=0). Quando empina,
# ele gira em volta do eixo das patas traseiras; quando corcoveia, em volta do das dianteiras.
EIXO_TRASEIRO = Vector((0, -0.17, 0.34))
EIXO_DIANTEIRO = Vector((0, 0.17, 0.34))
OSSOS_CAVALO = {  # nome: (cabeça, ponta, pai)
    "Cavalo": (EIXO_TRASEIRO, EIXO_DIANTEIRO, None),
    "Pescoco": (Vector((0, 0.21, 0.47)), Vector((0, 0.32, 0.66)), "Cavalo"),
    "Cauda": (Vector((0, -0.23, 0.45)), Vector((0, -0.33, 0.32)), "Cavalo"),
}
PATAS = {"DE": (-0.055, 0.17), "DD": (0.055, 0.17), "TE": (-0.055, -0.17), "TD": (0.055, -0.17)}  # dianteira/traseira, esquerda/direita
for _pata, (_x, _y) in PATAS.items():
    OSSOS_CAVALO[f"Pata_{_pata}"] = (Vector((_x, _y, 0.34)), Vector((_x, _y, 0.18)), "Cavalo")
    OSSOS_CAVALO[f"Canela_{_pata}"] = (Vector((_x, _y, 0.18)), Vector((_x, _y, 0.02)), f"Pata_{_pata}")
# peças do cavalo, no mesmo estilo das peças (primitivas simples, facetadas): o corpo na cor da
# facção, crina/cauda/cascos/sela na cor de detalhe — (nome, forma, medidas, posição, giro,
# material, osso)
PECAS_CAVALO = [
    ("CorpoCavalo", "caixa", (0.16, 0.46, 0.15), (0, 0, 0.40), (0, 0, 0), "Corpo", "Cavalo"),
    ("Sela", "caixa", (0.17, 0.14, 0.03), (0, -0.02, 0.49), (0, 0, 0), "Detalhe", "Cavalo"),
    ("PescocoCavalo", "caixa", (0.075, 0.09, 0.25), (0, 0.265, 0.565), (-0.52, 0, 0), "Corpo", "Pescoco"),
    ("CabecaCavalo", "caixa", (0.075, 0.19, 0.08), (0, 0.385, 0.64), (-0.35, 0, 0), "Corpo", "Pescoco"),
    ("Orelha_E", "cone", (0.014, 0.0, 0.045), (-0.022, 0.33, 0.715), (0, 0, 0), "Detalhe", "Pescoco"),
    ("Orelha_D", "cone", (0.014, 0.0, 0.045), (0.022, 0.33, 0.715), (0, 0, 0), "Detalhe", "Pescoco"),
    ("Crina", "caixa", (0.02, 0.06, 0.25), (0, 0.245, 0.6), (-0.52, 0, 0), "Detalhe", "Pescoco"),
    ("CaudaCavalo", "cone", (0.028, 0.0, 0.2), (0, -0.29, 0.37), (2.5, 0, 0), "Detalhe", "Cauda"),
]
for _pata, (_x, _y) in PATAS.items():
    PECAS_CAVALO += [
        (f"Coxa_{_pata}", "cilindro", (0.028, 0.028, 0.16), (_x, _y, 0.26), (0, 0, 0), "Corpo", f"Pata_{_pata}"),
        (f"Canela_{_pata}", "cilindro", (0.022, 0.022, 0.14), (_x, _y, 0.11), (0, 0, 0), "Corpo", f"Canela_{_pata}"),
        (f"Casco_{_pata}", "cilindro", (0.03, 0.03, 0.035), (_x, _y, 0.0175), (0, 0, 0), "Detalhe", f"Canela_{_pata}"),
    ]
# onde fica o quadril do cavaleiro sentado (a sela tem o topo em z=0,505)
ASSENTO = Vector((0, -0.02, 0.56))
# quina de baixo, à esquerda, do corpo do cavalo — o eixo em volta do qual ele tomba de lado
PIVO_ROLO = Vector((-0.08, 0, 0.325))
# no salto (o clipe Mortal do cavalo), o quadro em que ele sai do chão e o quadro em que pousa — vão
# pro .glb ("segundo_decola"/"segundo_pousa"): o jogo usa o salto pra levar o cavalo de casa em
# casa, deslocando ele só enquanto está no ar
QUADROS_SALTO = (13, 35)

# controles de cada quadro (graus, ou metros nos deslocamentos). Cavalo: cav_y/cav_z deslocam o
# corpo; cav_giro inclina o corpo (+ = focinho pra cima) em volta do pivô (pivo 0 = patas
# traseiras, 1 = dianteiras); cav_rolo tomba o corpo de lado (+ = pra esquerda, em volta da quina
# de baixo do corpo); pescoco (+ = cabeça pra cima), cauda; p<pata> balança a pata (+ = pra
# frente, medido na vertical, não no corpo inclinado) e j<pata> dobra o joelho. Cavaleiro: sela_y/
# sela_z deslocam ele na sela; inclina (+ = pra trás); tronco/cabeca (- = pra frente),
# cabeca_lado; bd/be braço direito/esquerdo (+ = pra frente), bd_lado/be_lado (abrindo pro lado),
# cd/ce cotovelos; coxa/abre/joelho = as pernas montadas (coxa pra frente, aberta pros lados).
PADRAO_CAVALEIRO = dict(
    cav_y=0, cav_z=0, cav_giro=0, pivo=0, cav_rolo=0, pescoco=0, cauda=0,
    pDE=0, pDD=0, pTE=0, pTD=0, jDE=0, jDD=0, jTE=0, jTD=0,
    sela_y=0, sela_z=0, inclina=0, tronco=-5, cabeca=0, cabeca_lado=0,
    bd=35, be=35, bd_lado=0, be_lado=0, cd=55, ce=55, coxa=45, abre=30, joelho=-60,
)


def andar_do_cavalo(quadro, v):
    """Passo do cavalo: patas em diagonal (dianteira esquerda com traseira direita, e vice-versa),
    o joelho dobrando quando a pata vai pra frente, o corpo e a cabeça balançando duas vezes por
    ciclo e o cavaleiro acompanhando."""
    fase = 2 * math.pi * (quadro - 1) / 32
    for pata, desloc in (("DE", 0), ("TD", 0), ("DD", math.pi), ("TE", math.pi)):
        v[f"p{pata}"] = 18 * math.sin(fase + desloc)
        v[f"j{pata}"] = -35 * max(0.0, math.cos(fase + desloc))
    v["cav_z"] = 0.008 * math.sin(2 * fase)
    v["pescoco"] = 5 * math.sin(2 * fase)
    v["cauda"] = 8 * math.sin(fase)
    v["sela_z"] = 0.006 * math.sin(2 * fase + 0.6)
    v["inclina"] = -2 + 2 * math.sin(2 * fase + 0.6)


# clipes do cavalo: (quadros, chaves {quadro: controles}, função extra por quadro[, volta ao padrão
# no fim? — padrão sim; a morte termina caída]). O golpe tem o impacto no quadro 10 (0,3 s) e acaba
# no 16 (0,5 s), como os golpes das outras peças.
CLIPES_CAVALO = {
    "Parado": (31, {}, None),
    "Walk": (33, {}, andar_do_cavalo),
    # pata raspando o chão enquanto o cavaleiro olha pra baixo e dá tapinhas no pescoço dele
    "Gesto1": (90, {
        10: dict(pescoco=-18, cabeca=-15, be=55, ce=30),
        16: dict(pDD=40, jDD=-70), 22: dict(pDD=5, jDD=-20), 28: dict(pDD=40, jDD=-70),
        34: dict(pDD=0, jDD=0), 40: dict(pDD=40, jDD=-70), 46: dict(pDD=-5, jDD=0),
        54: dict(pescoco=5, cabeca=0, be=35, ce=55, pDD=0),
        62: dict(pescoco=-5), 70: dict(pescoco=5), 80: dict(pescoco=0),
    }, None),
    # cavaleiro acena com o braço direito e olha pro lado; o cavalo balança a cabeça e a cauda
    "Gesto2": (90, {
        12: dict(bd_lado=140, bd=20, cd=40, cabeca_lado=15),
        18: dict(cd=0), 24: dict(cd=40), 30: dict(cd=0), 36: dict(cd=40), 42: dict(cd=0),
        50: dict(bd_lado=0, bd=35, cd=55, cabeca_lado=0),
        20: dict(cauda=25), 30.5: dict(cauda=-20), 40: dict(cauda=20), 52: dict(cauda=0),
        55: dict(pescoco=15), 58: dict(pescoco=-10), 61: dict(pescoco=12), 64: dict(pescoco=-8), 67: dict(pescoco=6), 72: dict(pescoco=0),
    }, None),
    # empina e pisoteia: impacto com as patas dianteiras batendo no chão
    "Attack1": (16, {
        5: dict(cav_giro=38, pDE=80, pDD=60, jDE=-100, jDD=-90, pescoco=25, cauda=20, inclina=-18, tronco=-15, bd=120, cd=20, sela_z=0.01),
        10: dict(cav_giro=2, pDE=15, pDD=10, jDE=-5, jDD=0, pescoco=-20, cauda=0, inclina=-10, tronco=-10, bd=70, cd=10, sela_z=0),
        13: dict(cav_giro=0, pDE=0, pDD=0, jDE=0, jDD=0, pescoco=-5, inclina=-5, bd=45, cd=40),
    }, None),
    # investida: o cavalo arranca de cabeça baixa e o cavaleiro estica o braço pra frente
    "Attack2": (16, {
        5: dict(cav_y=-0.03, cav_z=-0.02, pescoco=10, pTE=-15, pTD=-15, inclina=5, bd=60, cd=70),
        10: dict(cav_y=0.07, cav_z=0, cav_giro=-6, pivo=0.5, pescoco=-35, pDE=30, pDD=20, pTE=-25, pTD=-30, inclina=-25, tronco=-15, bd=95, cd=0),
        13: dict(cav_y=0.04, cav_giro=-2, pescoco=-15, pDE=10, pDD=5, pTE=-10, pTD=-10, inclina=-10, tronco=-8, bd=70, cd=30),
    }, None),
    # salto (o "mortal" do cavalo): agacha nas traseiras, salta com as patas dobradas, desce de
    # frente e amortece
    "Mortal": (56, {
        8: dict(cav_z=-0.035, pTE=15, pTD=15, jTE=20, jTD=20, pescoco=-12, inclina=-8),
        14: dict(cav_z=0.06, cav_giro=22, pivo=0, pDE=70, pDD=70, jDE=-110, jDD=-110, pTE=-20, pTD=-20, jTE=0, jTD=0, pescoco=15, inclina=-20, tronco=-15, sela_z=0.015),
        22: dict(cav_z=0.30, cav_giro=0, pDE=65, pDD=65, jDE=-110, jDD=-110, pTE=-45, pTD=-45, jTE=70, jTD=70, pescoco=5, inclina=-25, sela_z=0.03, bd=50, be=50),
        30: dict(cav_z=0.16, cav_giro=-18, pivo=0.5, pDE=25, pDD=25, jDE=-10, jDD=-10, pTE=-30, pTD=-30, jTE=40, jTD=40, pescoco=10, inclina=5, sela_z=0.01),
        35: dict(cav_z=0.0, cav_giro=-10, pDE=5, pDD=5, jDE=0, jDD=0, pTE=-15, pTD=-15, jTE=15, jTD=15, inclina=10, sela_z=0),
        40: dict(cav_z=-0.025, cav_giro=0, pTE=0, pTD=0, jTE=0, jTD=0, pescoco=-10, inclina=0, bd=35, be=35),
        48: dict(cav_z=0, pescoco=0, pivo=0),
    }, None),
    # tombo: o cavalo corcoveia (levanta a garupa e dá coice), o cavaleiro voa da sela agitando os
    # braços, cai de volta torto, fica tonto e se ajeita
    "MortalTombo": (96, {
        8: dict(cav_z=-0.02, pescoco=-15, pTE=10, pTD=10, pivo=1),
        13: dict(cav_giro=-28, pTE=-60, pTD=-55, jTE=40, jTD=40, pescoco=-25, cauda=40, sela_z=0.10, inclina=25, bd=160, be=150, bd_lado=30, be_lado=30, cabeca=20),
        20: dict(cav_giro=0, cav_z=0, pTE=0, pTD=0, jTE=0, jTD=0, pescoco=5, cauda=0, sela_z=0.28, inclina=-35, bd=170, be=160, cabeca=25, coxa=20, abre=55, joelho=-20),
        27: dict(sela_z=0.05, inclina=25, coxa=45, abre=30, joelho=-60, bd=90, be=120),
        31: dict(sela_z=-0.01, inclina=15, cav_z=-0.02),
        36: dict(sela_z=0, inclina=20, cabeca=10, bd=35, be=35, bd_lado=0, be_lado=0, cav_z=0),
        44: dict(cabeca_lado=25, cabeca=-10), 50: dict(cabeca_lado=-25), 56: dict(cabeca_lado=20), 62: dict(cabeca_lado=-10),
        68: dict(cabeca_lado=0, cabeca=0, inclina=0),
        46: dict(pescoco=12), 50.5: dict(pescoco=-8), 54: dict(pescoco=10), 58: dict(pescoco=0),
        80: dict(pivo=0),
    }, None),
    # comemoração: empina com o cavaleiro de punho erguido
    "Comemorar": (50, {
        8: dict(cav_giro=22, pDE=60, jDE=-90, pDD=50, jDD=-80, pescoco=30, cauda=25, bd=170, bd_lado=20, cd=10, inclina=-5, cabeca=-10),
        16: dict(cav_giro=26, bd=175, cd=30),
        22: dict(bd=165, cd=5),
        28: dict(cav_giro=0, pDE=0, jDE=0, pDD=0, jDD=0, pescoco=-10, bd=150),
        36: dict(pescoco=10, bd=35, cd=55, bd_lado=0, cauda=0, inclina=0, cabeca=0),
        44: dict(pescoco=0),
    }, None),
    # capturado: o golpe acerta, o cavalo empina um pouco, as patas da frente cedem e ele tomba de
    # lado com o cavaleiro — e fica caído (o jogo some com ele em seguida)
    "Morte": (48, {
        6: dict(cav_giro=18, pescoco=25, inclina=12, bd=80, be=80, cabeca=15),
        14: dict(cav_giro=-12, pivo=0, pDE=50, jDE=-120, pDD=50, jDD=-120, cav_z=-0.06, pescoco=-20, inclina=-15, tronco=-20),
        24: dict(cav_rolo=45, cav_z=-0.14, cav_giro=-5, pTE=20, pTD=20, pescoco=-35, inclina=10, bd=40, be=110, be_lado=40),
        32: dict(cav_rolo=88, cav_z=-0.32, cav_giro=0, pDE=20, jDE=-40, pDD=10, jDD=-30, pTE=30, pTD=15, pescoco=-10, cauda=-20, cabeca=-20, be=150, be_lado=60, bd=60),
        40: dict(cav_rolo=84, cav_z=-0.315),
        48: dict(cav_rolo=86, cav_z=-0.318),
    }, None, False),
}


def adicionar_ossos_cavalo(esqueleto):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    ossos = esqueleto.data.edit_bones
    for nome, (cabeca, ponta, pai) in OSSOS_CAVALO.items():
        osso = ossos.new(nome)
        osso.head = cabeca
        osso.tail = ponta
        osso.roll = 0
        if pai:
            osso.parent = ossos[pai]
            osso.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")


def montar_cavalo(malha):
    partes = []
    for nome, forma, medidas, posicao, giro, nome_material, osso in PECAS_CAVALO:
        objeto = primitiva(nome, forma, medidas, posicao, giro, nome_material)
        objeto.vertex_groups.new(name=osso).add(list(range(len(objeto.data.vertices))), 1.0, "REPLACE")
        partes.append(objeto)
    juntar_na_malha(malha, partes)


def giro_em_volta(ponto, matriz):
    return Matrix.Translation(ponto) @ matriz @ Matrix.Translation(-ponto)


def rx(graus):
    return Matrix.Rotation(math.radians(graus), 4, "X")


def ry(graus):
    return Matrix.Rotation(math.radians(graus), 4, "Y")


def rz(graus):
    return Matrix.Rotation(math.radians(graus), 4, "Z")


def pose_cavaleiro(esqueleto, v, base):
    """Matriz de cada osso (no espaço do esqueleto) pros controles `v`: o cavalo primeiro, depois o
    cavaleiro sentado na sela, que acompanha o corpo do cavalo. Cada osso do cavaleiro parte da pose
    Parado (em pé) e gira em volta da própria junta (cinemática direta)."""
    descanso = base["descanso"]
    posados = {}
    pivo = EIXO_TRASEIRO.lerp(EIXO_DIANTEIRO, v["pivo"])
    corpo = Matrix.Translation((0, v["cav_y"], v["cav_z"])) @ giro_em_volta(pivo, rx(v["cav_giro"])) @ giro_em_volta(PIVO_ROLO, ry(-v["cav_rolo"]))
    posados["Cavalo"] = corpo @ descanso["Cavalo"]
    for pata in PATAS:
        quadril = OSSOS_CAVALO[f"Pata_{pata}"][0]
        joelho = OSSOS_CAVALO[f"Canela_{pata}"][0]
        # o ângulo da pata é medido na vertical: desconta a inclinação do corpo
        perna = corpo @ giro_em_volta(quadril, rx(v[f"p{pata}"] - v["cav_giro"]))
        canela = perna @ giro_em_volta(joelho, rx(v[f"j{pata}"]))
        posados[f"Pata_{pata}"] = perna @ descanso[f"Pata_{pata}"]
        posados[f"Canela_{pata}"] = canela @ descanso[f"Canela_{pata}"]
    posados["Pescoco"] = corpo @ giro_em_volta(OSSOS_CAVALO["Pescoco"][0], rx(v["pescoco"])) @ descanso["Pescoco"]
    posados["Cauda"] = corpo @ giro_em_volta(OSSOS_CAVALO["Cauda"][0], rx(v["cauda"])) @ descanso["Cauda"]

    extras = {
        "mixamorig:Spine": rx(v["tronco"] / 3),
        "mixamorig:Spine1": rx(v["tronco"] / 3),
        "mixamorig:Spine2": rx(v["tronco"] / 3),
        "mixamorig:Head": rx(v["cabeca"]) @ rz(v["cabeca_lado"]),
        "mixamorig:RightArm": rx(v["bd"]) @ ry(-v["bd_lado"]),
        "mixamorig:LeftArm": rx(v["be"]) @ ry(v["be_lado"]),
        "mixamorig:RightForeArm": rx(v["cd"]),
        "mixamorig:LeftForeArm": rx(v["ce"]),
        "mixamorig:LeftUpLeg": ry(v["abre"]) @ rx(v["coxa"]),
        "mixamorig:RightUpLeg": ry(-v["abre"]) @ rx(v["coxa"]),
        "mixamorig:LeftLeg": rx(v["joelho"]),
        "mixamorig:RightLeg": rx(v["joelho"]),
        "mixamorig:LeftFoot": rx(15),
        "mixamorig:RightFoot": rx(15),
    }
    assento = ASSENTO + Vector((0, v["sela_y"], v["sela_z"]))
    deltas = {}
    for osso in base["ordem_cavaleiro"]:
        juntura = base["juntas_parado"][osso.name]
        if osso.parent is None:
            delta = corpo @ Matrix.Translation(assento) @ rx(v["inclina"]) @ Matrix.Translation(-juntura)
        else:
            delta = deltas[osso.parent.name] @ giro_em_volta(juntura, extras.get(osso.name, Matrix()))
        deltas[osso.name] = delta
        posados[osso.name] = delta @ base["parado"][osso.name]
    return posados


def bases_locais(esqueleto, posados, descanso):
    """Matriz local (a que o Blender guarda em cada osso) a partir da matriz no espaço do esqueleto."""
    bases = {}
    for pose_osso in esqueleto.pose.bones:
        pai = pose_osso.parent
        if pai is None:
            bases[pose_osso.name] = descanso[pose_osso.name].inverted() @ posados[pose_osso.name]
        else:
            relativo = descanso[pai.name].inverted() @ descanso[pose_osso.name]
            bases[pose_osso.name] = relativo.inverted() @ posados[pai.name].inverted() @ posados[pose_osso.name]
    return bases


def clipes_do_cavalo(esqueleto, parado):
    """Os clipes do cavalo (CLIPES_CAVALO), quadro a quadro."""
    usar_acao(esqueleto, parado)
    bpy.context.scene.frame_set(1)
    descanso = {osso.name: osso.matrix_local.copy() for osso in esqueleto.data.bones}
    ossos_cavalo = set(OSSOS_CAVALO)
    cavaleiro = [osso for osso in esqueleto.data.bones if osso.name not in ossos_cavalo]
    base = {
        "descanso": descanso,
        "parado": {o.name: esqueleto.pose.bones[o.name].matrix.copy() for o in cavaleiro},
        "juntas_parado": {o.name: esqueleto.pose.bones[o.name].head.copy() for o in cavaleiro},
        "ordem_cavaleiro": sorted(cavaleiro, key=lambda o: len(o.parent_recursive)),
    }
    esqueleto.animation_data.action = None
    acoes = {}
    for nome, (quadros, chaves, extra, *opcoes) in CLIPES_CAVALO.items():
        volta_ao_padrao = opcoes[0] if opcoes else True
        pontos = {controle: ({1: valor, quadros: valor} if volta_ao_padrao else {1: valor}) for controle, valor in PADRAO_CAVALEIRO.items()}
        for quadro, valores in chaves.items():
            for controle, valor in valores.items():
                pontos[controle][quadro] = valor
        acao = bpy.data.actions.new(f"Cavalo_{nome}")
        acao.use_fake_user = True
        usar_acao_nova(esqueleto, acao)
        anteriores = {}
        for quadro in range(1, quadros + 1):
            v = {controle: curva_suave(p, quadro) for controle, p in pontos.items()}
            if extra:
                extra(quadro, v)
            chavear_pose(esqueleto, bases_locais(esqueleto, pose_cavaleiro(esqueleto, v, base), descanso), quadro, anteriores)
        acoes[nome] = acao
        log(f"cavalo {nome}: {quadros} quadros ({(quadros - 1) / FPS:.2f} s)")
    esqueleto["segundo_decola"] = round((QUADROS_SALTO[0] - 1) / FPS, 3)
    esqueleto["segundo_pousa"] = round((QUADROS_SALTO[1] - 1) / FPS, 3)
    return acoes


def clipes_da_peca(acoes, tipo):
    """Nome do clipe no jogo → ação: os comuns e os golpes desta peça (Attack1, Attack2…); o peão
    tem também o Desembainhar/Embainhar."""
    clipes = {nome: acoes[nome] for nome in ("Parado", "Mortal", "MortalTombo", "Comemorar", *ANIMACOES)}
    for numero in range(1, len(GOLPES[tipo]) + 1):
        clipes[f"Attack{numero}"] = acoes[f"Attack_{tipo}{numero}"]
    if tipo == "p":
        clipes.update({nome: acoes[nome] for nome in ("Desembainhar", "Embainhar", *CLIPES_PEAO)})
    return clipes


def renderizar(cena, pecas, quadros, caminho_final, colunas):
    """Uma imagem por (peça, clipe, quadro), só aquela peça visível, juntas numa grade."""
    imagens = []
    for n, (tipo, clipe, quadro) in enumerate(quadros):
        for outra in pecas.values():
            outra["malha"].hide_render = outra is not pecas[tipo]
        usar_acao(pecas[tipo]["esqueleto"], pecas[tipo]["clipes"][clipe])
        cena.frame_set(int(quadro), subframe=quadro - int(quadro))
        caminho = os.path.join(PASTA, f"_conferencia_{n}.png")
        cena.render.filepath = caminho
        bpy.ops.render.render(write_still=True)
        imagens.append(caminho)
    for peca in pecas.values():
        peca["malha"].hide_render = False
    juntar_imagens(imagens, colunas, caminho_final)


def renderizar_conferencia(pecas):
    """Imagens de conferência: cada peça de frente (em pé e no impacto do primeiro golpe), o mortal e
    o tombo do peão de lado, a espada do peão (sacar, golpe, guardar) e o cavalo."""
    cena = bpy.context.scene
    cena.render.engine = "BLENDER_WORKBENCH"
    cena.display.shading.light = "STUDIO"
    cena.display.shading.color_type = "MATERIAL"
    cena.render.resolution_x = 260
    cena.render.resolution_y = 380
    cena.world = cena.world or bpy.data.worlds.new("Mundo")
    camera_dados = bpy.data.cameras.new("CameraConferencia")
    camera_dados.type = "ORTHO"
    camera_dados.ortho_scale = 1.35
    camera = bpy.data.objects.new("CameraConferencia", camera_dados)
    cena.collection.objects.link(camera)
    cena.camera = camera
    # a peça olha pra +Y aqui (antes do giro final): a câmera fica em +Y olhando pra ela, de leve
    # de lado pra mostrar volume
    camera.location = (1.2, 4, 0.5)
    camera.rotation_euler = (math.radians(90), 0, math.radians(180 - 16.7))
    impacto = 1 + DURACAO_GOLPE_JOGO * INSTANTE_IMPACTO_JOGO * FPS
    quadros = [(tipo, "Parado", 1) for tipo in pecas] + [(tipo, "Attack1", impacto) for tipo in pecas]
    renderizar(cena, pecas, quadros, CAMINHO_PNG, len(pecas))

    # o peão sacando a espada, golpeando e guardando — de frente, um pouco de lado
    camera.location = (2.4, 3.2, 0.5)
    camera.rotation_euler = (math.radians(90), 0, math.radians(143))
    desembainhar = pecas["p"]["clipes"]["Desembainhar"]
    embainhar = pecas["p"]["clipes"]["Embainhar"]
    fim_saque = desembainhar.frame_range[1]
    fim_guarda = embainhar.frame_range[1]
    quadros = [("p", "Desembainhar", q) for q in (1, fim_saque * 0.35, fim_saque * 0.55, fim_saque * 0.75, fim_saque)]
    quadros += [("p", "Attack1", q) for q in (4, impacto, 14)] + [("p", "Attack2", impacto)]
    quadros += [("p", "Embainhar", q) for q in (fim_guarda * 0.25, fim_guarda * 0.45, fim_guarda * 0.6, fim_guarda)]
    renderizar(cena, pecas, quadros, CAMINHO_PNG_ESPADA, 7)

    # de lado: o mortal e o tombo do peão, e os clipes do cavalo
    camera.location = (4, 0, 0.45)
    camera.rotation_euler = (math.radians(90), 0, math.radians(90))
    camera_dados.ortho_scale = 1.6
    cena.render.resolution_x = 200
    quadros = [("p", nome, q) for nome, qs in QUADROS_CONFERENCIA_MORTAL.items() for q in qs]
    renderizar(cena, pecas, quadros, CAMINHO_PNG_MORTAL, max(len(q) for q in QUADROS_CONFERENCIA_MORTAL.values()))
    camera.location = (4, 0, 0.55)
    quadros = [("n", nome, q) for nome, qs in QUADROS_CONFERENCIA_CAVALO.items() for q in qs]
    renderizar(cena, pecas, quadros, CAMINHO_PNG_CAVALO, max(len(q) for q in QUADROS_CONFERENCIA_CAVALO.values()))
    for peca in pecas.values():
        peca["esqueleto"].animation_data.action = None


QUADROS_CONFERENCIA_MORTAL = {
    "Mortal": (1, 7, 12, 16, 20, 25, 30, 34, 37, 42, 50),
    "MortalTombo": (30, 33, 36, 40, 44, 52, 60, 68, 75, 82, 92),
    "Comemorar": (1, 6, 10, 15, 20, 24, 28, 33, 38, 42, 50),
    "Morte": (1, 8, 16, 24, 32, 40, 48, 56, 64, 70),
    "Run": (1, 5, 9, 13, 17, 21),
    "GestoKamae": (1, 14, 60),
    "GestoHasso": (16, 60),
    "GestoMeditar": (12, 24, 32, 90),
    "Reverencia": (22, 40),
    "Sacrificio": (12, 26, 70, 87, 104, 120),
}
QUADROS_CONFERENCIA_CAVALO = {
    "Parado": (1,), "Walk": (1, 9, 17, 25), "Gesto1": (16, 22), "Gesto2": (18, 24),
    "Attack1": (5, 10, 13), "Attack2": (5, 10),
    "Mortal": (8, 14, 22, 30, 35, 40), "MortalTombo": (13, 20, 27, 36, 50),
    "Comemorar": (8, 16, 28), "Morte": (6, 14, 24, 32, 48),
}


def juntar_imagens(imagens, colunas, destino_final):
    """Junta as imagens numa grade (na ordem, linha a linha, a primeira linha em cima) e apaga as soltas."""
    carregadas = [bpy.data.images.load(c) for c in imagens]
    w, h = carregadas[0].size
    linhas = math.ceil(len(carregadas) / colunas)
    final = bpy.data.images.new("Conferencia", width=w * colunas, height=h * linhas)
    pixels = [0.2, 0.2, 0.2, 1.0] * (w * colunas * h * linhas)
    for n, imagem in enumerate(carregadas):
        linha, coluna = divmod(n, colunas)
        linha = linhas - 1 - linha  # a imagem do Blender começa embaixo
        origem = list(imagem.pixels)
        for y in range(h):
            destino = ((linha * h + y) * w * colunas + coluna * w) * 4
            pixels[destino : destino + w * 4] = origem[y * w * 4 : (y + 1) * w * 4]
    final.pixels = pixels
    final.filepath_raw = destino_final
    final.file_format = "PNG"
    final.save()
    for caminho in imagens:
        os.remove(caminho)


def exportar(esqueleto, malha, clipes, caminho):
    """Só esta peça e o esqueleto dela, com uma trilha NLA por clipe — o exportador glTF transforma
    cada trilha num clipe com o nome dela. As propriedades do esqueleto (os instantes da espada do
    peão) vão como "extras" do nó dele."""
    dados = esqueleto.animation_data
    for trilha in list(dados.nla_tracks):
        dados.nla_tracks.remove(trilha)
    dados.action = None
    for nome, acao in clipes.items():
        trilha = dados.nla_tracks.new()
        trilha.name = nome
        faixa = trilha.strips.new(nome, 1, acao)
        faixa.action_slot = acao.slots[0]
    bpy.ops.object.select_all(action="DESELECT")
    esqueleto.select_set(True)
    malha.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=caminho,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=True,
        export_extras=True,
    )


def ler_json_glb(caminho):
    with open(caminho, "rb") as arquivo:
        dados = arquivo.read()
    tamanho = struct.unpack("<I", dados[12:16])[0]
    return json.loads(dados[20 : 20 + tamanho])


def conferir_glb(caminho, tipo, clipes_esperados):
    """Confere no próprio arquivo o que o jogo usa: os clipes, os materiais, a espada (só no peão,
    com os instantes de sacar/guardar) e a frente da peça (+Z no Three.js: a mão direita fica em -X)."""
    nome_arquivo = os.path.basename(caminho)
    gltf = ler_json_glb(caminho)
    clipes = sorted(animacao["name"] for animacao in gltf.get("animations", []))
    assert clipes == sorted(clipes_esperados), f"{nome_arquivo}: clipes {clipes}, esperava {sorted(clipes_esperados)}"
    materiais = sorted(m["name"] for m in gltf.get("materials", []))
    assert set(materiais) <= set(MATERIAIS), f"materiais inesperados: {materiais}"
    espada = {"EspadaLamina", "EspadaCabo", "CaboBainha"}
    if tipo == "p":
        assert espada <= set(materiais), f"{nome_arquivo}: falta a espada ({materiais})"
        extras = [no.get("extras", {}) for no in gltf["nodes"] if "segundo_saque" in no.get("extras", {})]
        assert extras, f"{nome_arquivo}: sem os instantes de sacar/guardar a espada nos extras"
    else:
        assert not espada & set(materiais), f"{nome_arquivo}: só o peão tem espada ({materiais})"

    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=caminho)
    esqueleto = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    mao_direita = esqueleto.matrix_world @ esqueleto.data.bones["mixamorig:RightHand"].head_local
    assert mao_direita.x < 0, f"{nome_arquivo} não está olhando pra +Z do Three.js"
    log(f"{nome_arquivo} conferido: clipes {clipes}, materiais {materiais}")


def main():
    if not bpy.app.background:
        raise SystemExit(
            "Rode este script pelo terminal, sem abrir a interface:\n"
            "    blender --background --python scripts/blender/importar_animacoes_mixamo.py\n"
            "(dentro da interface ele apagaria a cena que estiver aberta)"
        )
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.context.scene.render.fps = FPS

    # o peão primeiro: dele saem as juntas e a conferência do Parado, e o lugar do cabo da bainha
    # antiga (pra achar o instante em que a mão chega no quadril, ver armar_peao)
    malha_peao, faixas, alvos, juntas, em_pe = peca_em_pose_t("p")
    cabo_antigo = sum((malha_peao.data.vertices[i].co for i in faixas["CaboBainha"]), Vector()) / len(faixas["CaboBainha"])
    # a bainha antiga sai da malha em prender_malha — sai também da referência do peão em pé
    tirados = {i for parte in PARTES_TIRADAS for i in faixas[parte]}
    em_pe = [posicao for i, posicao in enumerate(em_pe) if i not in tirados]
    esqueleto, conversao, comprimentos = esqueleto_do_mixamo()
    prender_malha(malha_peao, faixas, alvos, esqueleto, "p")
    # o cavalo tem um esqueleto próprio: o mesmo do cavaleiro mais os ossos do cavalo
    esqueleto_cavalo = esqueleto.copy()
    esqueleto_cavalo.data = esqueleto.data.copy()
    esqueleto_cavalo.name = "EsqueletoCavalo"
    bpy.context.scene.collection.objects.link(esqueleto_cavalo)
    esqueleto_cavalo.animation_data_clear()
    adicionar_ossos_cavalo(esqueleto_cavalo)

    malhas = {"p": malha_peao}
    for tipo in PECAS:
        if tipo != "p":
            malha, faixas, alvos, *_ = peca_em_pose_t(tipo)
            prender_malha(malha, faixas, alvos, esqueleto_cavalo if tipo == "n" else esqueleto, tipo)
            if tipo == "n":
                montar_cavalo(malha)
            malhas[tipo] = malha

    acoes = {"Parado": criar_parado(esqueleto, malha_peao, juntas, em_pe)}
    acoes["Mortal"] = criar_mortal(esqueleto, acoes["Parado"], "Mortal", mortal(tombo=False))
    acoes["MortalTombo"] = criar_mortal(esqueleto, acoes["Parado"], "MortalTombo", mortal(tombo=True))
    acoes["Comemorar"] = criar_mortal(esqueleto, acoes["Parado"], "Comemorar", comemorar())
    for nome_clipe, chaves in CLIPES_PEAO.items():
        acoes[nome_clipe] = criar_mortal(esqueleto, acoes["Parado"], nome_clipe, chaves())
    for nome_clipe, arquivo in ANIMACOES.items():
        acoes[nome_clipe] = carregar_animacao(nome_clipe, arquivo, esqueleto, conversao, comprimentos)
    for nome_clipe in ANDAR_NO_LUGAR:
        velocidade = ficar_no_lugar(esqueleto, acoes[nome_clipe])
        esqueleto[f"velocidade_{nome_clipe.lower()}"] = round(velocidade, 3)
        log(f"{nome_clipe}: o corpo avançava {velocidade:.2f} unidades por segundo (agora no lugar)")
    usados = set()
    for tipo, golpes in GOLPES.items():
        for numero, (arquivo, inicio, impacto, fim, anda) in enumerate(golpes, start=1):
            assert arquivo not in usados, f"o golpe {arquivo} está em mais de uma peça"
            usados.add(arquivo)
            acao = carregar_animacao(f"Attack_{tipo}{numero}", arquivo, esqueleto, conversao, comprimentos)
            ajustar_golpe(acao, inicio, impacto, fim)
            if anda:
                ficar_no_lugar(esqueleto, acao)
            acoes[acao.name] = acao
    acoes.update(clipes_da_bainha(esqueleto, conversao, comprimentos, malha_peao, cabo_antigo))

    pecas = {}
    for tipo, malha in malhas.items():
        if tipo == "n":
            clipes = clipes_do_cavalo(esqueleto_cavalo, acoes["Parado"])
            pecas[tipo] = {"malha": malha, "esqueleto": esqueleto_cavalo, "clipes": clipes}
        else:
            pecas[tipo] = {"malha": malha, "esqueleto": esqueleto, "clipes": clipes_da_peca(acoes, tipo)}
    for peca in pecas.values():
        suavizar(peca["malha"])
    renderizar_conferencia(pecas)

    # as peças foram montadas olhando pra +Y do Blender, que vira -Z no Three.js; todas as peças do
    # tabuleiro são desenhadas olhando pra +Z (as brancas giram 180° pra encarar as pretas, e o
    # giro do ataque também conta com isso) — então os esqueletos giram 180°
    esqueleto.rotation_euler.z = math.pi
    esqueleto_cavalo.rotation_euler.z = math.pi
    exportados = []
    for tipo, arquivo in PECAS.items():
        peca = pecas[tipo]
        caminho = os.path.normpath(os.path.join(PASTA_MODELOS, arquivo))
        exportar(peca["esqueleto"], peca["malha"], peca["clipes"], caminho)
        exportados.append((caminho, tipo, list(peca["clipes"])))
        log(f"{arquivo} salvo ({len(peca['malha'].data.vertices)} vértices, {len(peca['clipes'])} clipes)")
    log(f"imagens de conferência: {CAMINHO_PNG}, {CAMINHO_PNG_ESPADA}, {CAMINHO_PNG_MORTAL}, {CAMINHO_PNG_CAVALO}")
    for caminho, tipo, clipes in exportados:
        conferir_glb(caminho, tipo, clipes)


# só roda rodando este arquivo direto — scripts de teste importam as funções daqui
if __name__ == "__main__":
    main()

