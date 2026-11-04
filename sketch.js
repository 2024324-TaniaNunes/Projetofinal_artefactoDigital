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
 
// ---------- ÁUDIO (Web Audio API) ----------
let audioCtx, analyser, freqData, timeData;
let started = false;
let micError = false;
 
async function startAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;                 // 512 bins de frequência
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);                // sem ligar às colunas: sem feedback
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    started = true;
  } catch (e) {
    console.error("Erro ao aceder ao microfone:", e);
    micError = true;
  }
}
 
// Volume (RMS)
function getLevel() {
  analyser.getByteTimeDomainData(timeData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    let v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  return sqrt(sum / timeData.length);
}
 
// Centroide espectral em Hz: o "tom" médio do som (grave vs agudo)
function getCentroid() {
  const binHz = audioCtx.sampleRate / analyser.fftSize;
  let weighted = 0, total = 0;
  for (let i = 1; i < freqData.length; i++) {
    weighted += i * binHz * freqData[i];
    total += freqData[i];
  }
  return total > 0 ? weighted / total : 1000;
}
 
// Espectro dividido em BANDS zonas (80 Hz a 4 kHz), cada uma entre 0 e 1
function getBands() {
  const binHz = audioCtx.sampleRate / analyser.fftSize;
  const startBin = ceil(80 / binHz);
  const endBin = floor(4000 / binHz);
  let out = [];
  for (let b = 0; b < BANDS; b++) {
    let from = floor(map(b, 0, BANDS, startBin, endBin));
    let to = max(from + 1, floor(map(b + 1, 0, BANDS, startBin, endBin)));
    let sum = 0;
    for (let k = from; k < to; k++) sum += freqData[k];
    out.push(sum / (to - from) / 255);
  }
  return out;
}
 
// ---------- PARÂMETROS (para experimentares) ----------
const BANDS = 16;           // zonas de frequência
const MAX_NODES = 500;      // quando passa, os mais antigos desaparecem
const THRESHOLD = 0.03;     // volume mínimo para a voz "desenhar"
const SPAWN_EVERY = 3;      // nasce um grupo de quadrados a cada N frames de voz
const LINK_BASE = 100;      // alcance base dos fios
const MOUSE_RADIUS = 170;
const MARGIN = 0.06;        // margem do ecrã (fração) onde a ponta "ressalta"
const BRANCH_CHANCE = 0.15; // probabilidade de nascer um ramo a partir de um quadrado existente
 
// ---------- ESTADO ----------
let nodes = [];
let head;                   // posição da "ponta de desenho"
let heading = 0;            // direção em que a ponta está a andar (radianos)
let symMode = 2;            // 0 nenhuma | 1 espelho | 2 quatro espelhos | 3 radial x6
const SYM_NAMES = ["sem simetria", "espelho", "4 espelhos", "radial ×6"];
let smoothLevel = 0;
let smoothPitch = 900;      // tom em Hz (suavizado)
let pitchLo = 400;          // limites do tom da pessoa, calibrados automaticamente
let pitchHi = 1600;
let pn = 0.5;               // tom normalizado 0 (o mais grave desta voz) .. 1 (o mais agudo)
let bands = [];
 
// ---------- SIMETRIA ----------
// Dado um ponto, devolve o ponto e os seus "gémeos" conforme o modo de simetria
function symmetric(x, y) {
  const cx = width / 2, cy = height / 2;
  let pts = [];
  if (symMode === 0) {
    pts.push({ x, y, flip: false, rot: 0 });
  } else if (symMode === 1) {
    pts.push({ x, y, flip: false, rot: 0 });
    pts.push({ x: width - x, y, flip: true, rot: 0 });
  } else if (symMode === 2) {
    pts.push({ x, y, flip: false, rot: 0 });
    pts.push({ x: width - x, y, flip: true, rot: 0 });
    pts.push({ x, y: height - y, flip: true, rot: 0 });
    pts.push({ x: width - x, y: height - y, flip: false, rot: 0 });
  } else {
    let dx = x - cx, dy = y - cy;
    for (let k = 0; k < 6; k++) {
      let a = (k * TWO_PI) / 6;
      let rx = dx * cos(a) - dy * sin(a);
      let ry = dx * sin(a) + dy * cos(a);
      pts.push({ x: cx + rx, y: cy + ry, flip: false, rot: a });
    }
  }
  // ignora gémeos que caiam fora do ecrã
  return pts.filter(p => p.x > 0 && p.x < width && p.y > 0 && p.y < height);
}
 
// Escolhe, entre vários candidatos perto de (cx, cy), o que está mais longe dos quadrados
// existentes. Isto espalha a figura em vez de a amontoar num ponto.
function bestSpot(cx, cy, radius) {
  let best = { x: cx, y: cy };
  let bestDist = -1;
  for (let t = 0; t < 8; t++) {
    let x = constrain(cx + random(-radius, radius), width * MARGIN, width * (1 - MARGIN));
    let y = constrain(cy + random(-radius, radius), height * MARGIN, height * (1 - MARGIN));
    let minD = Infinity;
    for (let n of nodes) {
      let d = (n.home.x - x) * (n.home.x - x) + (n.home.y - y) * (n.home.y - y);
      if (d < minD) minD = d;
    }
    if (minD > bestDist) {
      bestDist = minD;
      best = { x, y };
    }
  }
  return best;
}
 
// ---------- CLASSE: cada quadrado nasce de um momento da voz ----------
class Node {
  constructor(x, y, tone, hz, level, flip, rotOffset) {
    this.home = createVector(x, y);         // posição "memória": fica onde nasceu
    this.pos = this.home.copy();
    this.vel = createVector(0, 0);
 
    // O TOM (relativo à voz da pessoa) define a cor e a proporção
    this.hue = map(tone, 0, 1, 10, 290);        // grave quente, agudo frio
    let stretch = map(tone, 0, 1, 1.9, 0.5);    // grave = largo, agudo = alto e fino
    // a banda de frequência em que o quadrado vai "vibrar" no futuro
    this.band = floor(map(hz, 80, 4000, 0, BANDS - 1, true));
 
    // O VOLUME define o tamanho
    let base = map(level, THRESHOLD, 0.3, 8, 30, true);
    this.w0 = base * stretch;
    this.h0 = base / stretch;
 
    let s = flip ? -1 : 1;
    this.rot = random(-0.4, 0.4) * s + rotOffset;
    this.rotSpeed = random(-0.008, 0.008) * s;
 
    this.seed = random(1000);
    this.birth = frameCount;
  }
 
  update(level) {
    // 1) deriva suave à volta da posição memória
    let drift = createVector(
      noise(this.seed, frameCount * 0.005) - 0.5,
      noise(this.seed + 100, frameCount * 0.005) - 0.5
    ).mult(30);
    let target = p5.Vector.add(this.home, drift);
 
    // 2) mola para o alvo
    let force = p5.Vector.sub(target, this.pos).mult(0.03);
 
    // 3) RATO: atrai (sem clique) ou repele (com clique)
    let m = createVector(mouseX, mouseY);
    let d = p5.Vector.dist(this.pos, m);
    if (d < MOUSE_RADIUS) {
      let strength = 1 - d / MOUSE_RADIUS;
      if (mouseIsPressed) {
        force.add(p5.Vector.sub(this.pos, m).normalize().mult(strength * 5));
      } else {
        force.add(p5.Vector.sub(m, this.pos).mult(0.012 * strength));
      }
    }
 
    // 4) física: aceleração -> velocidade -> posição (com atrito)
    this.vel.add(force);
    this.vel.mult(0.88);
    this.pos.add(this.vel);
 
    this.rot += this.rotSpeed + level * 0.08;
  }
 
  show() {
    // cresce suavemente nos primeiros 20 frames
    let age = constrain((frameCount - this.birth) / 20, 0, 1);
    let grow = age * age * (3 - 2 * age);
 
    // cada quadrado "vibra" quando a sua frequência de nascimento volta a soar
    let bandValue = bands[this.band] || 0;
    let pulse = 1 + bandValue * 1.8 + smoothLevel * 1.5;
 
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.rot);
    rectMode(CENTER);
    stroke(this.hue, 60, 100, 90);
    strokeWeight(1.5);
    fill(this.hue, 70, 100, 12);
    rect(0, 0, this.w0 * pulse * grow, this.h0 * pulse * grow);
    pop();
  }
}
 
