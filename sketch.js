let pecas = [];          // lista das imagens que já estão na colagem
let selecionada = null;  // peça escolhida (a última em que se clicou)
let arrastando = false;  // está a arrastar uma peça?
let offX = 0;            // distância do clique ao centro da peça
let offY = 0;

let caixa;               // caixa de texto
let botao;               // botão "adicionar"
let botaoLimpar;         // botão "limpar"
let mensagem = 'Escreve uma palavra e carrega em Enter';

// moldura (retângulo na vertical onde se faz a colagem)
let molduraX, molduraY, molduraLarg, molduraAlt;
let espessura = 14;      // espessura da madeira da moldura
let topoMoldura = 110;   // espaço no topo para a caixa de texto

function setup() {
  createCanvas(windowWidth, windowHeight);
  calcularMoldura();

  caixa = createInput();
  caixa.attribute('placeholder', 'escreve uma palavra...');
  caixa.style('font-size', '18px');
  caixa.style('padding', '8px 12px');
  caixa.style('box-sizing', 'border-box');
  caixa.style('border', '2px solid #3c2d23');
  caixa.style('border-radius', '8px');

  // Enter dentro da caixa também adiciona a palavra
  caixa.elt.addEventListener('keydown', function (evento) {
    if (evento.key === 'Enter') {
      adicionarPalavra();
    }
  });

  botao = createButton('adicionar');
  botao.style('font-size', '16px');
  botao.mousePressed(adicionarPalavra);

  botaoLimpar = createButton('limpar');
  botaoLimpar.style('font-size', '16px');
  botaoLimpar.mousePressed(limparColagem);

  posicionarInterface();
}

function draw() {
  background(215, 209, 198);

  desenharMoldura();

  // rodar a peça selecionada com as setas (se não estiver a escrever na caixa)
  if (selecionada && document.activeElement !== caixa.elt) {
    if (keyIsDown(LEFT_ARROW)) {
      selecionada.rotacao -= 0.03;
    }
    if (keyIsDown(RIGHT_ARROW)) {
      selecionada.rotacao += 0.03;
    }
  }

  // desenha as peças pela ordem em que estão na lista (a última fica por cima)
  for (let p of pecas) {
    push();

    // as peças que estão dentro da moldura ficam cortadas pelos limites dela
    let aArrastar = arrastando && p === selecionada;
    if (dentroDaMoldura(p) && !aArrastar) {
      drawingContext.beginPath();
      drawingContext.rect(molduraX, molduraY, molduraLarg, molduraAlt);
      drawingContext.clip();
    }

    desenharPeca(p);
    pop();
  }

  // texto de ajuda quando a moldura ainda está vazia
  if (pecas.length === 0) {
    noStroke();
    fill(170, 163, 150);
    textSize(18);
    textAlign(CENTER, CENTER);
    text('o teu quadro colagem', molduraX + molduraLarg / 2, molduraY + molduraAlt / 2);
  }

  // mensagem de estado, por baixo da caixa de texto
  noStroke();
  fill(70, 60, 50);
  textSize(14);
  textAlign(LEFT, TOP);
  text(mensagem, molduraX - espessura, 72);

  // instruções no fundo do ecrã
  fill(110, 100, 88);
  textSize(13);
  textAlign(CENTER, CENTER);
  text(
    'arrastar: mover   ·   roda do rato: tamanho   ·   setas ← →: rodar   ·   Delete: apagar',
    width / 2,
    height - 22
  );

  // cursor em forma de mão quando está por cima de uma peça
  if (arrastando) {
    cursor('grabbing');
  } else if (pecaSobRato() !== null) {
    cursor('grab');
  } else {
    cursor('default');
  }
}

// ---------- layout ----------

// calcula o tamanho e a posição da moldura (retângulo na vertical)
function calcularMoldura() {
  molduraAlt = constrain(height - topoMoldura - 50, 300, 1000);
  molduraLarg = molduraAlt * 0.72;

  // se a janela for estreita, a moldura encolhe
  if (molduraLarg > width - 60) {
    molduraLarg = width - 60;
    molduraAlt = molduraLarg / 0.72;
  }

  molduraX = (width - molduraLarg) / 2;
  molduraY = topoMoldura;
}

