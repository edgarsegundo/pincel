# Pincel – Spec MVP

**Versão:** 0.3 · **Data:** 03/11/2026 · **Status:** MVP implementado (M0–M6); calibração com traços reais e v2 (JEV) pendentes

> **Mudanças desde a v0.2:** interação sem modos (o mouse desenha, o teclado escreve, rabiscar apaga, clicar seleciona); gatilho de endireitamento em dois níveis (soltar / segurar); losango, preenchimento, rótulos em formas e conectores; ajustes finos automáticos; aprendizado local de limiares; Preact via alias no lugar do React; IndexedDB; design system e tema escuro; PWA offline; registro de formas (um arquivo por forma); metas de desempenho mais rígidas e medidas em navegador real. Plano com Konva removido.

## 1. Visão

O **Pincel** é um whiteboard no navegador que deve ser **o mais fluido do mercado**. O usuário nunca escolhe uma ferramenta para fazer o básico:

- **O mouse desenha.** O app reconhece e endireita formas sozinho.
- **O teclado escreve.** Começar a digitar cria um texto onde está o cursor (ou o rótulo da forma sob o cursor).
- **Rabiscar por cima apaga.** **Clicar seleciona** e **arrastar move**.

A IA (JEV) entra na v2 para os casos ambíguos e para entender o desenho como um todo (seção 11).

### Princípios

1. **Zero resistência.** Se o usuário precisa pensar em qual ferramenta usar, o design falhou.
2. **Desenhar nunca espera por nada.** O traço é desenhado localmente a cada frame; reconhecimento, persistência e IA rodam fora do caminho crítico.
3. **Todo automatismo é reversível** com um Cmd/Ctrl+Z.
4. **Local primeiro.** Reconhecimento e ajustes acontecem no dispositivo. A IA devolve **intenção, nunca coordenadas**.
5. **Leve por padrão.** Cada dependência e kilobyte se justifica contra o orçamento (seção 5).
6. **Dados independentes do renderizador.** O quadro é uma lista de objetos serializáveis; o canvas é só uma visualização.
7. **Customizar = adicionar um arquivo.** Formas, configurações, idiomas e temas são plugáveis por registro.

## 2. Escopo

### Implementado no MVP

| # | Funcionalidade | Detalhe |
| --- | --- | --- |
| F1 | Desenho livre | Pointer Events, perfect-freehand, ponta prevista (`getPredictedEvents`), eventos coalescidos |
| F2 | Endireitar formas | Linha, retângulo, losango, elipse, triângulo; ao soltar (limiar alto) ou ao segurar parado (limiar menor + ajuste de tamanho) |
| F3 | Ajustes finos | Ângulo de linha (múltiplos de 45°), quadrado/círculo, igualar tamanho e alinhar com vizinhas |
| F4 | Texto sem ferramenta | Digitar em qualquer lugar; duplo clique; Enter edita o texto selecionado; fonte manuscrita hospedada |
| F5 | Rótulo em forma | Digitar com forma fechada selecionada ou sob o cursor cria rótulo centralizado com quebra de linha |
| F6 | Conectores | Pontas de linha a ≤ 12 px do contorno de uma forma grudam e se ligam; acompanham ao mover; seta nenhuma/fim/ambas |
| F7 | Rabiscar para apagar | Zigue-zague rápido sobre objetos os apaga (fade de 120 ms) |
| F8 | Selecionar e mover | Clique seleciona (Shift soma); arrastar move; Alt+arrastar duplica; Delete apaga |
| F9 | Copiar/colar/duplicar | Cmd+C/X/V/D/A dentro do app; ligações de linhas são remapeadas nas cópias |
| F10 | Cor, espessura, preenchimento | 8 cores semânticas (adaptam ao tema), 3 espessuras, preenchimento nenhum/sólido/hachura; barra de contexto na seleção |
| F11 | Estilo das formas | Desenhado à mão (Rough.js, padrão) ou limpo |
| F12 | Desfazer/refazer | Histórico por snapshot (até 200); cada automatismo é uma entrada separada |
| F13 | Pan e zoom | Trackpad: dois dedos pan, pinça zoom. Mouse: roda pan, Cmd/Ctrl+roda zoom. Espaço e botão do meio: pan. Cmd+0 (100%), Cmd+1 (enquadrar) |
| F14 | Persistência | Autosave em IndexedDB (debounce 1 s e ao ocultar a aba); objetos malformados são descartados ao carregar |
| F15 | Exportar/importar | PNG (recortado, 2x, tema atual) e JSON; importar por menu ou arrastando o arquivo |
| F16 | Limpar quadro | Sem modal: notificação "Quadro limpo · Desfazer" |
| F17 | Configurações, idiomas, tema | Painel lateral gerado por esquema; pt-BR e en; tema automático/claro/escuro |
| F18 | Aprendizado local | Limiares por tipo sobem ao desfazer uma conversão e descem ao forçar uma |
| F19 | PWA offline | Instalável; abre e desenha sem internet (verificado por teste) |