// ---------- SETUP ----------
function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  resetFigure();
}
 
function resetFigure() {
  nodes = [];
  head = createVector(width / 2 + random(-80, 80), height / 2 + random(-80, 80));
  heading = random(TWO_PI);
  // algumas sementes para o ecrã não começar vazio
  for (let i = 0; i < 8; i++) {
    let t = random();
    for (let p of symmetric(width / 2 + randomGaussian(0, 50), height / 2 + randomGaussian(0, 50))) {
      nodes.push(new Node(p.x, p.y, t, map(t, 0, 1, 250, 2200), 0.08, p.flip, p.rot));
    }
  }
}
 
// ---------- A VOZ DESENHA ----------
function drawWithVoice(level) {
  // 1) A ponta curva conforme o tom (relativo à voz da pessoa) e um pouco de noise.
  //    Tom agudo curva para um lado, tom grave para o outro, tom médio segue em frente.
  let turn = (pn - 0.5) * 0.35 * (0.4 + level * 4);
  turn += (noise(frameCount * 0.01) - 0.5) * 0.18;
  heading += turn;
 
  // 2) O volume define o passo
  let step = 5 + level * 70;
  head.x += cos(heading) * step;
  head.y += sin(heading) * step;
 
  // 3) Nas margens a ponta ressalta em vez de ficar presa
  let mx = width * MARGIN, my = height * MARGIN;
  if (head.x < mx || head.x > width - mx) {
    heading = PI - heading;
    head.x = constrain(head.x, mx, width - mx);
  }
  if (head.y < my || head.y > height - my) {
    heading = -heading;
    head.y = constrain(head.y, my, height - my);
  }
 
  // 4) Nasce um grupo de quadrados (o original + os gémeos da simetria)
  if (frameCount % SPAWN_EVERY === 0) {
    let spot = bestSpot(head.x, head.y, 30 + level * 150);
    for (let p of symmetric(spot.x, spot.y)) {
      nodes.push(new Node(p.x, p.y, pn, smoothPitch, level, p.flip, p.rot));
    }
 
    // às vezes nasce um ramo a partir de um quadrado recente (cresce como um coral)
    if (random() < BRANCH_CHANCE && nodes.length > 30) {
      let src = nodes[floor(random(max(0, nodes.length - 80), nodes.length))];
      let a = random(TWO_PI);
      let dist2 = random(50, 120);
      let b = bestSpot(src.home.x + cos(a) * dist2, src.home.y + sin(a) * dist2, 40);
      for (let p of symmetric(b.x, b.y)) {
        nodes.push(new Node(p.x, p.y, pn, smoothPitch, level, p.flip, p.rot));
      }
    }
 
    while (nodes.length > MAX_NODES) nodes.shift();   // esquece os mais antigos
  }
}
 