// coloca a caixa de texto e os botões por cima da moldura
function posicionarInterface() {
  let x0 = molduraX - espessura;
  let total = molduraLarg + 2 * espessura;
  let larguraCaixa = max(180, total - 176);

  caixa.position(x0, 20);
  caixa.size(larguraCaixa, 42);

  botao.position(x0 + larguraCaixa + 8, 20);
  botao.size(90, 42);

  botaoLimpar.position(x0 + larguraCaixa + 8 + 90 + 8, 20);
  botaoLimpar.size(70, 42);
}

function desenharMoldura() {
  // madeira da moldura, com sombra
  push();
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.35)';
  drawingContext.shadowBlur = 30;
  drawingContext.shadowOffsetY = 12;
  noStroke();
  fill(60, 45, 35);
  rect(
    molduraX - espessura,
    molduraY - espessura,
    molduraLarg + 2 * espessura,
    molduraAlt + 2 * espessura
  );
  pop();

  // papel onde se faz a colagem
  noStroke();
  fill(250, 247, 240);
  rect(molduraX, molduraY, molduraLarg, molduraAlt);
}

function dentroDaMoldura(p) {
  return (
    p.x > molduraX &&
    p.x < molduraX + molduraLarg &&
    p.y > molduraY &&
    p.y < molduraY + molduraAlt
  );
}

// ---------- peças ----------

function desenharPeca(p) {
  translate(p.x, p.y);
  rotate(p.rotacao);
  scale(p.escala);

  // 1) base branca com sombra (dá o efeito de papel recortado)
  drawingContext.shadowColor = 'rgba(0, 0, 0, 0.35)';
  drawingContext.shadowBlur = 14;
  drawingContext.shadowOffsetX = 3;
  drawingContext.shadowOffsetY = 5;
  drawingContext.fillStyle = 'white';
  tracarForma(p, 1);
  drawingContext.fill();

  // 2) sem sombra, recorta a imagem pela forma e desenha-a
  push();
  drawingContext.shadowColor = 'transparent';
  tracarForma(p, 0.95);
  drawingContext.clip();
  imageMode(CENTER);
  image(p.img, 0, 0, p.largura, p.altura);
  pop();

  // 3) contorno laranja na peça selecionada
  if (p === selecionada) {
    drawingContext.shadowColor = 'transparent';
    drawingContext.strokeStyle = '#ff7a00';
    drawingContext.lineWidth = 2 / p.escala;
    tracarForma(p, 1);
    drawingContext.stroke();
  }
}

// desenha o contorno da forma como um caminho (para preencher, recortar ou contornar)
function tracarForma(p, fator) {
  drawingContext.beginPath();
  for (let i = 0; i < p.forma.length; i++) {
    let x = p.forma[i][0] * (p.largura / 2) * fator;
    let y = p.forma[i][1] * (p.altura / 2) * fator;

    if (i === 0) {
      drawingContext.moveTo(x, y);
    } else {
      drawingContext.lineTo(x, y);
    }
  }
  drawingContext.closePath();
}

// cria um contorno irregular e orgânico (valores entre -1 e 1)
function criarForma() {
  let pontos = [];
  let n = 72;
  let desloc = random(1000); // cada peça usa uma zona diferente do ruído

  for (let i = 0; i < n; i++) {
    let a = (i / n) * TWO_PI;
    let c = cos(a);
    let s = sin(a);

    // distância do centro à borda do retângulo, nesta direção
    let ateBorda = 1 / max(abs(c), abs(s));

    // o ruído encolhe essa distância entre 70% e 100%
    let r = noise(desloc + c * 1.5, desloc + s * 1.5);
    let fator = map(r, 0.2, 0.8, 0.7, 1.0, true);

    pontos.push([c * ateBorda * fator, s * ateBorda * fator]);
  }

  return pontos;
}

