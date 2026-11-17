// Privacidade e termos de uso, em linguagem simples, nos idiomas do jogo. Quando mudar algo importante, troque a data
// de `atualizado` nos três idiomas.

import type { Idioma } from './idiomas'

export const PAGINA_DO_PROJETO = 'https://github.com/MaxL007/xadrez-caotico/issues'

export interface SecaoDoTexto {
  titulo: string
  paragrafos: string[]
}

export interface TextoDePrivacidade {
  atualizado: string
  introducao: string
  secoes: SecaoDoTexto[]
  contato: string
  linkContato: string
}

const PT: TextoDePrivacidade = {
  atualizado: 'Atualizado em 16/11/2026',
  introducao:
    'O Xadrez Caótico é um jogo gratuito, sem anúncios e sem compras com dinheiro de verdade. Este texto explica o que o jogo guarda sobre você, para quê, por quanto tempo e como apagar.',
  secoes: [
    {
      titulo: 'Sem conta',
      paragrafos: ['Sem conta, as partidas contra a máquina e as configurações ficam só neste aparelho. Nada disso vai para o servidor.'],
    },
    {
      titulo: 'O que guardamos quando você cria uma conta',
      paragrafos: [
        'O nome de jogador e o ID, a foto de perfil (se você enviar uma), o avatar e a moldura.',
        'A senha e o código de recuperação, só embaralhados (com hash e sal): ninguém consegue lê-los, nem quem cuida do jogo.',
        'As partidas salvas, os amigos, as partidas com outras pessoas (com os lances), as óticoins, as conquistas, os itens e os equipamentos.',
        'Quando você esteve no jogo pela última vez, para a bolinha verde que seus amigos veem.',
        'Não pedimos e-mail, telefone, endereço, data de nascimento nem o seu nome verdadeiro. Não use dados pessoais no nome de jogador.',
      ],
    },
    {
      titulo: 'Endereço de internet e erros',
      paragrafos: [
        'O endereço de internet (IP) serve só para limitar tentativas, como criar contas ou recuperar a senha em sequência. Ele fica guardado por até 1 hora.',
        'Quando algo quebra, o jogo envia um relatório com a mensagem do erro, a versão do jogo e o tipo de navegador, sem nome, sem ID e sem IP. Os relatórios são apagados em 30 dias.',
      ],
    },
    {
      titulo: 'Para que usamos',
      paragrafos: [
        'Só para o jogo funcionar: entrar na conta, salvar partidas, jogar com outras pessoas, pagar óticoins, impedir abusos e corrigir erros.',
        'Nada é vendido nem passado para anunciantes, e o jogo não tem rastreadores de publicidade.',
      ],
    },
    {
      titulo: 'Quem mais vê',
      paragrafos: [
        'Seus amigos veem seu nome, ID, foto, moldura, conquistas, se você está no jogo e as partidas entre vocês.',
        'No adversário automático, a outra pessoa vê seu nome, foto e moldura durante a partida.',
        'O jogo funciona com a Cloudflare (servidor e banco de dados), o GitHub Pages (o site) e o Google Fonts (as letras do site). Como em qualquer site, eles recebem o endereço de internet de quem acessa.',
      ],
    },
    {
      titulo: 'Por quanto tempo',
      paragrafos: [
        'Enquanto a conta existir. As sessões vencidas são apagadas todos os dias.',
        'Excluir a conta apaga na hora tudo o que está ligado a ela. As cópias de segurança do banco somem em até 2 meses.',
      ],
    },
    {
      titulo: 'Seus direitos',
      paragrafos: [
        'Pela Lei Geral de Proteção de Dados (LGPD), você pode ver, corrigir e apagar os seus dados.',
        'Seus dados estão no Perfil. A foto e a moldura mudam lá mesmo. Para apagar tudo: Entrar → Excluir minha conta.',
      ],
    },
    {
      titulo: 'Crianças',
      paragrafos: ['Quem tem menos de 12 anos só deve criar conta com a autorização e o acompanhamento de um responsável.'],
    },
    {
      titulo: 'Regras do jogo (termos de uso)',
      paragrafos: [
        'Jogue limpo e trate bem as outras pessoas. Não use nome ou foto ofensivos, de outra pessoa ou com dados pessoais.',
        'Não tente trapacear, explorar falhas nem atacar o servidor. Contas que desrespeitarem as regras ou receberem denúncias confirmadas podem ser apagadas.',
        'As óticoins e os itens não valem dinheiro, não podem ser trocados por dinheiro e podem ser ajustados para manter o jogo justo.',
        'O jogo é oferecido como está: ele pode mudar, ficar fora do ar ou perder dados numa falha, mesmo com as cópias de segurança.',
      ],
    },
  ],
  contato:
    'Dúvidas e pedidos: abra um pedido na página do projeto. A página é pública: não escreva senha, código de recuperação nem dados pessoais lá. Mudanças importantes neste texto aparecem aqui, com a data.',
  linkContato: 'Página do projeto',
}