// ---------- DRAW ----------
function draw() {
  background(235, 40, 7);
 
  // --- INPUT: som ---
  let level = 0;
  if (started) {
    analyser.getByteFrequencyData(freqData);
    smoothLevel = lerp(smoothLevel, getLevel(), 0.25);
    level = smoothLevel;
    bands = getBands();
 
    if (level > THRESHOLD) {
      // só atualizamos o tom enquanto há voz (no silêncio o centroide é ruído)
      smoothPitch = lerp(smoothPitch, constrain(getCentroid(), 150, 4000), 0.15);
 
      // CALIBRAÇÃO AUTOMÁTICA: aprende o intervalo de tons desta voz, para que
      // qualquer pessoa use a gama completa de cores e direções
      if (smoothPitch < pitchLo) pitchLo = smoothPitch; else pitchLo = lerp(pitchLo, smoothPitch, 0.003);
      if (smoothPitch > pitchHi) pitchHi = smoothPitch; else pitchHi = lerp(pitchHi, smoothPitch, 0.003);
      let span = max(pitchHi - pitchLo, 250);
      pn = constrain((smoothPitch - pitchLo) / span, 0, 1);
 
      drawWithVoice(level);
    }
  } else {
    smoothLevel = 0;
  }
 
  // --- atualizar ---
  for (let n of nodes) n.update(level);
 
  // --- FIOS entre quadrados próximos ---
  let linkDist = LINK_BASE + level * 300;   // a voz alarga o alcance dos fios
  let linkDist2 = linkDist * linkDist;
  for (let i = 0; i < nodes.length; i++) {
    let a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      let b = nodes[j];
      let dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < linkDist2) {
        let d = sqrt(d2);
        stroke(a.hue, 50, 100, map(d, 0, linkDist, 70, 0));
        strokeWeight(map(d, 0, linkDist, 1.5, 0.2));
        line(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
      }
    }
  }
 
  // --- FIOS do rato ---
  for (let n of nodes) {
    let d = dist(mouseX, mouseY, n.pos.x, n.pos.y);
    if (d < MOUSE_RADIUS) {
      stroke(0, 0, 100, map(d, 0, MOUSE_RADIUS, 70, 0));
      strokeWeight(1);
      line(mouseX, mouseY, n.pos.x, n.pos.y);
    }
  }
 
  // --- quadrados ---
  for (let n of nodes) n.show();
 
  // --- ponta de desenho (feedback visual de onde a voz está a "pintar") ---
  if (started) {
    noFill();
    stroke(0, 0, 100, 50);
    strokeWeight(1);
    for (let p of symmetric(head.x, head.y)) circle(p.x, p.y, 8 + level * 60);
  }
 
  // --- mensagens ---
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  if (!started) {
    fill(0, 0, 90, 80);
    text(
      micError
        ? "Não foi possível aceder ao microfone (verifica as permissões). O rato continua a funcionar."
        : "Clica para ativar o microfone e fala. Varia o tom e o volume para desenhar.",
      width / 2, height - 36
    );
  } else {
    fill(0, 0, 90, 40);
    text("M simetria: " + SYM_NAMES[symMode] + "  ·  R recomeçar  ·  S guardar", width / 2, height - 24);
  }
}
 
// ---------- EVENTOS ----------
function mousePressed() {
  if (!started && !micError) startAudio();
}
 
function keyPressed() {
  if (key === 's' || key === 'S') saveCanvas('retrato-da-voz', 'png');
  if (key === 'r' || key === 'R') resetFigure();
  if (key === 'm' || key === 'M') {
    symMode = (symMode + 1) % SYM_NAMES.length;
    resetFigure();
  }
}
 
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resetFigure();
}
 