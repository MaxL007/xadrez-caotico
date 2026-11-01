"""
Cria o primeiro personagem-teste da pipeline RPG (Blender -> glTF -> Three.js): um peão simples,
com esqueleto (armature) de verdade e três animações (Idle, Walk e Attack), exportado como .glb.

Roda sem abrir a interface gráfica:
    blender --background --python scripts/blender/criar_peao_rpg.py

Escopo proposital de "primeiro passo": malha simples (cilindros/esferas unidos, no mesmo espírito
geométrico das peças atuais do tabuleiro), esqueleto de 11 ossos (incluindo cotovelo e joelho, pra
dar movimento articulado de verdade), peso 100% rígido por parte (sem mistura entre ossos
vizinhos, pra não depender de pintura de peso visual que eu não consigo conferir por aqui) — o
objetivo é provar a pipeline inteira funcionando de ponta a ponta, não entregar a arte final.
Refinar a malha/rig depois é um trabalho pra fazer na interface do Blender.
"""

import math
import os

import bpy

CAMINHO_SAIDA = os.path.join(os.path.dirname(__file__), "..", "..", "public", "models", "peao_rpg.glb")
CAMINHO_BLEND = os.path.join(os.path.dirname(__file__), "peao_rpg.blend")


def limpar_cena():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for colecao in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
        for item in list(colecao):
            colecao.remove(item)


