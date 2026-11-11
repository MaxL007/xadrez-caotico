# Xadrez Caótico

Xadrez 3D no navegador. As peças lutam de verdade a cada captura. Dá pra jogar contra a máquina, sem conta
nenhuma, ou criar uma conta gratuita, montar o perfil com foto e moldura, adicionar amigos pelo nome, pelo ID, por um
link de convite ou pelo QR Code, e chamá-los pra uma partida amistosa. As partidas contra a máquina rendem conquistas e
óticoins, a moeda do jogo. O site se instala como aplicativo no celular e no computador, e abre sem internet pra jogar
contra a máquina.

## Como funciona

- **Site:** React, Vite e three.js, publicado no GitHub Pages.
- **Servidor** (`worker/`): Cloudflare Workers, com banco D1 para contas e partidas salvas e uma sala em
  Durable Object para cada partida entre duas pessoas. A sala é o árbitro: confere a vez e a legalidade de
  cada lance no servidor.
- **Senhas:** nunca saem do aparelho. O site deriva uma chave com 600 mil rodadas de PBKDF2 e o servidor
  guarda um HMAC dela com um segredo que fica só na Cloudflare.

## Desenvolvimento

```sh
npm install
cd worker && npm install && cd ..

# segredos locais do simulador (não vão pro git)
printf 'PIMENTA=qualquer-coisa-longa\nORIGENS=http://127.0.0.1:5184\nLIMITE_CONTAS=100000\n' > worker/.dev.vars
cd worker && npx wrangler d1 migrations apply xadrez-caotico --local && npm run dev   # simulador, porta 8787
npm run dev                                                                            # site, porta 5184
```

Testes, com os dois no ar:

```sh
node testes/testar-servidor.mjs    # contas, amigos, perfil, dados de cada pessoa e tentativas de trapaça
node testes/testar-online.mjs      # dois navegadores virando amigos, jogando e montando o perfil
node testes/testar-promocao.mjs    # promoção, marreta e tabuleiro virando
node testes/testar-volta-da-aba.mjs  # a tela volta inteira depois de perder o contexto gráfico
node testes/testar-convites.mjs    # convite por link e QR Code, com a câmera falsa do Chrome
node testes/testar-dificuldade.mjs # fácil, intermediário e difícil, e a força da máquina em cada um
node testes/testar-empate.mjs      # empate com a máquina, taça no centro, aba de lances e peça que volta ao centro
node testes/testar-qualidade.mjs   # média como padrão e a resolução de cada qualidade no computador e no celular
node testes/fotos-online.mjs       # fotos das telas, com o 3D ligado
node testes/fotos-personalizacao.mjs  # fotos de cada peça vestida, na vitrine da Personalização
```

O aplicativo instalável só existe no build de produção, e o teste dele sobe o próprio servidor:

```sh
npm run build                      # gera também o dist/sw.js, com a lista de arquivos guardados no aparelho
node testes/testar-aplicativo.mjs  # instalável, sem internet, versão nova baixando só o que mudou
```

## Publicação do servidor

```sh
cd worker
npx wrangler login
npx wrangler d1 create xadrez-caotico        # copie o database_id pro wrangler.toml
npx wrangler d1 migrations apply xadrez-caotico --remote
npx wrangler secret put PIMENTA              # um valor longo e aleatório. Trocar depois invalida as senhas
npx wrangler deploy
```

O endereço do servidor vai em `.env.production` (`VITE_API_URL`), e o site é publicado a cada envio pra `main`.

Servidor publicado: `https://xadrez-caotico.xadrez-caotico-servidor.workers.dev`. Para conferir a publicação de verdade:

```sh
API=https://xadrez-caotico.xadrez-caotico-servidor.workers.dev node testes/conferir-producao.mjs
API=https://xadrez-caotico.xadrez-caotico-servidor.workers.dev node testes/conferir-site-publicado.mjs
```

Os dois criam contas temporárias e as apagam no fim, e gastam o limite de 5 contas por hora do endereço.
