// RETRATO DA VOZ
// A voz constrói uma figura própria, quadrado a quadrado, ligada por fios.
//
// Inputs: microfone (volume, tom/centroide, espectro) + rato (atrair / repelir)
// Expressão: figura modular de retângulos ligados por fios, com memória
//
// Controlos:
//   clique  = ativar microfone (depois: repele os quadrados)
//   rato    = atrai os quadrados próximos
//   M       = mudar o tipo de simetria
//   S       = guardar PNG
//   R       = recomeçar uma figura nova
 
// ======================================================================
// ---------- ÁUDIO (Web Audio API) ----------
// Esta secção trata de tudo o que tem a ver com o microfone.
// Usei a Web Audio API do browser (a tecnologia que o p5.sound usa por baixo).
// ======================================================================
 
let audioCtx, analyser, freqData, timeData;  // audioCtx = "motor" de áudio | analyser = analisador de som | freqData = frequências | timeData = onda sonora
let started = false;    // diz se o microfone já foi ativado (só depois do 1º clique)
let micError = false;   // fica true se o utilizador recusar o microfone
 
// Pede acesso ao microfone e liga o analisador. "async/await" porque o browser demora a responder.
async function startAudio() {
  try {
    // pede permissão ao utilizador para usar o microfone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // cria o "motor" de áudio do browser
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // alguns browsers deixam o áudio "em pausa" até haver interação; isto desbloqueia-o
    await audioCtx.resume();
    // transforma o microfone numa fonte de som que o analisador consegue ler
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;                 // 512 bins de frequência (o FFT divide o som em 512 faixas)
    analyser.smoothingTimeConstant = 0.8;    // suaviza a análise entre frames (menos tremor)
    source.connect(analyser);                // sem ligar às colunas: sem feedback
    freqData = new Uint8Array(analyser.frequencyBinCount);  // lista onde vai ficar a energia de cada frequência (0-255)
    timeData = new Uint8Array(analyser.fftSize);            // lista onde vai ficar a forma da onda sonora
    started = true;                          // a partir daqui o draw() já pode ler o som
  } catch (e) {
    // se o utilizador recusar, ou não houver microfone, mostramos uma mensagem no ecrã
    console.error("Erro ao aceder ao microfone:", e);
    micError = true;
  }
}
 
// Volume (RMS) -> devolve um valor entre 0 (silêncio) e ~0.5 (muito alto)
function getLevel() {
  analyser.getByteTimeDomainData(timeData);  // lê a forma da onda sonora neste instante
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    let v = (timeData[i] - 128) / 128;       // converte 0-255 para -1..1 (128 = silêncio)
    sum += v * v;                            // soma os quadrados (assim valores negativos também contam)
  }
  return sqrt(sum / timeData.length);        // raiz da média dos quadrados = RMS = volume
}
 
// Centroide espectral em Hz: o "tom" médio do som (grave vs agudo)
function getCentroid() {
  const binHz = audioCtx.sampleRate / analyser.fftSize;  // quantos Hz tem cada faixa do espectro
  let weighted = 0, total = 0;
  for (let i = 1; i < freqData.length; i++) {
    weighted += i * binHz * freqData[i];     // frequência da faixa x energia dessa faixa
    total += freqData[i];                    // energia total
  }
  // média ponderada: onde está o "centro de gravidade" do som. Se há silêncio devolve 1000 por defeito.
  return total > 0 ? weighted / total : 1000;
}
 
// Espectro dividido em BANDS zonas (80 Hz a 4 kHz), cada uma entre 0 e 1
// (80 Hz - 4 kHz é a zona onde está quase toda a energia da voz humana)
function getBands() {
  const binHz = audioCtx.sampleRate / analyser.fftSize;
  const startBin = ceil(80 / binHz);         // faixa correspondente a 80 Hz
  const endBin = floor(4000 / binHz);        // faixa correspondente a 4000 Hz
  let out = [];
  for (let b = 0; b < BANDS; b++) {
    // cada banda agrupa várias faixas vizinhas do espectro
    let from = floor(map(b, 0, BANDS, startBin, endBin));
    let to = max(from + 1, floor(map(b + 1, 0, BANDS, startBin, endBin)));
    let sum = 0;
    for (let k = from; k < to; k++) sum += freqData[k];
    out.push(sum / (to - from) / 255);       // média da banda, normalizada para 0..1
  }
  return out;
}
 