### Fora do escopo (próximas versões)

Colaboração, contas, quadros na nuvem, vários quadros locais, redimensionar/girar/agrupar, laço de seleção, camadas, imagens, **reconhecimento de setas desenhadas**, arrastar uma ponta isolada de conector, formas inclinadas, toque e caneta com pressão real, tinta → texto, JEV (v2), exportar SVG, WebGL, Web Workers.

## 3. Modelo de interação sem modos

A ferramenta padrão é a **Caneta inteligente**; o roteador de gestos (`input/pointer.ts`) decide a intenção.

| O usuário faz | Onde | Resultado |
| --- | --- | --- |
| Arrastar | Vazio ou objeto não selecionado | Desenha |
| Arrastar | Objeto selecionado | Move a seleção (Alt duplica) |
| Clique (< 4 px, < 300 ms) | Objeto | Seleciona (Shift soma/tira) |
| Clique | Vazio | Limpa a seleção (não deixa ponto; segurar > 300 ms faz um ponto) |
| Duplo clique | Vazio | Abre texto |
| Duplo clique | Texto / forma fechada | Edita texto / rótulo |
| Segurar parado ≥ 400 ms | Durante o traço | Endireita com limiar menor; arrastar ajusta o tamanho (a alça é o canto mais próximo de onde o traço terminou) |
| Shift ao soltar | Fim do traço | Força o endireitamento (limiar de "segurar") |
| Zigue-zague rápido | Sobre objetos | Apaga os objetos tocados |

**Teclado:** letras nunca são atalhos (digitar escreve). Atalhos: Cmd/Ctrl+Z / Shift+Z, C, X, V, D, A, 0, 1; Delete/Backspace; Esc; Enter (edita); Espaço (pan); **Alt+A** liga/desliga o auto-endireitar (via `event.code`).

**Captura de texto:** um `<textarea>` invisível fica sempre focado; no primeiro `input`/`compositionstart` ele vira o editor, já com o caractere digitado (acentos, teclas mortas e IME). Com um painel aberto o teclado pertence ao painel (`blocked()`).

## 4. Reconhecimento e ajustes

### 4.1 Gatilhos

| Gatilho | Limiar padrão | Comportamento |
| --- | --- | --- |
| Soltar | 0,90 (por tipo, ajustado pelo aprendizado) | Converte só com muita certeza |
| Segurar (≤ 3 px por 400 ms) | 0,60 | Converte na hora; arrastar ajusta; soltar confirma |

Desfazer: o 1º Cmd+Z restaura o traço original; o 2º remove o traço. A animação traço → forma dura 180 ms (mola leve).

### 4.2 Proteções contra falsos positivos

