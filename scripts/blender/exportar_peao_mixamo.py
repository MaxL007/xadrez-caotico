"""
Exporta o peão RPG num formato que o Auto-Rigger do Mixamo aceita.

Por que o upload direto falha ("Sorry, unable to map your existing skeleton"): o arquivo do peão
já vem com o esqueleto próprio de 11 ossos (Root, Spine, Head, Arm/Forearm, Leg/Shin, Hand_R —
ver criar_peao_rpg.py). Quando o arquivo traz um esqueleto, o Mixamo tenta "mapear" esse esqueleto
pro humanoide padrão dele, e só reconhece um esqueleto humano completo (quadril, coluna, pescoço,
clavículas, mãos, pés…) com nomes que ele conhece — o do peão não é. Além disso, os braços do peão
ficam colados no corpo (encostando no tronco) e as pernas quase se tocam, e o Auto-Rigger precisa de
braços e pernas separados do corpo pra calcular os pesos certos.

O que este script faz: monta o peão do zero com as mesmas funções do criar_peao_rpg.py (mesma
malha e mesmo esqueleto do modelo do jogo, numa cena vazia — não abre nem regrava o peao_rpg.blend,
nem mexe no .glb do jogo), coloca o boneco em pose T (braços abertos na horizontal, pernas um pouco
afastadas) usando o próprio esqueleto, "congela" essa pose na malha e tira o esqueleto — sobra só a
malha, que é o que o Mixamo espera. Tira também o chapéu e a bainha (ver PARTES_FORA_DO_MIXAMO) e
refaz o corpo como uma malha única e fechada (ver unificar_malha). Aí no site o Auto-Rigger pede os
marcadores (queixo, pulsos, cotovelos, joelhos, virilha) e cria o esqueleto padrão dele.

Roda sem abrir a interface:
    blender --background --python scripts/blender/exportar_peao_mixamo.py

Gera, nesta mesma pasta:
    peao_rpg_mixamo.fbx  — o arquivo pra subir no Mixamo
    peao_rpg_mixamo.obj  — a mesma malha em OBJ (alternativa, se o upload do FBX der problema)
    peao_rpg_mixamo.png  — imagem de conferência (frente e lado), pra ver a pose antes de subir
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)
sys.dont_write_bytecode = True  # sem pasta __pycache__ no projeto
import criar_peao_rpg as base  # noqa: E402 — só as funções (o main() de lá não roda ao importar)

CAMINHO_FBX = os.path.join(PASTA, "peao_rpg_mixamo.fbx")
# a mesma malha em OBJ — o Mixamo também aceita, e OBJ nem tem como levar esqueleto junto: é a
# alternativa se o upload do FBX der algum problema
CAMINHO_OBJ = os.path.join(PASTA, "peao_rpg_mixamo.obj")
CAMINHO_PNG = os.path.join(PASTA, "peao_rpg_mixamo.png")

# braços abertos na horizontal (pose T) e pernas um pouco afastadas — o suficiente pras botas não
# se encostarem, que é o que deixa o Mixamo achar a virilha entre as pernas
ANGULO_BRACOS = math.radians(88)
ANGULO_PERNAS = math.radians(9)

# tamanho de gente pro Auto-Rigger: o peão tem 0,9 m; dobrado, 1,8 m. Ao trazer as animações de
# volta pro jogo, divide por esse mesmo fator.
ESCALA_MIXAMO = 2.0

# ficam fora da versão do Mixamo (no jogo voltam presos nos ossos, do mesmo jeito que a espada já
# é presa na mão):
#   - a bainha (e o cabo dela): peça solta do lado do quadril — o Auto-Rigger pendura peça solta no
#     osso mais perto (iria balançar com a coxa);
#   - o chapéu: um cone pontudo bem alto em cima da cabeça. Saliência grande no alto da cabeça
#     (cabelo, chapéu, orelhas) é causa conhecida do "Unknown error while generating motion"
PARTES_FORA_DO_MIXAMO = ("Chapeu", "Bainha", "CaboBainha")

# a malha que vai pro Mixamo é refeita em voxels desse tamanho (em metros, já no tamanho de gente)
# — ver unificar_malha
TAMANHO_VOXEL = 0.01


def preparar_geometria(malha, contagens_vertices):
    """O Auto-Rigger do Mixamo precisa de um corpo "inteiro" — ele passa o esqueleto por dentro do
    volume do personagem. O peão do jogo é montado com peças que não se encostam: a cabeça é uma
    esfera solta (2 cm de vão até o tronco, sem pescoço) e a bainha flutua do lado do quadril — com
    isso o rigging falhava ("Unknown error while generating motion"). Aqui: pescoço ligando cabeça e
    tronco, e as peças de PARTES_FORA_DO_MIXAMO fora."""
    faixas = {}
    inicio = 0
    for nome, quantidade in contagens_vertices:
        faixas[nome] = range(inicio, inicio + quantidade)
        inicio += quantidade

    bm = bmesh.new()
    bm.from_mesh(malha.data)
    bm.verts.ensure_lookup_table()
    camada_pesos = bm.verts.layers.deform.verify()

    # pescoço: cilindro de 8 lados entre o topo do tronco (0,61) e a base da cabeça (0,63), um pouco
    # por dentro dos dois — preso no osso da cabeça. A malha tem a origem no meio do tronco (o join
    # mantém a origem da primeira peça), então a posição vai convertida pras coordenadas dela
    centro_pescoco = malha.matrix_world.inverted() @ Vector((0, 0, 0.62))
    pescoco = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=8,
        radius1=0.035,
        radius2=0.035,
        depth=0.08,
        matrix=Matrix.Translation(centro_pescoco),
    )
    grupo_cabeca = malha.vertex_groups["Head"].index
    for vertice in pescoco["verts"]:
        vertice[camada_pesos][grupo_cabeca] = 1.0

    bm.verts.ensure_lookup_table()
    fora = [bm.verts[i] for nome in PARTES_FORA_DO_MIXAMO for i in faixas[nome]]
    bmesh.ops.delete(bm, geom=fora, context="VERTS")

    bm.to_mesh(malha.data)
    bm.free()
    malha.data.update()


def girar_osso_no_mundo(esqueleto, nome_osso, angulo_y):
    """Gira o osso (e tudo que vem depois dele na cadeia) em torno do eixo Y do mundo, com o pivô na
    junta (cabeça do osso) — independe do "roll" do osso, então o sentido é sempre o mesmo:
    ângulo positivo leva a ponta pra -X (lado esquerdo do boneco), negativo pra +X."""
    pose_osso = esqueleto.pose.bones[nome_osso]
    junta = pose_osso.head.copy()
    rotacao = Matrix.Translation(junta) @ Matrix.Rotation(angulo_y, 4, "Y") @ Matrix.Translation(-junta)
    pose_osso.matrix = rotacao @ pose_osso.matrix
    bpy.context.view_layer.update()


def ponta_no_mundo(esqueleto, nome_osso):
    return esqueleto.matrix_world @ esqueleto.pose.bones[nome_osso].tail


def montar_peao():
    """O mesmo peão do jogo (malha + esqueleto do criar_peao_rpg.py), montado numa cena vazia."""
    bpy.ops.wm.read_homefile(use_empty=True)
    base.limpar_cena()
    malha, contagens_vertices, contagens_faces = base.criar_malha()
    base.criar_grupos_de_vertice(malha, contagens_vertices)
    esqueleto = base.criar_esqueleto()
    base.vincular_malha_ao_esqueleto(malha, esqueleto)
    base.atribuir_materiais(malha, contagens_faces)
    return malha, esqueleto, contagens_vertices


def preparar_malha():
    malha, esqueleto, contagens_vertices = montar_peao()
    preparar_geometria(malha, contagens_vertices)
    vertices_antes = len(malha.data.vertices)

    # sem animação nenhuma (as trilhas NLA de Idle/Walk/Attack sobrescreveriam a pose montada aqui)
    esqueleto.animation_data_clear()
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

    girar_osso_no_mundo(esqueleto, "Arm_L", ANGULO_BRACOS)
    girar_osso_no_mundo(esqueleto, "Arm_R", -ANGULO_BRACOS)
    girar_osso_no_mundo(esqueleto, "Leg_L", ANGULO_PERNAS)
    girar_osso_no_mundo(esqueleto, "Leg_R", -ANGULO_PERNAS)

    # confere a pose antes de seguir: pulsos bem pra fora dos ombros, na altura dos ombros
    for lado, sinal in (("L", -1), ("R", 1)):
        ombro = esqueleto.matrix_world @ esqueleto.pose.bones[f"Arm_{lado}"].head
        pulso = ponta_no_mundo(esqueleto, f"Forearm_{lado}")
        assert sinal * (pulso.x - ombro.x) > 0.2, f"braço {lado} não abriu: ombro {ombro}, pulso {pulso}"
        assert abs(pulso.z - ombro.z) < 0.03, f"braço {lado} não ficou na horizontal: ombro {ombro}, pulso {pulso}"

    bpy.ops.object.mode_set(mode="OBJECT")

    # "congela" a pose na malha (aplica o modificador de esqueleto) e tira o esqueleto
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = malha
    malha.select_set(True)
    for modificador in list(malha.modifiers):
        if modificador.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=modificador.name)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.data.objects.remove(esqueleto, do_unlink=True)
    malha.vertex_groups.clear()
    # o peão é montado olhando pra +Y (lado esquerdo dele = -X, onde fica a bainha); o Mixamo espera
    # o personagem de frente pra vista frontal do Blender (-Y). Como o boneco não tem rosto, de
    # costas o Mixamo trocaria esquerda e direita — a mão da espada (direita) iria pro lado da bainha
    malha.matrix_world = Matrix.Rotation(math.pi, 4, "Z") @ malha.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    assert len(malha.data.vertices) == vertices_antes, "a malha mudou de tamanho ao aplicar a pose"

    # tamanho de gente (ver ESCALA_MIXAMO)
    malha.scale = (ESCALA_MIXAMO,) * 3
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    unificar_malha(malha)
    return malha


def contar_pecas_soltas(malha):
    """Quantos pedaços de malha sem nenhuma aresta ligando um ao outro."""
    vizinhos = {v.index: [] for v in malha.data.vertices}
    for aresta in malha.data.edges:
        a, b = aresta.vertices
        vizinhos[a].append(b)
        vizinhos[b].append(a)
    vistos = set()
    pecas = 0
    for inicio in vizinhos:
        if inicio in vistos:
            continue
        pecas += 1
        pilha = [inicio]
        while pilha:
            atual = pilha.pop()
            if atual in vistos:
                continue
            vistos.add(atual)
            pilha.extend(vizinhos[atual])
    return pecas


def unificar_malha(malha):
    """Refaz a malha como uma superfície só, fechada, com quadrados de ~1 cm (remalha por voxels:
    o volume de todas as peças vira um sólido único, e a casca dele vira a malha nova).

    O peão do jogo é feito de peças sobrepostas (tronco, cabeça, pescoço, ombros, braços, pernas,
    botas), com tampas de 8 lados e uns 300 vértices no total. Mesmo com os marcadores em cima do
    boneco, o Auto-Rigger recusava ("Unknown error while generating motion" / "Please place all
    markers on the character!") — peças separadas e malha pobre demais são causas conhecidas disso.
    Essa malha serve só pro Mixamo calcular o esqueleto; no jogo continua o peão original (as peças
    dele presas nos ossos que vierem do Mixamo)."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = malha
    malha.select_set(True)
    remalha = malha.modifiers.new("Remalha", "REMESH")
    remalha.mode = "VOXEL"
    remalha.voxel_size = TAMANHO_VOXEL
    remalha.adaptivity = 0.0
    bpy.ops.object.modifier_apply(modifier=remalha.name)
    pecas = contar_pecas_soltas(malha)
    assert pecas == 1, f"a remalha deveria dar uma peça só, deu {pecas}"
    print(
        f"[exportar_peao_mixamo] malha unificada: 1 peça fechada, {len(malha.data.vertices)} vértices, "
        f"{len(malha.data.polygons)} faces"
    )


def exportar_fbx(malha):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = malha
    malha.select_set(True)
    # FBX no formato padrão do Blender (unidade cm no arquivo, vértices em metros com escala 100 no
    # objeto) — o mesmo do primeiro arquivo, que o Mixamo leu certo — com o personagem em 1,8 m
    bpy.ops.export_scene.fbx(
        filepath=CAMINHO_FBX,
        use_selection=True,
        object_types={"MESH"},
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="AUTO",
    )
    # OBJ não tem unidade: os números saem em centímetros (180), que é como o Mixamo lê
    bpy.ops.wm.obj_export(
        filepath=CAMINHO_OBJ,
        export_selected_objects=True,
        export_materials=False,
        forward_axis="NEGATIVE_Z",
        up_axis="Y",
        global_scale=100.0,
    )


def conferir_fbx():
    """Reabre o FBX numa cena vazia e confere: uma malha só, nenhum esqueleto, braços abertos."""
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=CAMINHO_FBX)
    malhas = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    esqueletos = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    assert len(malhas) == 1, f"esperava 1 malha no FBX, veio {len(malhas)}"
    assert not esqueletos, "o FBX não pode ter esqueleto (é isso que o Mixamo não consegue mapear)"
    malha = malhas[0]
    cantos = [malha.matrix_world @ Vector(c) for c in malha.bound_box]
    largura = max(c.x for c in cantos) - min(c.x for c in cantos)
    altura = max(c.z for c in cantos) - min(c.z for c in cantos)
    print(
        f"[exportar_peao_mixamo] FBX conferido: 1 malha, sem esqueleto, {len(malha.data.vertices)} vértices, "
        f"largura {largura:.3f} m (braços abertos), altura {altura:.3f} m"
    )
    assert largura / altura > 0.7, "braços não estão abertos no FBX"
    # 0,78 m de peão sem o chapéu, dobrado
    assert 1.45 < altura < 1.7, f"esperava ~1,57 m de altura no FBX, veio {altura:.3f} m"
    return malha