// ======================================================================
// ---------- PARÂMETROS (para experimentares) ----------
// Valores fixos que posso mudar para alterar o comportamento da figura.
// ======================================================================
const BANDS = 16;           // zonas de frequência (cada quadrado reage a uma destas zonas)
const MAX_NODES = 500;      // quando passa, os mais antigos desaparecem (limita o peso e renova a figura)
const THRESHOLD = 0.03;     // volume mínimo para a voz "desenhar" (abaixo disto é ruído de fundo)
const SPAWN_EVERY = 3;      // nasce um grupo de quadrados a cada N frames de voz (maior = figura cresce mais devagar)
const LINK_BASE = 100;      // alcance base dos fios (distância máxima para dois quadrados se ligarem)
const MOUSE_RADIUS = 170;   // raio de influência do rato (px) à volta do cursor
const MARGIN = 0.06;        // margem do ecrã (fração) onde a ponta "ressalta"
const BRANCH_CHANCE = 0.15; // probabilidade de nascer um ramo a partir de um quadrado existente
 
// ======================================================================
// ---------- ESTADO ----------
// Variáveis que mudam ao longo do tempo (a "memória" do programa).
// ======================================================================
let nodes = [];             // lista de todos os quadrados da figura
let head;                   // posição da "ponta de desenho" (o ponto que a voz conduz pelo ecrã)
let heading = 0;            // direção em que a ponta está a andar (radianos)
let symMode = 2;            // 0 nenhuma | 1 espelho | 2 quatro espelhos | 3 radial x6
const SYM_NAMES = ["sem simetria", "espelho", "4 espelhos", "radial ×6"];  // nomes mostrados no ecrã
let smoothLevel = 0;        // volume suavizado (evita saltos bruscos)
let smoothPitch = 900;      // tom em Hz (suavizado)
let pitchLo = 400;          // limites do tom da pessoa, calibrados automaticamente
let pitchHi = 1600;
let pn = 0.5;               // tom normalizado 0 (o mais grave desta voz) .. 1 (o mais agudo)
let bands = [];             // energia atual de cada uma das 16 zonas de frequência
 
// ======================================================================
// ---------- SIMETRIA ----------
// ======================================================================
 
// Dado um ponto, devolve o ponto e os seus "gémeos" conforme o modo de simetria
function symmetric(x, y) {
  const cx = width / 2, cy = height / 2;   // centro do ecrã
  let pts = [];                            // lista de pontos que vamos devolver
  if (symMode === 0) {
    // sem simetria: só o ponto original
    pts.push({ x, y, flip: false, rot: 0 });
  } else if (symMode === 1) {
    // espelho esquerda/direita: o gémeo fica a "width - x" (refletido na horizontal)
    pts.push({ x, y, flip: false, rot: 0 });
    pts.push({ x: width - x, y, flip: true, rot: 0 });
  } else if (symMode === 2) {
    // quatro espelhos: reflete na horizontal e na vertical (4 pontos no total)
    pts.push({ x, y, flip: false, rot: 0 });
    pts.push({ x: width - x, y, flip: true, rot: 0 });
    pts.push({ x, y: height - y, flip: true, rot: 0 });
    pts.push({ x: width - x, y: height - y, flip: false, rot: 0 });
  } else {
    // radial x6: roda o ponto 6 vezes à volta do centro (efeito mandala)
    let dx = x - cx, dy = y - cy;          // posição relativa ao centro
    for (let k = 0; k < 6; k++) {
      let a = (k * TWO_PI) / 6;            // ângulo de cada cópia (60 graus de intervalo)
      // fórmulas de rotação de um ponto à volta do centro
      let rx = dx * cos(a) - dy * sin(a);
      let ry = dx * sin(a) + dy * cos(a);
      pts.push({ x: cx + rx, y: cy + ry, flip: false, rot: a });  // "rot" faz o próprio retângulo rodar também
    }
  }
  // ignora gémeos que caiam fora do ecrã
  return pts.filter(p => p.x > 0 && p.x < width && p.y > 0 && p.y < height);
}
 