- Traço com caixa < 24 px (de tela) não converte ao soltar.
- **Cadência de escrita:** traço que começa < 600 ms após o anterior e perto dele não converte ao soltar.
- **Ambiguidade:** se o 2º candidato (≥ 0,5) está a < 0,1 do 1º, o traço fica livre ao soltar.
- Auto-endireitar desligado: só segurar parado ou Shift convertem.

### 4.3 Reconhecedor (`recognition/`, matchers em `shapes/`)

Reamostra o traço em 64 pontos; "fechado" = distância início–fim < 10% do comprimento. Cada forma tem um `match()` que devolve confiança 0–1 (queda quadrática do erro relativo à tolerância, com penalidade por fechamento frouxo):

- **Linha:** aberto, corda/comprimento ≥ 0,88, desvio rms da reta.
- **Retângulo / losango:** caixa do traço, distância ao perímetro; sanidade de proporção e perímetro.
- **Elipse:** erro radial normalizado na caixa; sanidade pelo perímetro de Ramanujan.
- **Triângulo:** maior triângulo inscrito nos 64 pontos; distância ao perímetro.

Limitação conhecida: formas inclinadas não são reconhecidas (ficam livres). A geometria final é sempre calculada localmente.

### 4.4 Ajustes finos (`beautify.ts`, cada um desligável nas configurações)

Ângulo de linha (±6° de múltiplos de 45°), proporção (razão 0,9–1,1 vira quadrado/círculo), igualar largura/altura (< 6% de uma vizinha do mesmo tipo), alinhar bordas/centros (< 8 px de tela), ligar pontas de linha a formas (≤ 12 px). "Vizinha" = a até 200 px de tela.

### 4.5 Aprendizado local

Desfazer uma conversão em até 5 s sobe o limiar do tipo em 0,02 (máx. 0,97); converter segurando algo que soltar não converteria desce 0,01 (mín. padrão − 0,10). Fica no `localStorage`; desligável nas configurações.

### 4.6 Rabisco para apagar

≥ 4 inversões bruscas (> 120°), comprimento ≥ 3× a diagonal, ≤ 800 ms e tocando ao menos um objeto. Um rabisco que não toca nada continua como desenho.

## 5. Metas de desempenho

| Métrica | Meta | Medido |
| --- | --- | --- |
| JS inicial (gzip) | ≤ 60 KB (falha o build) | **36 KB** |
| Redesenho estático com 1.000 formas à mão | ≤ 8 ms | **~2 ms** (5.000 objetos: ~5 ms; Chromium) |
| Memória (JS) com 500 objetos | ≤ 80 MB | **~11 MB com 1.000 formas** |
| Reconhecimento por traço | ≤ 5 ms | abaixo de 5 ms nos testes |
| Fonte do quadro | ≤ 30 KB | **24 KB** (Caveat 500, subset pt-BR/en gerado por `scripts/subset-font.sh`) |
| Abertura até poder desenhar / com cache | ≤ 500 ms / ≤ 200 ms | não medido |
| 60 fps ao desenhar | constante | não medido |

## 6. Stack

| Camada | Escolha |
| --- | --- |
| Núcleo | TypeScript puro (strict), sem framework no caminho crítico |
| UI | **Preact via alias** (código React padrão; voltar ao React = trocar o preset do Vite) |
| Estado | Zustand vanilla (quadro e configurações em stores separados) |
| Traço / estilo | perfect-freehand; Rough.js **só como gerador de caminhos** (cache de `Path2D` por objeto) |
| Persistência | idb-keyval (IndexedDB) para o quadro; `localStorage` para configurações e limiares |
| Estilos | CSS puro + tokens + temas claro/escuro; popover e `<dialog>` nativos |
| PWA | vite-plugin-pwa (só no build) |
| Qualidade | Vitest (24 testes), Playwright (19 e2e + 1 PWA offline, incluindo testes de saúde), orçamento de bundle em `scripts/check-size.mjs` |

**Dependências de runtime (5):** preact, zustand, perfect-freehand, roughjs, idb-keyval. A fonte é hospedada no app (subset em `src/assets/`, licença OFL incluída). Floating UI não foi necessário (menu e painel usam elementos nativos).