// diz se um ponto (px, py) está dentro da forma de uma peça
function pontoNaPeca(p, px, py) {
  // passa o ponto para o sistema de coordenadas da própria peça
  let dx = px - p.x;
  let dy = py - p.y;
  let c = cos(-p.rotacao);
  let s = sin(-p.rotacao);
  let lx = (dx * c - dy * s) / p.escala;
  let ly = (dx * s + dy * c) / p.escala;

  // teste "ponto dentro de polígono" (conta quantas vezes uma linha cruza os lados)
  let dentro = false;
  let n = p.forma.length;
  let j = n - 1;

  for (let i = 0; i < n; i++) {
    let xi = p.forma[i][0] * (p.largura / 2);
    let yi = p.forma[i][1] * (p.altura / 2);
    let xj = p.forma[j][0] * (p.largura / 2);
    let yj = p.forma[j][1] * (p.altura / 2);

    let cruza = (yi > ly) !== (yj > ly) && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi;
    if (cruza) {
      dentro = !dentro;
    }

    j = i;
  }

  return dentro;
}

// devolve a peça que está por baixo do rato (a de cima), ou null
function pecaSobRato() {
  if (mouseY < topoMoldura - espessura - 5) {
    return null; // zona da caixa de texto
  }

  for (let i = pecas.length - 1; i >= 0; i--) {
    if (pontoNaPeca(pecas[i], mouseX, mouseY)) {
      return pecas[i];
    }
  }
  return null;
}

// posição inicial: uma das zonas ao lado da moldura
function posicaoInicial() {
  let ladoEsquerdo = random() < 0.5;
  let zonaLarg = max(molduraX - espessura, 0);

  let x = zonaLarg / 2;
  if (!ladoEsquerdo) {
    x = width - zonaLarg / 2;
  }
  x += random(-zonaLarg * 0.2, zonaLarg * 0.2);

  let y = random(molduraY + molduraAlt * 0.2, molduraY + molduraAlt * 0.8);

  return { x: x, y: y };
}

// ---------- rato e teclado ----------

function mousePressed() {
  if (mouseY < topoMoldura - espessura - 5) {
    return; // clicou na zona da caixa de texto e dos botões
  }

  selecionada = null;

  for (let i = pecas.length - 1; i >= 0; i--) {
    if (pontoNaPeca(pecas[i], mouseX, mouseY)) {
      selecionada = pecas[i];

      // traz a peça para a frente (passa para o fim da lista)
      pecas.splice(i, 1);
      pecas.push(selecionada);

      offX = mouseX - selecionada.x;
      offY = mouseY - selecionada.y;
      arrastando = true;
      break;
    }
  }
}

function mouseDragged() {
  if (arrastando && selecionada) {
    selecionada.x = mouseX - offX;
    selecionada.y = mouseY - offY;
  }
}

function mouseReleased() {
  arrastando = false;
}

// roda do rato: muda o tamanho da peça (a que está por baixo do rato, ou a selecionada)
function mouseWheel(evento) {
  let alvo = pecaSobRato();
  if (alvo === null) {
    alvo = selecionada;
  }
  if (alvo === null) {
    return;
  }

  let d = evento.deltaY || evento.delta || 0;
  alvo.escala = constrain(alvo.escala * exp(-d * 0.001), 0.2, 4);
  selecionada = alvo;

  return false; // impede a página de fazer scroll
}

// Delete / Backspace apaga a peça selecionada
function keyPressed() {
  if (document.activeElement === caixa.elt) {
    return; // está a escrever na caixa
  }

  if ((key === 'Delete' || key === 'Backspace') && selecionada) {
    pecas = pecas.filter(function (p) {
      return p !== selecionada;
    });
    selecionada = null;
  }
}

function limparColagem() {
  pecas = [];
  selecionada = null;
  arrastando = false;
  mensagem = 'Colagem limpa. Escreve outra palavra.';
}

// ---------- palavras e imagens ----------