// Escolhe, entre vários candidatos perto de (cx, cy), o que está mais longe dos quadrados
// existentes. Isto espalha a figura em vez de a amontoar num ponto.
function bestSpot(cx, cy, radius) {
  let best = { x: cx, y: cy };   // melhor posição encontrada até agora
  let bestDist = -1;             // distância dessa posição ao quadrado mais próximo
  for (let t = 0; t < 8; t++) {  // testa 8 candidatos aleatórios
    // candidato aleatório perto do ponto pedido, sempre dentro das margens do ecrã
    let x = constrain(cx + random(-radius, radius), width * MARGIN, width * (1 - MARGIN));
    let y = constrain(cy + random(-radius, radius), height * MARGIN, height * (1 - MARGIN));
    let minD = Infinity;
    // procura o quadrado existente mais perto deste candidato
    for (let n of nodes) {
      let d = (n.home.x - x) * (n.home.x - x) + (n.home.y - y) * (n.home.y - y);  // distância ao quadrado (mais rápido que sqrt)
      if (d < minD) minD = d;
    }
    // fica com o candidato que tem o vizinho mais afastado (= zona mais vazia)
    if (minD > bestDist) {
      bestDist = minD;
      best = { x, y };
    }
  }
  return best;
}
 
// ======================================================================
// ---------- CLASSE: cada quadrado nasce de um momento da voz ----------
// Uma classe é um "molde": cada retângulo da figura é um objeto criado a partir dele.
// ======================================================================
class Node {
  // O constructor corre uma vez, quando o quadrado nasce, e guarda as características desse momento da voz
  constructor(x, y, tone, hz, level, flip, rotOffset) {
    this.home = createVector(x, y);         // posição "memória": fica onde nasceu
    this.pos = this.home.copy();            // posição atual (pode afastar-se da "casa" por causa do rato)
    this.vel = createVector(0, 0);          // velocidade atual (começa parado)
 
    // O TOM (relativo à voz da pessoa) define a cor e a proporção
    this.hue = map(tone, 0, 1, 10, 290);        // grave quente, agudo frio
    let stretch = map(tone, 0, 1, 1.9, 0.5);    // grave = largo, agudo = alto e fino
    // a banda de frequência em que o quadrado vai "vibrar" no futuro
    this.band = floor(map(hz, 80, 4000, 0, BANDS - 1, true));
 
    // O VOLUME define o tamanho
    let base = map(level, THRESHOLD, 0.3, 8, 30, true);
    this.w0 = base * stretch;               // largura base
    this.h0 = base / stretch;               // altura base (inversa da largura: mantém área parecida)
 
    let s = flip ? -1 : 1;                  // se for um gémeo espelhado, inverte o sentido da rotação
    this.rot = random(-0.4, 0.4) * s + rotOffset;   // ângulo inicial (pequena variação aleatória + rotação da simetria)
    this.rotSpeed = random(-0.008, 0.008) * s;      // velocidade com que roda lentamente
 
    this.seed = random(1000);               // número único deste quadrado, usado no noise() para ter movimento próprio
    this.birth = frameCount;                // frame em que nasceu (serve para a animação de crescimento)
  }
 
  // Atualiza o movimento do quadrado em cada frame
  update(level) {
    // 1) deriva suave à volta da posição memória
    // noise() dá valores suaves (0..1); subtrair 0.5 centra-os em torno de 0 e mult(30) define a amplitude em px
    let drift = createVector(
      noise(this.seed, frameCount * 0.005) - 0.5,
      noise(this.seed + 100, frameCount * 0.005) - 0.5
    ).mult(30);
    let target = p5.Vector.add(this.home, drift);   // o quadrado tenta ir para "casa + deriva"
 
    // 2) mola para o alvo
    // quanto mais longe do alvo, maior a força de regresso (0.03 = rigidez da mola)
    let force = p5.Vector.sub(target, this.pos).mult(0.03);
 
    // 3) RATO: atrai (sem clique) ou repele (com clique)
    let m = createVector(mouseX, mouseY);           // posição do rato
    let d = p5.Vector.dist(this.pos, m);            // distância do quadrado ao rato
    if (d < MOUSE_RADIUS) {                         // só afeta quadrados dentro do raio do rato
      let strength = 1 - d / MOUSE_RADIUS;          // 1 = muito perto, 0 = no limite do raio
      if (mouseIsPressed) {
        // com clique: força na direção contrária ao rato (empurra)
        force.add(p5.Vector.sub(this.pos, m).normalize().mult(strength * 5));
      } else {
        // sem clique: força na direção do rato (atrai, de forma mais suave)
        force.add(p5.Vector.sub(m, this.pos).mult(0.012 * strength));
      }
    }
 
    // 4) física: aceleração -> velocidade -> posição (com atrito)
    this.vel.add(force);        // a força altera a velocidade
    this.vel.mult(0.88);        // atrito: perde 12% da velocidade por frame (o movimento amortece)
    this.pos.add(this.vel);     // a velocidade altera a posição
 
    this.rot += this.rotSpeed + level * 0.08;   // roda lentamente; a voz faz rodar mais depressa
  }
 