## 7. Modelo de dados

Lista ordenada de objetos JSON; coordenadas no espaço do quadro. Cada objeto tem `id`, `type`, `color` (token semântico), `size` (`s|m|l`), `seed` (Rough.js), `createdAt` e, se nasceu de conversão, `recognizedFrom` (traço original, confiança, gatilho, instante).

Tipos: `freehand` (pontos x,y,p intercalados), `text`, `line` (`from`, `to`, `arrowhead`, `bindings?`) e as formas fechadas `rectangle`, `diamond`, `ellipse`, `triangle` (com `fill?` e `label?`). `Binding = { objectId, anchor }` com âncora normalizada na caixa da forma.

Documento salvo: `{ version: 1, objects, viewport, updatedAt }`. Configurações salvas à parte (`pincel.settings`, `version: 1`) e **validadas contra o esquema** ao carregar. Objetos inválidos são descartados na importação e no carregamento.

### Registro de formas

Cada tipo é um arquivo em `src/shapes/` exportando uma definição (`translate` e, conforme o caso, `outline`, `closed`, `inside`, `labelBox`, `draw`, `scale`, `match`). Hit-test, caixas, alinhamento, conectores e animação derivam do `outline`. **Nova forma = um arquivo + uma linha em `shapes/index.ts`.**

## 8. Arquitetura

```
UI (Preact: toolbar, barra de contexto, menu, painel, notificações)
        │ lê o store · chama comandos
Núcleo (TypeScript puro)
├─ input/        ponteiro, teclado, captura de texto
├─ gestures/     rabisco
├─ recognition/  prepare, decide, beautify, convert, learning, cue
├─ shapes/       registro de formas
├─ core/         store, bindings, clipboard, types
├─ settings/     esquema declarativo + store persistido
└─ viewport/
        │
Renderer: canvas estático (com culling por viewport) + canvas ativo (traço, seleção, animação, dicas)
        │
Store (Zustand) → IndexedDB · exportação
```

Regras: o núcleo não importa UI; estado transitório (traço, ponteiro) fica fora do store; o documento só muda por commits; inicialização em duas etapas (núcleo e canvas primeiro, UI depois). Durante o arrasto só se desloca o desenho (nenhum caminho é regenerado); os objetos mudam ao soltar.

## 9. Design

Minimal premium: toolbar flutuante em vidro fosco, tokens de cor/raio/sombra/movimento em `ui/tokens.css`, temas em variáveis CSS, grade de pontos em CSS (custo zero no canvas), fonte do sistema na UI e **Caveat** no quadro. Estado vazio: "Desenhe qualquer coisa · ou comece a digitar". Sem onboarding. Micro-interações: animação de conversão, guias de alinhamento e pontos de conexão (300 ms), fade ao apagar, `prefers-reduced-motion` respeitado.

## 10. Configurações (esquema em `settings/schema.ts`)

Idioma, tema, grade, estilo das formas, auto-endireitar, rabiscar para apagar, conectores, aprendizado, quatro ajustes finos; avançado: tempo de segurar, limiares (soltar/segurar), duração da animação, irregularidade do Rough.js. **Nova configuração = uma entrada no esquema + chaves de texto.** Idiomas: pt-BR (padrão, fallback) e en, em `i18n/`; texto da UI sempre via `t('chave')`.

## 11. Integração com a IA (JEV) – v2

**Status:** primeira capacidade (forma ambígua) implementada e testada com o JEV simulado; **falta a primeira calibração com a chave real** (ver "Como ligar").

O JEV (TypeSafe AI, modelo "System One") recebe um *estado* e *perguntas tipadas* e devolve decisões com probabilidades. Princípio: **a IA decide a intenção; o app calcula a geometria e confere.**

### 11.1 O que é enviado: características, não coordenadas