def criar_malha(lados=8):
    """Monta o corpo com primitivas simples e junta tudo num mesh só, marcando de qual "parte"
    cada pedaço é (pra depois virar grupo de vértice/osso). Silhueta de soldado esguio — ombros e
    botas marcando a figura, mas bem mais fina que a revisão "robusta" anterior (aquela chegava a
    quase 2x mais alta e quase 3x mais larga que o peão geométrico de sempre, ocupando espaço
    demais no tabuleiro). Medidas aqui são a versão "robusta" com um fator de largura (0.48, ombros/
    braços/pernas) e um fator de altura (0.57, todas as posições Z e profundidades) aplicados —
    mantém a mesma silhueta relativa, só bem mais proporcional ao tamanho original."""
    partes = []

    def add_parte(nome, criar_fn, **kwargs):
        criar_fn(**kwargs)
        obj = bpy.context.object
        obj.name = nome
        partes.append(obj)
        return obj

    # poucos lados (8, o padrão) em vez do padrão do Blender (32) — faces bem maiores e mais planas,
    # em vez de curvas quase lisas; combinado com o sombreamento "flat" logo abaixo, fica um
    # facetado nítido (visual low-poly). As peças do jogo em HD (importar_animacoes_mixamo.py) pedem
    # mais lados e suavizam o sombreamento depois.
    LADOS = lados
    ANEIS = max(5, lados // 2)

    # torso em leque: radius2 (topo/ombro) maior que radius1 (base/cintura)
    add_parte(
        "Torso",
        bpy.ops.mesh.primitive_cone_add,
        vertices=LADOS,
        radius1=0.07,
        radius2=0.10,
        depth=0.30,
        location=(0, 0, 0.46),
    )
    add_parte("Cabeca", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.07, location=(0, 0, 0.70), segments=LADOS, ring_count=ANEIS)
    add_parte("Chapeu", bpy.ops.mesh.primitive_cone_add, vertices=LADOS, radius1=0.045, depth=0.11, location=(0, 0, 0.83))
    # ombreiras — bulto extra por cima do encontro braço/torso, mapeadas pro osso do braço
    add_parte("Ombro_L", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.045, location=(-0.11, 0, 0.57), segments=LADOS, ring_count=ANEIS)
    add_parte("Ombro_R", bpy.ops.mesh.primitive_uv_sphere_add, radius=0.045, location=(0.11, 0, 0.57), segments=LADOS, ring_count=ANEIS)
    # braço superior (ombro -> cotovelo) e antebraço (cotovelo -> pulso) — dois segmentos em vez de
    # uma haste única, pra existir um cotovelo de verdade pra dobrar; antebraço um pouco mais fino,
    # afunilando como um braço de verdade
    add_parte("Braco_L", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.032, depth=0.12, location=(-0.11, 0, 0.51))
    add_parte("Braco_R", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.032, depth=0.12, location=(0.11, 0, 0.51))
    add_parte("Antebraco_L", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.026, depth=0.12, location=(-0.11, 0, 0.39))
    add_parte("Antebraco_R", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.026, depth=0.12, location=(0.11, 0, 0.39))
    # coxa (quadril -> joelho) e canela (joelho -> tornozelo) — mesma ideia das pernas: dois
    # segmentos com um joelho de verdade entre eles, em vez de uma perna reta de boneco de plástico
    add_parte("Perna_L", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.042, depth=0.17, location=(-0.045, 0, 0.255))
    add_parte("Perna_R", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.042, depth=0.17, location=(0.045, 0, 0.255))
    add_parte("Canela_L", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.035, depth=0.17, location=(-0.045, 0, 0.085))
    add_parte("Canela_R", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.035, depth=0.17, location=(0.045, 0, 0.085))
    # botas — cilindro curto e mais largo que a canela, na base
    add_parte("Bota_L", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.045, depth=0.08, location=(-0.045, 0, 0.03))
    add_parte("Bota_R", bpy.ops.mesh.primitive_cylinder_add, vertices=LADOS, radius=0.045, depth=0.08, location=(0.045, 0, 0.03))

    # bainha — presa no quadril do lado ESQUERDO (x negativo), o oposto da mão que saca a espada
    # (Hand_R, do lado direito): é assim que uma espada é usada de verdade, cruzando o corpo ao
    # sacar em vez de puxar reto pro lado. Fica sempre visível, presa ao Spine (some com o corpo,
    # não tem osso próprio) — só o cabo/lâmina da espada em si aparece e some (ver Three.js).
    add_parte(
        "Bainha",
        bpy.ops.mesh.primitive_cylinder_add,
        vertices=LADOS,
        radius=0.016,
        depth=0.22,
        location=(-0.115, 0.045, 0.31),
        rotation=(0.35, 0, 0.15),
    )
    # cabo da espada, só a pontinha espiando pra fora da bainha (o resto da espada "não existe"
    # fisicamente até o golpe começar)
    add_parte(
        "CaboBainha",
        bpy.ops.mesh.primitive_cylinder_add,
        vertices=LADOS,
        radius=0.018,
        depth=0.06,
        location=(-0.108, 0.01, 0.405),
        rotation=(0.35, 0, 0.15),
    )

    # guarda quantos vértices/faces (por índice local, antes do join) pertencem a cada parte —
    # usado depois do join pra criar os grupos de vértice por osso e atribuir o material certo
    # (join preserva a ordem, então dá pra recuperar os índices originais só somando as
    # contagens anteriores)
    contagens_vertices = [(obj.name, len(obj.data.vertices)) for obj in partes]
    contagens_faces = [(obj.name, len(obj.data.polygons)) for obj in partes]

    bpy.ops.object.select_all(action="DESELECT")
    for obj in partes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = partes[0]
    bpy.ops.object.join()
    personagem = bpy.context.object
    personagem.name = "PeaoRPG"
    # "flat" em vez de "smooth": mantém a normal de cada face reta (sem interpolar entre faces
    # vizinhas), então cada faceta do low-poly aparece como um plano nítido — superfície bem mais
    # "achatada" que o sombreamento suave de antes, que arredondava visualmente até geometria com
    # poucos lados
    bpy.ops.object.shade_flat()

    return personagem, contagens_vertices, contagens_faces


MAPA_PARTE_PARA_OSSO = {
    "Torso": "Spine",
    "Cabeca": "Head",
    "Chapeu": "Head",
    "Ombro_L": "Arm_L",
    "Ombro_R": "Arm_R",
    "Braco_L": "Arm_L",
    "Braco_R": "Arm_R",
    "Antebraco_L": "Forearm_L",
    "Antebraco_R": "Forearm_R",
    "Perna_L": "Leg_L",
    "Perna_R": "Leg_R",
    "Canela_L": "Shin_L",
    "Canela_R": "Shin_R",
    "Bota_L": "Shin_L",
    "Bota_R": "Shin_R",
    "Bainha": "Spine",
    "CaboBainha": "Spine",
}

# partes que levam a cor de "destaque" em vez da cor principal do corpo — mesmo padrão que o
# peão geométrico já usa (ver geometriasDoTipo('p') em ChessBoard3D.tsx: o capacete e as juntas
# de ombro/quadril são 'detalhe', o resto é 'armadura'). Aqui só capacete + ombreiras, que já
# bastam pra imitar essa mesma cara de "corpo + acabamento" sem precisar dividir cada juntinha.
PARTES_DETALHE = {"Chapeu", "Ombro_L", "Ombro_R", "Bainha", "CaboBainha"}


def atribuir_materiais(personagem, contagens_faces):
    """Cria os dois materiais (Corpo = índice 0, Detalhe = índice 1) e marca o material_index de
    cada face conforme a parte de origem. No Three.js, o glTF exportado separa a malha em uma
    primitiva por material — cada uma vira um SkinnedMesh próprio, e o código escolhe a cor certa
    da facção (branca/preta) olhando o nome do material original (ver buildPeaoRPG)."""
    material_corpo = bpy.data.materials.new("Corpo")
    # cinza neutro só pra não ficar preto-puro sem luz nenhuma — a cor de verdade (branco/preto
    # da facção) é decidida em runtime, no Three.js
    material_corpo.diffuse_color = (0.75, 0.75, 0.78, 1.0)
    material_detalhe = bpy.data.materials.new("Detalhe")
    material_detalhe.diffuse_color = (0.3, 0.35, 0.55, 1.0)
    personagem.data.materials.append(material_corpo)
    personagem.data.materials.append(material_detalhe)

    indice_atual = 0
    for nome_parte, qtd_faces in contagens_faces:
        indice_material = 1 if nome_parte in PARTES_DETALHE else 0
        for i in range(indice_atual, indice_atual + qtd_faces):
            personagem.data.polygons[i].material_index = indice_material
        indice_atual += qtd_faces


def criar_grupos_de_vertice(personagem, contagens):
    """Peso 100% rígido por parte — cada vértice pertence inteiramente a um osso só, sem mistura.
    Como as partes foram unidas na ordem de `contagens`, dá pra recuperar os índices originais
    simplesmente somando as contagens anteriores (join preserva a ordem dos vértices)."""
    nomes_osso = sorted(set(MAPA_PARTE_PARA_OSSO.values()))
    grupos = {nome: personagem.vertex_groups.new(name=nome) for nome in nomes_osso}

    indice_atual = 0
    for nome_parte, qtd_vertices in contagens:
        osso = MAPA_PARTE_PARA_OSSO[nome_parte]
        indices = list(range(indice_atual, indice_atual + qtd_vertices))
        grupos[osso].add(indices, 1.0, "REPLACE")
        indice_atual += qtd_vertices


def criar_esqueleto():
    bpy.ops.object.armature_add(location=(0, 0, 0))
    armature_obj = bpy.context.object
    armature_obj.name = "Esqueleto"
    dados = armature_obj.data
    dados.name = "EsqueletoDados"

    bpy.ops.object.mode_set(mode="EDIT")
    ossos = dados.edit_bones
    # remove o osso padrão criado pelo armature_add
    for osso in list(ossos):
        ossos.remove(osso)

    def novo_osso(nome, cabeca, cauda, pai=None):
        osso = ossos.new(nome)
        osso.head = cabeca
        osso.tail = cauda
        if pai:
            osso.parent = ossos[pai]
            osso.use_connect = False
        return osso

    novo_osso("Root", (0, 0, 0), (0, 0, 0.085))
    novo_osso("Spine", (0, 0, 0.085), (0, 0, 0.57), pai="Root")
    novo_osso("Head", (0, 0, 0.57), (0, 0, 0.855), pai="Spine")
    # braço: ombro -> cotovelo -> pulso, dois ossos numa cadeia de verdade (Forearm é filho de
    # Arm) — rotacionar o Arm move o antebraço junto (o braço inteiro balança), rotacionar só o
    # Forearm dobra o cotovelo sem mexer no ombro
    novo_osso("Arm_L", (-0.11, 0, 0.57), (-0.11, 0, 0.45), pai="Spine")
    novo_osso("Arm_R", (0.11, 0, 0.57), (0.11, 0, 0.45), pai="Spine")
    novo_osso("Forearm_L", (-0.11, 0, 0.45), (-0.11, 0, 0.33), pai="Arm_L")
    novo_osso("Forearm_R", (0.11, 0, 0.45), (0.11, 0, 0.33), pai="Arm_R")
    # sem malha própria (não entra no MAPA_PARTE_PARA_OSSO) — só um ponto de fixação, pro
    # Three.js pendurar a espada na mão direita durante o golpe (ver buildPeaoRPG)
    novo_osso("Hand_R", (0.11, 0, 0.33), (0.11, 0, 0.27), pai="Forearm_R")
    # perna: quadril -> joelho -> tornozelo, mesma lógica de cadeia (Shin filho de Leg)
    novo_osso("Leg_L", (-0.045, 0, 0.34), (-0.045, 0, 0.17), pai="Root")
    novo_osso("Leg_R", (0.045, 0, 0.34), (0.045, 0, 0.17), pai="Root")
    novo_osso("Shin_L", (-0.045, 0, 0.17), (-0.045, 0, 0.0), pai="Leg_L")
    novo_osso("Shin_R", (0.045, 0, 0.17), (0.045, 0, 0.0), pai="Leg_R")

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature_obj


def vincular_malha_ao_esqueleto(personagem, armature_obj):
    modificador = personagem.modifiers.new(name="Armature", type="ARMATURE")
    modificador.object = armature_obj
    personagem.parent = armature_obj


def criar_animacao(armature_obj, nome, quadros_por_osso, fps_total):
    """`quadros_por_osso`: {osso: [(frame, (rx,ry,rz)), ...]} em radianos."""
    acao = bpy.data.actions.new(name=nome)
    acao.use_fake_user = True
    if armature_obj.animation_data is None:
        armature_obj.animation_data_create()
    armature_obj.animation_data.action = acao

    bpy.ops.object.mode_set(mode="POSE")
    for pose_osso in armature_obj.pose.bones:
        pose_osso.rotation_mode = "XYZ"

    for osso, quadros in quadros_por_osso.items():
        pose_osso = armature_obj.pose.bones[osso]
        for frame, rot in quadros:
            pose_osso.rotation_euler = rot
            pose_osso.keyframe_insert(data_path="rotation_euler", frame=frame)

    bpy.ops.object.mode_set(mode="OBJECT")

    # empurra a ação pra uma trilha NLA — sem isso, o exportador glTF só pega a ação ativa no
    # final do script (a última criada), e as outras não viram clipe nenhum no arquivo exportado
    if armature_obj.animation_data.nla_tracks.get(nome) is None:
        trilha = armature_obj.animation_data.nla_tracks.new()
        trilha.name = nome
        trilha.strips.new(nome, int(quadros_por_osso[list(quadros_por_osso)[0]][0][0]), acao)
    armature_obj.animation_data.action = None
    return acao


def main():
    limpar_cena()
    personagem, contagens_vertices, contagens_faces = criar_malha()
    criar_grupos_de_vertice(personagem, contagens_vertices)
    armature_obj = criar_esqueleto()
    vincular_malha_ao_esqueleto(personagem, armature_obj)
    atribuir_materiais(personagem, contagens_faces)

    # Idle: balanço sutil de respiração nos braços e leve inclinação da cabeça, em loop (quadro 1 e
    # o último precisam ser idênticos pra não dar um "pulo" quando o loop reinicia). Cotovelo e
    # joelho ficam com uma dobra pequena e constante (não perfeitamente retos) — um corpo parado
    # com todas as juntas travadas em 0° parece boneco rígido; uma leve flexão de descanso é o que
    # faz o "parado" já parecer um corpo de verdade, mesmo sem animação nenhuma nessas juntas.
    criar_animacao(
        armature_obj,
        "Idle",
        {
            "Arm_L": [(1, (0.05, 0, 0)), (30, (-0.05, 0, 0)), (60, (0.05, 0, 0))],
            "Arm_R": [(1, (-0.05, 0, 0)), (30, (0.05, 0, 0)), (60, (-0.05, 0, 0))],
            "Forearm_L": [(1, (0.12, 0, 0)), (60, (0.12, 0, 0))],
            "Forearm_R": [(1, (0.12, 0, 0)), (60, (0.12, 0, 0))],
            "Shin_L": [(1, (0.05, 0, 0)), (60, (0.05, 0, 0))],
            "Shin_R": [(1, (0.05, 0, 0)), (60, (0.05, 0, 0))],
            "Head": [(1, (0, 0, 0)), (30, (0.02, 0, 0)), (60, (0, 0, 0))],
        },
        60,
    )

    # Walk: marcha humana de verdade, não só um pêndulo reto do quadril/ombro. O quadril de cada
    # perna balança pra frente e pra trás num seno contínuo (fase oposta entre as duas pernas —
    # marcha contralateral, braço e perna opostos avançam juntos). O joelho é o que dá
    # naturalidade: fica quase esticado enquanto a perna está apoiada no chão (fases 1→13, o corpo
    # "passa por cima" do pé plantado) e dobra bastante só no meio do balanço pra frente (~quadro
    # 19), quando o pé precisa descolar do chão pra não arrastar — exatamente como um joelho
    # humano se comporta ao andar. O cotovelo acompanha o braço com uma dobra bem mais sutil, mais
    # fechada quando o braço está atrás (balanço natural e relaxado). 24 quadros = 1 ciclo completo
    # (dois passos) por segundo, um ritmo de caminhada tranquilo, não corrido nem arrastado.
    criar_animacao(
        armature_obj,
        "Walk",
        {
            "Leg_L": [(1, (0.5, 0, 0)), (7, (0, 0, 0)), (13, (-0.5, 0, 0)), (19, (0, 0, 0)), (24, (0.5, 0, 0))],
            "Leg_R": [(1, (-0.5, 0, 0)), (7, (0, 0, 0)), (13, (0.5, 0, 0)), (19, (0, 0, 0)), (24, (-0.5, 0, 0))],
            "Shin_L": [(1, (0.05, 0, 0)), (7, (0.10, 0, 0)), (13, (0.05, 0, 0)), (19, (0.95, 0, 0)), (24, (0.05, 0, 0))],
            "Shin_R": [(1, (0.95, 0, 0)), (7, (0.05, 0, 0)), (13, (0.10, 0, 0)), (19, (0.05, 0, 0)), (24, (0.95, 0, 0))],
            "Arm_R": [(1, (0.4, 0, 0)), (7, (0, 0, 0)), (13, (-0.4, 0, 0)), (19, (0, 0, 0)), (24, (0.4, 0, 0))],
            "Arm_L": [(1, (-0.4, 0, 0)), (7, (0, 0, 0)), (13, (0.4, 0, 0)), (19, (0, 0, 0)), (24, (-0.4, 0, 0))],
            "Forearm_R": [(1, (0.12, 0, 0)), (13, (0.32, 0, 0)), (24, (0.12, 0, 0))],
            "Forearm_L": [(1, (0.32, 0, 0)), (13, (0.12, 0, 0)), (24, (0.32, 0, 0))],
        },
        24,
    )

    # Attack: braço direito ergue e desce num golpe rápido — agora com o cotovelo participando do
    # movimento (dobra no preparo, estica no impacto), como um golpe de espada de verdade usa o
    # braço inteiro, não só o ombro girando em torno de um braço reto.
    criar_animacao(
        armature_obj,
        "Attack",
        {
            "Arm_R": [
                (1, (0, 0, 0)),
                (8, (-1.9, 0, 0.3)),
                (14, (1.1, 0, -0.2)),
                (24, (0, 0, 0)),
            ],
            "Forearm_R": [
                (1, (0.12, 0, 0)),
                (8, (0.9, 0, 0)),
                (14, (0.05, 0, 0)),
                (24, (0.12, 0, 0)),
            ],
            "Spine": [
                (1, (0, 0, 0)),
                (8, (-0.15, 0, 0)),
                (14, (0.1, 0, 0)),
                (24, (0, 0, 0)),
            ],
        },
        24,
    )

    os.makedirs(os.path.dirname(CAMINHO_SAIDA), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=CAMINHO_SAIDA,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=True,
    )
    print(f"[criar_peao_rpg] exportado com sucesso em: {CAMINHO_SAIDA}")

    # salva também um .blend com a cena pronta (malha + esqueleto + as duas animações) — abrir
    # esse arquivo direto na interface já cai com tudo montado, sem precisar reimportar o glTF
    bpy.ops.wm.save_as_mainfile(filepath=CAMINHO_BLEND)
    print(f"[criar_peao_rpg] projeto salvo em: {CAMINHO_BLEND}")


# só roda rodando este arquivo direto (blender --python …) — outros scripts (ex.: exportar_peao_mixamo.py)
# importam as funções daqui pra montar o mesmo peão sem regravar o .glb do jogo nem o .blend
if __name__ == "__main__":
    main()