  // Desenha o quadrado no ecrã
  show() {
    // cresce suavemente nos primeiros 20 frames
    let age = constrain((frameCount - this.birth) / 20, 0, 1);   // 0 = acabou de nascer, 1 = já adulto
    let grow = age * age * (3 - 2 * age);                        // "smoothstep": começa e acaba devagar (suaviza a animação)
 
    // cada quadrado "vibra" quando a sua frequência de nascimento volta a soar
    let bandValue = bands[this.band] || 0;                       // energia atual da banda deste quadrado (0 se ainda não há áudio)
    let pulse = 1 + bandValue * 1.8 + smoothLevel * 1.5;         // fator de escala: cresce com a banda e com o volume geral
 
    push();                                // guarda o estado do desenho (para as transformações não afetarem os outros)
    translate(this.pos.x, this.pos.y);     // move a origem para o centro do quadrado
    rotate(this.rot);                      // roda o sistema de coordenadas
    rectMode(CENTER);                      // o retângulo é desenhado a partir do seu centro
    stroke(this.hue, 60, 100, 90);         // contorno com a cor do tom em que nasceu
    strokeWeight(1.5);
    fill(this.hue, 70, 100, 12);           // preenchimento muito transparente da mesma cor
    rect(0, 0, this.w0 * pulse * grow, this.h0 * pulse * grow);   // tamanho final = base x pulsação x crescimento
    pop();                                 // repõe o estado de desenho
  }
}
 
// ======================================================================
// ---------- SETUP ----------
// Corre uma única vez no início.
// ======================================================================
function setup() {
  createCanvas(windowWidth, windowHeight);   // canvas do tamanho da janela
  colorMode(HSB, 360, 100, 100, 100);        // cores em Matiz (0-360), Saturação, Brilho e Transparência
  resetFigure();                             // cria a figura inicial
}
 
// Apaga tudo e começa uma figura nova
function resetFigure() {
  nodes = [];                                // esvazia a lista de quadrados
  // a ponta de desenho começa perto do centro, com pequena variação
  head = createVector(width / 2 + random(-80, 80), height / 2 + random(-80, 80));
  heading = random(TWO_PI);                  // direção inicial aleatória
  // algumas sementes para o ecrã não começar vazio
  for (let i = 0; i < 8; i++) {
    let t = random();                        // tom aleatório 0..1 para cada semente
    // randomGaussian agrupa as sementes perto do centro; symmetric() cria também os gémeos
    for (let p of symmetric(width / 2 + randomGaussian(0, 50), height / 2 + randomGaussian(0, 50))) {
      nodes.push(new Node(p.x, p.y, t, map(t, 0, 1, 250, 2200), 0.08, p.flip, p.rot));
    }
  }
}
 