const EN: TextoDePrivacidade = {
  atualizado: 'Updated on 2026-11-16',
  introducao:
    'Chaotic Chess is a free game, with no ads and no purchases with real money. This page explains what the game keeps about you, why, for how long and how to delete it.',
  secoes: [
    {
      titulo: 'Without an account',
      paragrafos: ['Without an account, your games against the machine and your settings stay only on this device. None of it goes to the server.'],
    },
    {
      titulo: 'What we keep when you create an account',
      paragrafos: [
        'Your player name and ID, your profile picture (if you upload one), your avatar and your frame.',
        'Your password and recovery code, only in scrambled form (hashed and salted): nobody can read them, not even the people who run the game.',
        'Your saved games, friends, games with other people (with the moves), óticoins, achievements, items and equipment.',
        'When you were last in the game, for the green dot your friends see.',
        'We do not ask for your email, phone number, address, birth date or real name. Do not put personal data in your player name.',
      ],
    },
    {
      titulo: 'Internet address and errors',
      paragrafos: [
        'Your internet (IP) address is used only to limit repeated attempts, such as creating accounts or recovering a password over and over. It is kept for up to 1 hour.',
        'When something breaks, the game sends a report with the error message, the game version and the browser type, with no name, no ID and no IP. Reports are deleted after 30 days.',
      ],
    },
    {
      titulo: 'What we use it for',
      paragrafos: [
        'Only to make the game work: signing in, saving games, playing with other people, paying óticoins, preventing abuse and fixing errors.',
        'Nothing is sold or handed to advertisers, and the game has no advertising trackers.',
      ],
    },
    {
      titulo: 'Who else sees it',
      paragrafos: [
        'Your friends see your name, ID, picture, frame, achievements, whether you are in the game and the games between you.',
        'With automatic matchmaking, the other player sees your name, picture and frame during the game.',
        'The game runs on Cloudflare (server and database), GitHub Pages (the website) and Google Fonts (the website fonts). Like any website, they receive the internet address of whoever visits.',
      ],
    },
    {
      titulo: 'For how long',
      paragrafos: [
        'For as long as the account exists. Expired sessions are deleted every day.',
        'Deleting your account immediately erases everything linked to it. Database backups are gone within 2 months.',
      ],
    },
    {
      titulo: 'Your rights',
      paragrafos: [
        'Under Brazil’s data protection law (LGPD), you can see, correct and delete your data.',
        'Your data is in your Profile, where you can also change your picture and frame. To delete everything: Sign in → Delete my account.',
      ],
    },
    {
      titulo: 'Children',
      paragrafos: ['Children under 12 should only create an account with the permission and supervision of a parent or guardian.'],
    },
    {
      titulo: 'Game rules (terms of use)',
      paragrafos: [
        'Play fair and treat other people well. Do not use an offensive name or picture, someone else’s, or one with personal data.',
        'Do not try to cheat, exploit bugs or attack the server. Accounts that break the rules or receive confirmed reports may be deleted.',
        'Óticoins and items have no money value, cannot be exchanged for money and may be adjusted to keep the game fair.',
        'The game is provided as is: it may change, go offline or lose data in a failure, even with backups.',
      ],
    },
  ],
  contato:
    'Questions and requests: open an issue on the project page. The page is public: do not write your password, recovery code or personal data there. Important changes to this text will appear here, with the date.',
  linkContato: 'Project page',
}