Em vez de coordenadas brutas, o navegador envia medidas geométricas do traço (mais baratas e muito mais informativas para um modelo de decisão), calculadas em `recognition/features.ts`: fechado e lacuna início–fim, proporção, preenchimento da caixa, circularidade, variação do raio, **curvas medidas numa janela de ~10% do perímetro** (robusto ao tremor da mão; a simplificação por RDP não era), número de cantos (≥ 65°) e os ângulos de cada curva, cruzamentos do próprio traço, as notas do reconhecedor local (ajuste forçado a cada forma) e um contorno simplificado de ≤ 16 pontos. O pedido tem < 900 bytes.

### 11.2 Duas perguntas na mesma chamada (`server/jev.ts`)

| Pergunta | Tipo | Opções / resposta | Para quê |
| --- | --- | --- | --- |
| `shape` | Choice | `circle`, `rectangle`, `triangle`, `none` (cada uma com `criteria` descrevendo o que a caracteriza) | Qual forma básica? ("círculo" cobre oval; o ajuste local define os raios) |
| `deliberate` | Noul | probabilidade 0–1 | Foi uma tentativa **deliberada** de forma, e não letra, número, rabisco ou espiral? Ataca o falso positivo principal |

Perguntas estreitas combinadas no código (padrão da doc: *speculative fan-out* / *composite scoring*). O texto das perguntas e o modelo são **pinados e versionados** (`PROMPT_VERSION`, `JEV_MODEL`), como no projeto emprego: alterar o texto muda a semântica das notas calibradas.

### 11.3 Quando a IA é consultada

- **Ao soltar:** só se o reconhecedor local **não converteu** (ambíguo ou abaixo do limiar), o traço é **quase fechado** (lacuna < 22%), tem tamanho plausível e passa nas mesmas proteções da conversão local (tamanho mínimo, cadência de escrita, auto-endireitar ligado). Letras, linhas e traços abertos nunca saem do navegador. A resposta chega depois: o traço vira forma com a animação normal, em **um passo de histórico** (Cmd+Z restaura o traço).
- **Ao segurar parado:** se o local não reconhece nem com o limiar menor, a IA é consultada na hora; se a resposta chega com o ponteiro ainda parado, entra o mesmo fluxo de "segurar e ajustar o tamanho".
- **Aceite local da resposta** (`recognition/ai/apply.ts`): forma ≠ `none`, confiança do Choice ≥ `aiThreshold` (0,70), `deliberate` ≥ 0,60 **e** encaixe local mínimo de 0,30 no tipo escolhido. O JEV nunca força uma geometria absurda (um triângulo nítido não vira "círculo").

### 11.4 Robustez (`recognition/ai/coordinator.ts`)

Um pedido por traço; no máximo 2 simultâneos; timeout de 3 s; cancelamento se o traço for apagado, movido ou desfeito; **resposta atrasada ou obsoleta é descartada em silêncio**; indicador (ponto pulsando, só se demorar > 200 ms); **disjuntor** (3 falhas seguidas pausam a IA por 60 s); proxy sem chave ou recusa determinística (401/422) desliga a IA na sessão; o desenho nunca é afetado. Conversões da IA **não** alteram os limiares aprendidos do reconhecedor local.

### 11.5 Proxy (`server/`)

A chave **nunca** vai ao navegador. O proxy aceita **apenas o formato exato do Pincel** (números em faixas plausíveis; campos extras são descartados) e monta ele mesmo a pergunta ao JEV, então a chave não serve para outra coisa. Limite por IP (40/min) usando **o IP do socket informado pelo adaptador, nunca cabeçalhos escritos pelo cliente** (`x-forwarded-for`/`cf-connecting-ip` só valem com `TRUST_PROXY=1`, atrás de um proxy seu; sem isso todos dividem um balde, seguro por padrão), teto global (600/min) que vale mesmo com IPs trocando, mapa de baldes com teto de memória, corpo ≤ 8 KB, CORS só para `ALLOWED_ORIGIN`, timeout de 2,5 s, erros separados em determinísticos (500 `upstream_invalid`, 503 `not_configured`) e transitórios (502). Usa só `Request/Response`, então roda em Node, Cloudflare Workers, Vercel/Netlify Functions e Deno com um adaptador de poucas linhas (`server/node.ts` é o do Node).