// ======================================================================
// ---------- A VOZ DESENHA ----------
// Só corre quando há voz acima do limiar. Move a "ponta" e cria novos quadrados.
// ======================================================================
function drawWithVoice(level) {
  // 1) A ponta curva conforme o tom (relativo à voz da pessoa) e um pouco de noise.
  //    Tom agudo curva para um lado, tom grave para o outro, tom médio segue em frente.
  let turn = (pn - 0.5) * 0.35 * (0.4 + level * 4);   // (pn - 0.5) dá sinal: negativo = grave, positivo = agudo; o volume aumenta a curva
  turn += (noise(frameCount * 0.01) - 0.5) * 0.18;     // ondulação suave aleatória para o caminho não ser demasiado previsível
  heading += turn;                                      // atualiza a direção
 
  // 2) O volume define o passo
  let step = 5 + level * 70;                  // mais volume = a ponta avança mais depressa
  head.x += cos(heading) * step;              // cos/sin transformam direção + distância em movimento x/y
  head.y += sin(heading) * step;
 
  // 3) Nas margens a ponta ressalta em vez de ficar presa
  let mx = width * MARGIN, my = height * MARGIN;   // margens em pixels
  if (head.x < mx || head.x > width - mx) {
    heading = PI - heading;                   // inverte a componente horizontal da direção (como uma bola numa parede)
    head.x = constrain(head.x, mx, width - mx);
  }
  if (head.y < my || head.y > height - my) {
    heading = -heading;                       // inverte a componente vertical da direção
    head.y = constrain(head.y, my, height - my);
  }
 
  // 4) Nasce um grupo de quadrados (o original + os gémeos da simetria)
  if (frameCount % SPAWN_EVERY === 0) {       // só de N em N frames (controla a velocidade de crescimento)
    // procura um sítio livre perto da ponta; com mais volume, procura mais longe
    let spot = bestSpot(head.x, head.y, 30 + level * 150);
    for (let p of symmetric(spot.x, spot.y)) {
      // cada quadrado guarda o tom, o tom em Hz e o volume deste momento
      nodes.push(new Node(p.x, p.y, pn, smoothPitch, level, p.flip, p.rot));
    }
 
    // às vezes nasce um ramo a partir de um quadrado recente (cresce como um coral)
    if (random() < BRANCH_CHANCE && nodes.length > 30) {
      // escolhe um quadrado entre os últimos 80 criados
      let src = nodes[floor(random(max(0, nodes.length - 80), nodes.length))];
      let a = random(TWO_PI);                 // direção aleatória do ramo
      let dist2 = random(50, 120);            // distância do ramo ao quadrado de origem
      let b = bestSpot(src.home.x + cos(a) * dist2, src.home.y + sin(a) * dist2, 40);
      for (let p of symmetric(b.x, b.y)) {
        nodes.push(new Node(p.x, p.y, pn, smoothPitch, level, p.flip, p.rot));
      }
    }
 
    while (nodes.length > MAX_NODES) nodes.shift();   // esquece os mais antigos (shift remove o primeiro da lista)
  }
}
 