const ES: TextoDePrivacidade = {
  atualizado: 'Actualizado el 16/11/2026',
  introducao:
    'Ajedrez Caótico es un juego gratuito, sin anuncios y sin compras con dinero real. Este texto explica qué guarda el juego sobre ti, para qué, por cuánto tiempo y cómo borrarlo.',
  secoes: [
    {
      titulo: 'Sin cuenta',
      paragrafos: ['Sin cuenta, las partidas contra la máquina y los ajustes quedan solo en este dispositivo. Nada de eso va al servidor.'],
    },
    {
      titulo: 'Qué guardamos cuando creas una cuenta',
      paragrafos: [
        'Tu nombre de jugador y tu ID, tu foto de perfil (si subes una), tu avatar y tu marco.',
        'La contraseña y el código de recuperación, solo cifrados (con hash y sal): nadie puede leerlos, ni siquiera quienes cuidan el juego.',
        'Las partidas guardadas, los amigos, las partidas con otras personas (con las jugadas), las óticoins, los logros, los objetos y el equipamiento.',
        'La última vez que estuviste en el juego, para el punto verde que ven tus amigos.',
        'No pedimos correo, teléfono, dirección, fecha de nacimiento ni tu nombre real. No pongas datos personales en tu nombre de jugador.',
      ],
    },
    {
      titulo: 'Dirección de internet y errores',
      paragrafos: [
        'La dirección de internet (IP) sirve solo para limitar intentos, como crear cuentas o recuperar la contraseña una y otra vez. Se guarda hasta 1 hora.',
        'Cuando algo falla, el juego envía un informe con el mensaje del error, la versión del juego y el tipo de navegador, sin nombre, sin ID y sin IP. Los informes se borran en 30 días.',
      ],
    },
    {
      titulo: 'Para qué lo usamos',
      paragrafos: [
        'Solo para que el juego funcione: entrar en la cuenta, guardar partidas, jugar con otras personas, pagar óticoins, evitar abusos y corregir errores.',
        'Nada se vende ni se entrega a anunciantes, y el juego no tiene rastreadores de publicidad.',
      ],
    },
    {
      titulo: 'Quién más lo ve',
      paragrafos: [
        'Tus amigos ven tu nombre, ID, foto, marco, logros, si estás en el juego y las partidas entre ustedes.',
        'Con el rival automático, la otra persona ve tu nombre, foto y marco durante la partida.',
        'El juego funciona con Cloudflare (servidor y base de datos), GitHub Pages (el sitio) y Google Fonts (las letras del sitio). Como en cualquier sitio, reciben la dirección de internet de quien entra.',
      ],
    },
    {
      titulo: 'Por cuánto tiempo',
      paragrafos: [
        'Mientras la cuenta exista. Las sesiones vencidas se borran todos los días.',
        'Eliminar la cuenta borra al instante todo lo que está ligado a ella. Las copias de seguridad de la base de datos desaparecen en hasta 2 meses.',
      ],
    },
    {
      titulo: 'Tus derechos',
      paragrafos: [
        'Según la ley brasileña de protección de datos (LGPD), puedes ver, corregir y borrar tus datos.',
        'Tus datos están en el Perfil, donde también cambias la foto y el marco. Para borrarlo todo: Entrar → Eliminar mi cuenta.',
      ],
    },
    {
      titulo: 'Niños',
      paragrafos: ['Quien tenga menos de 12 años solo debe crear una cuenta con el permiso y el acompañamiento de un responsable.'],
    },
    {
      titulo: 'Reglas del juego (términos de uso)',
      paragrafos: [
        'Juega limpio y trata bien a las demás personas. No uses un nombre o una foto ofensivos, de otra persona o con datos personales.',
        'No intentes hacer trampa, aprovechar fallos ni atacar el servidor. Las cuentas que rompan las reglas o reciban denuncias confirmadas pueden ser eliminadas.',
        'Las óticoins y los objetos no valen dinero, no se pueden cambiar por dinero y pueden ajustarse para mantener el juego justo.',
        'El juego se ofrece tal como está: puede cambiar, quedar fuera de línea o perder datos en una falla, incluso con las copias de seguridad.',
      ],
    },
  ],
  contato:
    'Dudas y pedidos: abre una solicitud en la página del proyecto. La página es pública: no escribas tu contraseña, tu código de recuperación ni datos personales allí. Los cambios importantes en este texto aparecerán aquí, con la fecha.',
  linkContato: 'Página del proyecto',
}

export const PRIVACIDADE: Record<Idioma, TextoDePrivacidade> = { 'pt-BR': PT, en: EN, es: ES }
