# Reflexão: Retrato da Voz

A IDEIA
Quis explorar a relação entre voz e forma. Em vez de um visualizador que apenas reage ao som, pensei num artefacto que acumula e expande: a voz vai desenhando uma figura própria, e essa figura é o registo de como a pessoa falou. Cada momento da voz deixa um módulo (um retângulo) com as características desse momento, e os módulos ligam-se entre si por fios, formando uma rede orgânica sem forma fixa. O rato permite uma segunda forma de interação: atrai os módulos e, com clique, afasta-os, de modo que o utilizador também “mexa” na figura com o corpo.


APLICAÇÃO DO FRAMEWORK E DOS INGREDIENTES
Input: microfone (volume, tom e espectro) e rato (posição e clique).
Referência / Expressão: formas modulares geométricas ligadas por fios, com vários modos de simetria (espelhos e radial), crescimento orgânico e movimento.
Output: instalação/experiência interativa em p5.js que gera uma figura única por pessoa, exportável em PNG.

Como a voz controla a forma:
O volume define o tamanho dos módulos, a velocidade a que a figura cresce e o alcance dos fios.
O tom (grave ou agudo) define a cor (quente para grave, fria para agudo), a proporção dos retângulos (largos para grave, altos e finos para agudo) e para que lado a figura curva.
O espectro (timbre) liga cada módulo a uma zona de frequência, e o módulo vibra quando essa frequência volta a soar.
O silêncio pára o crescimento, e a figura mantém-se.

Como interagir com o artefacto:
Voz: é o que desenha. Ao falar ou gritar, uma “ponta de desenho” (o pequeno círculo) percorre o ecrã e deixa módulos atrás de si. Variar o tom e o volume faz a figura curvar, crescer e mudar de cor e de proporção.
Rato (movimento): sem clicar, os módulos próximos são atraídos pelo cursor e ligam-se a ele por fios brancos.
Rato (clique): o primeiro clique ativa o microfone (o browser exige esse gesto). A partir daí, clicar e manter o clique afasta os módulos próximos, como um empurrão.
Tecla M: muda o tipo de simetria, percorrendo quatro modos: sem simetria, espelho (esquerda/direita), quatro espelhos (esquerda/direita e cima/baixo) e radial ×6 (a figura repete-se seis vezes à volta do centro, como uma mandala). Cada mudança começa uma figura nova, e o modo atual aparece escrito no ecrã.
Tecla R: recomeça uma figura nova, mantendo o modo de simetria escolhido.
Tecla S: guarda a figura atual em PNG, para usar como grafismo ou textura.


DIFICULDADES E DECISÕES
Uma das primeiras versões fazia a figura seguir sempre a mesma direção e os retangulos amontoavam-se nas margens, ficavam presos nas paredes sem que a forma alastrasse para o resto da tela. Resolvi com calibração automática do tom, ressalto nas margens e uma escolha de posições que evita zonas já ocupadas.
O p5.sound na versão que o projeto carrega tem uma API diferente da documentação que conhecia, por isso usei a Web Audio API diretamente, que é a tecnologia que o p5.sound usa por baixo.

USO DE IA
A estrutura base do código foi gerada com assistência do Claude, em conversa iterativa. Eu defini o conceito, testei o resultado, identifiquei problemas (como a figura a ficar presa numa linha) e pedi alterações. Estudei o código para perceber como cada bloco e função afeta a composição.


O QUE CADA TERMO FAZ NO CÓDIGO:
Estrutura do p5.js
-> setup(): corre uma vez no início. Cria o canvas e a figura inicial.
-> draw(): corre cerca de 60 vezes por segundo. É o ciclo de animação: lê os inputs, atualiza o estado e desenha.
-> colorMode(HSB): define as cores por matiz, saturação e brilho. Facilita mapear o tom da voz a uma cor (o matiz).
-> mousePressed(), keyPressed(): funções que o p5 chama quando há clique ou tecla.

Programação
-> Classe (class Node): um molde para criar objetos. Cada quadrado é uma instância, com a sua posição, cor, tamanho e rotação.
-> Array (nodes): a lista onde guardo todos os quadrados.
-> Vetor (createVector, p5.Vector): um par (x, y) com operações matemáticas, usado para posições e forças.
-> map(valor, a, b, c, d): converte um valor de uma escala para outra. É a ferramenta principal do mapeamento voz forma (por exemplo, tom 0–1 para cor 10–290).
-> lerp(a, b, t): aproxima um valor de outro de forma gradual. Uso-o para suavizar o som e evitar tremores.
-> constrain(valor, min, max): limita um valor a um intervalo.
-> random() / randomGaussian(): números aleatórios. O gaussiano concentra os valores perto de uma média, o que dá aglomerados orgânicos em vez de uma distribuição uniforme.
-> noise(): aleatoriedade suave (ruído de Perlin). Varia gradualmente, por isso serve para movimentos naturais, como a deriva dos quadrados e a ondulação da trajetória.

Áudio
-> Web Audio API / AnalyserNode: a ferramenta do browser que analisa o som do microfone em tempo real.
-> getUserMedia: o pedido de permissão para aceder ao microfone.
-> RMS (volume): medida do volume que calcula a média quadrática do sinal. Dá um valor estável entre 0 e cerca de 0,5.
-> FFT (Fast Fourier Transform): algoritmo que decompõe o som nas frequências que o compõem. Passamos de “quanto volume” para “quanta energia há em cada grave/agudo”.
-> Espectro: o resultado da FFT, a energia em cada frequência. Divido-o em 16 bandas para cada quadrado reagir a uma zona.
-> Centroide espectral: a frequência “média” do som, ponderada pela energia. É uma boa medida do tom ou brilho: valores baixos para sons graves, altos para sons agudos.
-> Limiar (THRESHOLD): volume mínimo para a figura crescer. Evita que o ruído de fundo desenhe.
-> Calibração automática: o programa aprende o intervalo de tons de cada pessoa (pitchLo, pitchHi) e normaliza o tom entre 0 e 1 (pn). Assim, qualquer voz usa a gama completa de cores.

Movimento e física
-> Mola (força para a posição “casa”): puxa cada quadrado de volta ao local onde nasceu, o que dá a “memória” da forma.
-> Velocidade e atrito: a força altera a velocidade, e a velocidade altera a posição. O atrito (vel.mult(0.88)) faz o movimento amortecer em vez de oscilar para sempre.
-> Ponta de desenho (head) e direção (heading): um ponto invisível que a voz conduz pelo ecrã e que vai deixando quadrados. O tom faz a direção curvar e o volume define o passo.
-> Ressalto: quando a ponta chega à margem, inverte a direção (como uma bola), em vez de ficar presa.

Composição
-> Simetria: cada quadrado criado ganha “gémeos” espelhados ou rodados (symmetric()), o que dá à figura um aspeto de criatura ou mandala.
-> bestSpot(): testa 8 posições candidatas e escolhe a mais afastada dos quadrados existentes, para a figura ocupar o espaço em vez de se amontoar.
-> Ramos (BRANCH_CHANCE): por vezes nasce um quadrado a partir de um existente, como o crescimento de um coral.
-> Fios (ciclo duplo): comparo todos os pares de quadrados, e se a distância for menor que linkDist, desenho uma linha. Quanto mais perto, mais forte é o fio. O volume aumenta o alcance.
-> MAX_NODES: limite de quadrados. Quando é ultrapassado, os mais antigos desaparecem, e a figura renova-se.