// ======================================================================
// ---------- DRAW ----------
// Corre ~60 vezes por segundo: lê o som, atualiza a figura e desenha tudo.
// ======================================================================
function draw() {
  background(235, 40, 7);   // fundo azul-escuro; redesenhar o fundo apaga o frame anterior
 
  // --- INPUT: som ---
  let level = 0;            // por defeito, sem som
  if (started) {
    analyser.getByteFrequencyData(freqData);          // atualiza a lista de frequências com o som deste instante
    smoothLevel = lerp(smoothLevel, getLevel(), 0.25);   // aproxima o volume suavizado do volume real (25% por frame)
    level = smoothLevel;
    bands = getBands();                               // recalcula a energia das 16 zonas
 
    if (level > THRESHOLD) {                          // só reage quando há voz
      // só atualizamos o tom enquanto há voz (no silêncio o centroide é ruído)
      smoothPitch = lerp(smoothPitch, constrain(getCentroid(), 150, 4000), 0.15);
 
      // CALIBRAÇÃO AUTOMÁTICA: aprende o intervalo de tons desta voz, para que
      // qualquer pessoa use a gama completa de cores e direções
      // se o tom for mais grave que o mínimo conhecido, passa a ser o novo mínimo; senão o mínimo sobe lentamente
      if (smoothPitch < pitchLo) pitchLo = smoothPitch; else pitchLo = lerp(pitchLo, smoothPitch, 0.003);
      // o mesmo para o máximo (agudo)
      if (smoothPitch > pitchHi) pitchHi = smoothPitch; else pitchHi = lerp(pitchHi, smoothPitch, 0.003);
      let span = max(pitchHi - pitchLo, 250);         // amplitude mínima de 250 Hz para evitar divisões por valores minúsculos
      pn = constrain((smoothPitch - pitchLo) / span, 0, 1);   // tom normalizado: 0 = mais grave desta voz, 1 = mais agudo
 
      drawWithVoice(level);                           // a voz desenha: move a ponta e cria quadrados
    }
  } else {
    smoothLevel = 0;                                  // sem microfone, o volume é zero
  }
 
  // --- atualizar ---
  for (let n of nodes) n.update(level);               // calcula o novo movimento de cada quadrado
 
  // --- FIOS entre quadrados próximos ---
  let linkDist = LINK_BASE + level * 300;   // a voz alarga o alcance dos fios
  let linkDist2 = linkDist * linkDist;      // distância ao quadrado (comparar quadrados evita calcular a raiz em todos os pares)
  for (let i = 0; i < nodes.length; i++) {
    let a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {   // j = i+1 para cada par ser comparado só uma vez
      let b = nodes[j];
      let dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y;
      let d2 = dx * dx + dy * dy;                  // distância ao quadrado entre os dois quadrados
      if (d2 < linkDist2) {                        // se estão suficientemente perto, liga-os
        let d = sqrt(d2);                          // só calcula a raiz quando é mesmo preciso
        stroke(a.hue, 50, 100, map(d, 0, linkDist, 70, 0));   // fio mais transparente quanto mais longe
        strokeWeight(map(d, 0, linkDist, 1.5, 0.2));          // e mais fino quanto mais longe
        line(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
      }
    }
  }
 
  // --- FIOS do rato ---
  for (let n of nodes) {
    let d = dist(mouseX, mouseY, n.pos.x, n.pos.y);
    if (d < MOUSE_RADIUS) {                        // liga o cursor aos quadrados dentro do seu raio
      stroke(0, 0, 100, map(d, 0, MOUSE_RADIUS, 70, 0));   // fios brancos que desvanecem com a distância
      strokeWeight(1);
      line(mouseX, mouseY, n.pos.x, n.pos.y);
    }
  }
 
  // --- quadrados ---
  for (let n of nodes) n.show();   // desenha os quadrados por cima dos fios
 
  // --- ponta de desenho (feedback visual de onde a voz está a "pintar") ---
  if (started) {
    noFill();
    stroke(0, 0, 100, 50);
    strokeWeight(1);
    // um círculo em cada ponto simétrico; o diâmetro cresce com o volume
    for (let p of symmetric(head.x, head.y)) circle(p.x, p.y, 8 + level * 60);
  }
 
  // --- mensagens ---
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  if (!started) {
    // antes de ativar o microfone: instruções (ou aviso de erro)
    fill(0, 0, 90, 80);
    text(
      micError
        ? "Não foi possível aceder ao microfone (verifica as permissões). O rato continua a funcionar."
        : "Clica para ativar o microfone e fala. Varia o tom e o volume para desenhar.",
      width / 2, height - 36
    );
  } else {
    // depois: mostra o modo de simetria atual e as teclas disponíveis
    fill(0, 0, 90, 40);
    text("M simetria: " + SYM_NAMES[symMode] + "  ·  R recomeçar  ·  S guardar", width / 2, height - 24);
  }
}
 
// ======================================================================
// ---------- EVENTOS ----------
// O p5 chama estas funções automaticamente quando há clique, tecla ou redimensionamento.
// ======================================================================
function mousePressed() {
  // o primeiro clique ativa o microfone (os browsers exigem um gesto do utilizador)
  if (!started && !micError) startAudio();
}
 
function keyPressed() {
  if (key === 's' || key === 'S') saveCanvas('retrato-da-voz', 'png');   // S: guarda a imagem
  if (key === 'r' || key === 'R') resetFigure();                          // R: recomeça a figura
  if (key === 'm' || key === 'M') {
    symMode = (symMode + 1) % SYM_NAMES.length;   // M: passa ao modo seguinte (o % volta ao 0 depois do último)
    resetFigure();                                // recomeça para não misturar simetrias diferentes
  }
}
 
// Se a janela mudar de tamanho, ajusta o canvas e recomeça a figura (as posições dependem do tamanho)
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resetFigure();
}
 