### 11.6 Como ligar

1. `cp .env.example .env.local` e preencha `TYPESAFE_API_KEY` (o `.env.local` é ignorado pelo git).
2. `npm run jev:models` lista os modelos; ajuste `JEV_MODEL` se o padrão (`jev-1.13.0`, o do projeto emprego) não existir mais.
3. `npm run jev:calibrate` roda traços rotulados no JEV real e imprime matriz de confusão, tabela de limiares (precisão × cobertura), tokens, custo e latência. Ajuste `aiThreshold` com base nela.
4. `npm run dev`: o proxy roda dentro do Vite em `/api/shape` (nenhum processo extra).
5. **Produção (VPS):** `./rebuild.sh [tag-ou-branch]` na VPS (em `~/Repos/pincel`). Ele roda typecheck e testes, faz o build com `VITE_AI_ENDPOINT=/api/shape`, publica o site por `rsync` em `/var/www/pincel.ea.tv.br` (o nginx serve do host por bind mount), recria o container `pincel_proxy` (Dockerfile + docker-compose.yml, rede `nginx-proxy-network`, sem porta publicada), valida e recarrega o nginx e faz um teste de fumaça (site, manifest, `sw.js` sem cache e `/api/shape`). A configuração de referência do nginx está em `deploy/nginx/pincel.ea.tv.br.conf`. O container exige `TRUST_PROXY=1` (já no compose) e o nginx precisa **substituir** o `X-Forwarded-For` por `$remote_addr`.

### 11.7 Próximas capacidades (mesmo desenho)

Mais formas (losango, linha, estrela): nova opção em `SHAPE_CRITERIA` + linha em `recognition/ai/shapes.ts`. **Arrumar o quadro** (Choice/Score sobre o resumo da seleção, aplicando com `beautify`) e **rabisco → diagrama** (grafo semântico) seguem o mesmo contrato (`AiProvider`, um passo no histórico, descarte de resposta obsoleta). Testar também a alternativa de enviar uma imagem pequena do traço a um modelo de visão (exige o cabeçalho de "danger zone" e custa mais) se as características não bastarem.

## 12. Testes e qualidade

- **Unitários (58):** viewport, hit-test, histórico (incluindo a tela no desfazer da importação), reconhecimento (360 traços sintéticos: 98,7% de acerto e 0% de falsos positivos ao soltar; 100% ao segurar), conectores, validação de importação (campos opcionais, ids repetidos), cache de caixas, características geométricas, coordenador da IA (concorrência, cancelamento, descarte, disjuntor), aplicação do veredito, proxy (formato do pedido ao JEV, validação, limite, erros, CORS) e pipeline completo com um JEV simulado por regra (91% de acerto nas formas e 0 falsos positivos em losango/estrela/oito; **mede o encanamento e a separabilidade das características, não a qualidade do JEV real**).
- **E2E em Chromium (29):** desenhar, conversão e desfazer em dois passos, segurar e ajustar, texto e rótulo, rabisco, conector que acompanha, persistência, exportar/importar JSON, PNG, configurações/idioma, fade ao apagar, notificação de limpar, desempenho com 1.000 formas, e o fluxo da IA com o proxy interceptado (traço ambíguo → forma em segundo plano, recusa por confiança/intenção/encaixe, resposta atrasada descartada, indicador, segurar + IA, proxy sem chave, disjuntor, IA desligada, traço aberto nunca enviado).
- **Saúde (e2e):** sem vazamento (8 ciclos completos de uso: heap estabiliza em ~4,7 MB, 308 nós e 100 listeners constantes), 0 frames de renderização quando ocioso, 5.000 objetos (redesenho ~5 ms, hover sem custo mensurável), traço de 1.800 pontos com custo por frame estável (≤ 1,3 ms).
- **PWA (1):** abre e desenha offline no build de produção.
- **Limite:** os traços sintéticos são mais limpos que traços reais; use `dev/stroke-recorder.html` para gravar ≥ 200 traços reais rotulados (incluindo os que **não** devem converter) e recalibrar os limiares.