// lê a palavra, procura a imagem e acrescenta-a à colagem
async function adicionarPalavra() {
  let palavra = caixa.value().trim();

  if (palavra === '') {
    return; // não escreveu nada
  }

  caixa.value(''); // limpa a caixa
  mensagem = 'a procurar "' + palavra + '"...';

  let url = await procurarImagem(palavra);

  if (url === null) {
    mensagem = 'não encontrei imagem para "' + palavra + '"';
    return;
  }

  try {
    // espera que a imagem carregue (versão 2 do p5)
    let img = await loadImage(url);

    let largura = molduraLarg * random(0.35, 0.55);
    let altura = (largura * img.height) / img.width; // mantém as proporções
    let pos = posicaoInicial();

    let nova = {
      img: img,
      palavra: palavra,
      x: pos.x,
      y: pos.y,
      rotacao: random(-0.25, 0.25),
      escala: 1,
      largura: largura,
      altura: altura,
      forma: criarForma()
    };

    pecas.push(nova);
    selecionada = nova;

    mensagem = '"' + palavra + '" adicionada. Arrasta-a para a moldura.';
  } catch (erro) {
    console.log('Erro ao carregar a imagem:', erro);
    mensagem = 'erro ao carregar a imagem de "' + palavra + '"';
  }
}

// procura primeiro a página com exatamente este título; se não houver, faz uma pesquisa
async function procurarImagem(palavra) {
  let linguas = ['pt', 'en'];

  // 1.º: página com o título exato (mais relevante)
  for (let lingua of linguas) {
    let url = await procurarPorTitulo(palavra, lingua);
    if (url !== null) {
      return url;
    }
  }

  // 2.º: pesquisa geral
  for (let lingua of linguas) {
    let url = await procurarNaWikipedia(palavra, lingua);
    if (url !== null) {
      return url;
    }
  }

  return null;
}

// devolve a imagem principal da página que tem exatamente este título (ou null)
async function procurarPorTitulo(palavra, lingua) {
  let endereco =
    'https://' + lingua + '.wikipedia.org/w/api.php' +
    '?action=query' +
    '&titles=' + encodeURIComponent(palavra) +
    '&redirects=1' +
    '&prop=pageimages' +
    '&piprop=thumbnail' +
    '&pithumbsize=600' +
    '&format=json' +
    '&origin=*';

  try {
    let resposta = await fetch(endereco);
    let dados = await resposta.json();

    if (!dados.query) {
      return null;
    }

    let paginas = Object.values(dados.query.pages);
    let pagina = paginas[0];

    if (pagina && pagina.thumbnail) {
      return pagina.thumbnail.source;
    }
    return null; // a página não existe ou não tem imagem
  } catch (erro) {
    console.log('Erro na pesquisa por título:', erro);
    return null;
  }
}

// pesquisa geral na Wikipedia de uma língua e devolve o endereço de uma imagem (ou null)
async function procurarNaWikipedia(palavra, lingua) {
  let endereco =
    'https://' + lingua + '.wikipedia.org/w/api.php' +
    '?action=query' +
    '&generator=search' +
    '&gsrsearch=' + encodeURIComponent(palavra) +
    '&gsrlimit=10' +
    '&prop=pageimages' +
    '&piprop=thumbnail' +
    '&pithumbsize=600' +
    '&format=json' +
    '&origin=*';

  try {
    let resposta = await fetch(endereco);
    let dados = await resposta.json();

    if (!dados.query) {
      return null; // a pesquisa não devolveu nada
    }

    // transforma o objeto de páginas numa lista, ordenada por relevância
    let paginas = Object.values(dados.query.pages);
    paginas.sort(function (a, b) {
      return a.index - b.index;
    });

    // fica só com as páginas que têm imagem
    let comImagem = paginas.filter(function (pagina) {
      return pagina.thumbnail;
    });

    if (comImagem.length === 0) {
      return null;
    }

    // escolhe ao acaso entre as 3 mais relevantes
    let candidatas = comImagem.slice(0, 3);
    let escolhida = random(candidatas);
    return escolhida.thumbnail.source;
  } catch (erro) {
    console.log('Erro na pesquisa:', erro);
    return null;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  calcularMoldura();
  posicionarInterface();
}