def renderizar_conferencia(malha):
    """Duas vistas (frente e lado) lado a lado numa imagem só, pra conferir a pose antes de subir."""
    cena = bpy.context.scene
    cena.render.engine = "BLENDER_WORKBENCH"
    cena.display.shading.light = "STUDIO"
    cena.display.shading.color_type = "SINGLE"
    cena.display.shading.single_color = (0.75, 0.75, 0.78)
    cena.display.shading.show_object_outline = True
    cena.render.resolution_x = 520
    cena.render.resolution_y = 560
    cena.render.film_transparent = False
    cena.world = cena.world or bpy.data.worlds.new("Mundo")

    cantos = [malha.matrix_world @ Vector(c) for c in malha.bound_box]
    centro = sum(cantos, Vector()) / 8
    tamanho = max(max(c.x for c in cantos) - min(c.x for c in cantos), max(c.z for c in cantos) - min(c.z for c in cantos))
    camera_dados = bpy.data.cameras.new("CameraConferencia")
    camera_dados.type = "ORTHO"
    camera_dados.ortho_scale = tamanho * 1.25
    camera_dados.clip_end = tamanho * 20
    camera = bpy.data.objects.new("CameraConferencia", camera_dados)
    cena.collection.objects.link(camera)
    cena.camera = camera

    distancia = tamanho * 4
    imagens = []
    for nome, posicao, rotacao in (
        ("frente", (centro.x, centro.y - distancia, centro.z), (math.radians(90), 0, 0)),
        ("lado", (centro.x + distancia, centro.y, centro.z), (math.radians(90), 0, math.radians(90))),
    ):
        camera.location = posicao
        camera.rotation_euler = rotacao
        caminho = os.path.join(PASTA, f"_conferencia_{nome}.png")
        cena.render.filepath = caminho
        bpy.ops.render.render(write_still=True)
        imagens.append(caminho)

    # junta as duas vistas numa imagem só (lado a lado)
    carregadas = [bpy.data.images.load(c) for c in imagens]
    largura = sum(i.size[0] for i in carregadas)
    altura = max(i.size[1] for i in carregadas)
    final = bpy.data.images.new("Conferencia", width=largura, height=altura)
    pixels = [0.0] * (largura * altura * 4)
    deslocamento = 0
    for imagem in carregadas:
        w, h = imagem.size
        origem = list(imagem.pixels)
        for y in range(h):
            inicio_destino = (y * largura + deslocamento) * 4
            inicio_origem = y * w * 4
            pixels[inicio_destino : inicio_destino + w * 4] = origem[inicio_origem : inicio_origem + w * 4]
        deslocamento += w
    final.pixels = pixels
    final.filepath_raw = CAMINHO_PNG
    final.file_format = "PNG"
    final.save()
    for caminho in imagens:
        os.remove(caminho)


def main():
    # o script monta o peão numa cena vazia (read_homefile) — rodando de dentro da interface do
    # Blender, isso descartaria o que estiver aberto lá sem perguntar; então só roda pelo terminal
    if not bpy.app.background:
        raise SystemExit(
            "Rode este script pelo terminal, sem abrir a interface:\n"
            "    blender --background --python scripts/blender/exportar_peao_mixamo.py\n"
            "(dentro da interface ele apagaria a cena que estiver aberta)"
        )
    malha = preparar_malha()
    exportar_fbx(malha)
    print(f"[exportar_peao_mixamo] FBX pro Mixamo salvo em: {CAMINHO_FBX}")
    malha_conferida = conferir_fbx()
    renderizar_conferencia(malha_conferida)
    print(f"[exportar_peao_mixamo] imagem de conferência salva em: {CAMINHO_PNG}")


# só roda rodando este arquivo direto — o importar_animacoes_mixamo.py importa as funções daqui pra
# pôr o peão na mesma pose T que foi pro Mixamo
if __name__ == "__main__":
    main()