## 13. Critérios de aceite

1. Desenhar, escrever, apagar, selecionar e mover sem tocar na toolbar. ✅
2. Desenho sem atraso perceptível (60 fps). ⚠️ ponta prevista implementada; fps ainda não medido.
3. Formas imperfeitas endireitadas em ≥ 90% com ≤ 3% de falsos positivos. ✅ nos traços sintéticos; ⏳ confirmar com traços reais.
4. Segurar parado endireita e permite ajustar o tamanho. ✅
5. Todo automatismo se desfaz com um Cmd/Ctrl+Z. ✅
6. Digitar cria texto (acentos desde o 1º caractere); digitar sobre forma cria rótulo. ✅ (teclas mortas reais ainda a testar à mão)
7. Linhas ligadas acompanham as formas. ✅
8. Quadro e configurações restaurados ao reabrir, inclusive offline. ✅
9. Exportar PNG/JSON e importar JSON. ✅
10. Temas claro e escuro legíveis. ✅
11. Metas da seção 5. ⚠️ quase todas atingidas; abertura e fps ao desenhar ainda por medir.

## 14. Decisões tomadas

Nome Pincel · interação sem modos · gatilho em dois níveis · gestos no MVP (rabisco, clicar/arrastar, rótulo, conectores) · navegação padrão trackpad · Preact via alias · CSS puro com tokens · visual minimal premium com formas à mão por padrão · fonte do sistema na UI e Caveat no quadro · cores semânticas · preenchimento, losango e PWA no MVP · seta como propriedade da linha (reconhecimento de setas depois) · limpar sem modal · aprendizado local de limiares · IndexedDB desde o início · Canvas 2D nativo (Konva descartado) · JEV na v2 recebendo dados simplificados, não imagem · sem backend na v1.

## 15. Pendências

- **Marca:** ícone e cor de acento definitivos (hoje provisórios).
- **Medir:** tempo de abertura (com e sem cache), fps ao desenhar, Safari e Firefox, pinça do trackpad no Safari (eventos de gesto), teclas mortas reais (testes automáticos usam Chromium).
- **Calibrar** limiares e tempos com ≥ 200 traços reais.
- **Decisão de produto:** linha que liga duas formas deve ganhar seta no fim automaticamente?
- **Reconhecimento de setas desenhadas** e **formas inclinadas** (v1.1).
- **Primeira chamada real ao JEV:** o formato do pedido segue a documentação, mas só foi exercitado contra o JEV simulado e contra a API real com chave falsa (401 tratado). Falta rodar `npm run jev:calibrate` com a chave real, conferir o modelo (`npm run jev:models`) e ajustar `aiThreshold`/`aiDeliberate` e os textos de `server/jev.ts`. Medir também a latência real (meta: < 300 ms até a conversão).
- **JEV e rótulos manuscritos:** descobrir se "rabisco → diagrama" consegue ler rótulos só com características/pontos (senão reabre a decisão de enviar imagem a um modelo de visão).
- **Elipses muito alongadas** têm curvas de 60–70° nas pontas; o JEV deve distingui-las de retângulos arredondados pela circularidade e pelo preenchimento da caixa. Conferir na calibração.
- **Autosave em quadros enormes:** a cópia de 5.000 objetos leva ~17 ms (em ociosidade); salvar só o que mudou se isso virar problema.
- **Atualização do PWA:** a página recarrega sozinha ao sair versão nova (pode perder até 1 s de edição); avaliar aviso em vez de recarga automática.
