// Avatares gaúchos do Faz quantas?: a turma da mesa desenhada na mesma língua do Gaudério (formas
// chapadas, contorno grosso de tinta, paleta quente, bigode e chapéu campeiro), para escolher no
// perfil. Cada função devolve o miolo de um <svg viewBox="0 0 256 256"> de fundo transparente: o app
// pinta o círculo de cor por trás. Rosto um pouco acima do meio, ombros saindo pela borda de baixo,
// nada importante nos cantos (o recorte é redondo) e traço de no mínimo ~5 unidades, para ler bem a
// 40–56 px na mesa.
//
// Script comum (sem módulos), como gauderio.js: abre direto do disco em brand/avatares.html e é
// avaliado por scripts/make-avatares.mjs, que escreve apps/web/public/avatars/g/<slug>.svg e a
// lista apps/web/src/lib/avatares-gauchos.ts. Sem ids nem gradientes: vários convivem na mesma página.

(() => {
  const T = '#2B1D14';
  const P = {
    copas: '#C4372D', copasEscuro: '#8E231C', copasClaro: '#E0584B',
    papel: '#FBF2DF', ouro: '#E3A82B', ouroEscuro: '#A8741A', ouroClaro: '#F6D77A',
    espadas: '#2E5C9C', paus: '#3D7A3A', pala: '#5B3A24',
    chapeu: '#3B291D', abaChapeu: '#2A1C13', boca: '#5A1A14', lingua: '#E0584B',
    prata: '#D9D6CC', grisalho: '#DCD5CA', branco: '#FFFFFF',
  };
  const PELE = { clara: '#FBF2DF', rosada: '#F6D2B4', morena: '#E4A877', parda: '#C58152', escura: '#8C5A3A' };

  // ---------------------------------------------------------------- utilidades

  function mix(a, b, t) {
    const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [x, y] = [h(a), h(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const escurece = (c, t = 0.14) => mix(c, T, t);
  /** Contorno padrão. */
  const s = (w = 6) => `stroke="${T}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const linha = (d, w = 6, cor = T) =>
    `<path d="${d}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const forma = (d, fill, w = 6) => `<path d="${d}" fill="${fill}" ${s(w)}/>`;

  /**
   * Nuvem de círculos com contorno só por fora (lã, barba, cabelo crespo, erva): uma camada de
   * tinta engordada por baixo e o recheio por cima.
   */
  function nuvem(circs, fill, w = 12) {
    const c = circs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
    return `<g fill="${T}" stroke="${T}" stroke-width="${w}">${c}</g><g fill="${fill}">${c}</g>`;
  }

  // ---------------------------------------------------------------- corpo e cabeça

  function corpo(cor, y = 204) {
    return forma(`M12 276 C16 ${y + 26} 56 ${y + 4} 100 ${y} L156 ${y} C200 ${y + 4} 240 ${y + 26} 244 276 Z`, cor);
  }
  const pescoco = (pele, y1 = 176, y2 = 216) =>
    forma(`M108 ${y1} L106 ${y2} L150 ${y2} L148 ${y1} Z`, escurece(pele, 0.1));

  /** Cabeça no molde do Gaudério (mais larga na bochecha, queixo redondo), com sombra e orelhas. */
  function cabeca({ cx = 128, top = 66, w = 122, h = 128, pele = PELE.clara, orelhas = true, sombra = true } = {}) {
    const L = cx - w / 2, R = cx + w / 2, mid = top + h * 0.545, b = top + h;
    const d = `M${L} ${mid} C${L} ${top + h * 0.2} ${cx - w * 0.275} ${top} ${cx} ${top} C${cx + w * 0.275} ${top} ${R} ${top + h * 0.2} ${R} ${mid} C${R} ${top + h * 0.855} ${cx + w * 0.29} ${b} ${cx} ${b} C${cx - w * 0.29} ${b} ${L} ${top + h * 0.855} ${L} ${mid} Z`;
    const sh = `M${R} ${mid} C${R} ${top + h * 0.2} ${cx + w * 0.275} ${top} ${cx} ${top} C${cx + w * 0.2} ${top + h * 0.073} ${cx + w * 0.373} ${top + h * 0.255} ${cx + w * 0.373} ${mid} C${cx + w * 0.381} ${top + h * 0.8} ${cx + w * 0.25} ${top + h * 0.945} ${cx + w * 0.054} ${top + h * 0.993} C${cx + w * 0.325} ${top + h * 0.964} ${R} ${top + h * 0.836} ${R} ${mid} Z`;
    const oy = top + h * 0.553, ox = w * 0.515, orx = w * 0.09, ory = h * 0.12;
    const orelha = (x) => `<ellipse cx="${x}" cy="${oy}" rx="${orx}" ry="${ory}" fill="${pele}" ${s()}/>`;
    return `${orelhas ? orelha(cx - ox) + orelha(cx + ox) : ''}<path d="${d}" fill="${pele}" ${s()}/>${
      sombra ? `<path d="${sh}" fill="${escurece(pele, 0.09)}"/>` : ''
    }`;
  }

  const rubor = (x, y, rx = 13, ry = 8) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${P.copasClaro}" opacity=".45"/>`;
  const bochechas = (y = 162, dx = 40, rx = 13) => rubor(128 - dx, y, rx) + rubor(128 + dx, y, rx);

  // ---------------------------------------------------------------- olhos

  function olho(x, y, { rx = 14, ry = 16, dx = 0, dy = 0, pr = 7 } = {}) {
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" ${s(5)}/><circle cx="${x + dx}" cy="${y + dy}" r="${pr}" fill="${T}"/><circle cx="${x + dx - pr * 0.35}" cy="${y + dy - pr * 0.38}" r="${Math.max(2, pr * 0.32)}" fill="#fff"/>`;
  }
  /**
   * Pálpebra caída sobre um olho (deboche, sono, desconfiança): a calota de cima da elipse na cor
   * da pele. `inc` inclina a borda (+ desce do lado de dentro, cara braba); `lado` 1 = olho direito.
   */
  function palpebra(x, y, { rx = 14, ry = 16, frac = 0.45, pele, inc = 0, lado = 1 } = {}) {
    const yl = y - ry + frac * 2 * ry;
    const yE = yl + (lado > 0 ? inc : -inc);
    const yD = yl - (lado > 0 ? inc : -inc);
    const meia = (yy) => rx * Math.sqrt(Math.max(0, 1 - ((yy - y) / ry) ** 2));
    const grande = (yE + yD) / 2 > y ? 1 : 0;
    return `<path d="M${x - meia(yE)} ${yE} A${rx} ${ry} 0 ${grande} 1 ${x + meia(yD)} ${yD} Z" fill="${pele}" ${s(5)}/>${linha(`M${x - meia(yE) - 1} ${yE} L${x + meia(yD) + 1} ${yD}`, 6)}`;
  }
  const feliz = (x, y, w = 13) => linha(`M${x - w} ${y + 5} Q${x} ${y - 12} ${x + w} ${y + 5}`, 6);
  const dorme = (x, y, w = 13) => linha(`M${x - w} ${y - 3} Q${x} ${y + 10} ${x + w} ${y - 3}`, 6);
  /** Olho espremido ( > ou < ). `lado` 1 aponta para a direita. */
  const aperta = (x, y, lado = 1, w = 11) => linha(`M${x - lado * w} ${y - 9} L${x + lado * w} ${y} L${x - lado * w} ${y + 9}`, 6);
  const sobr = (d, w = 8, cor = T) => linha(d, w, cor);

  // ---------------------------------------------------------------- bocas

  function bocaAberta(cx, y, w, h, { dentes = true, lingua = true, falha = false } = {}) {
    const L = cx - w / 2, R = cx + w / 2;
    const d = `M${L} ${y} C${L + 2} ${y + h * 1.33} ${R - 2} ${y + h * 1.33} ${R} ${y} Q${cx} ${y + 5} ${L} ${y} Z`;
    let miolo = `<path d="${d}" fill="${P.boca}"/>`;
    if (lingua)
      miolo += `<path d="M${cx - w * 0.3} ${y + h * 0.93} C${cx - w * 0.26} ${y + h * 0.5} ${cx + w * 0.26} ${y + h * 0.5} ${cx + w * 0.3} ${y + h * 0.93} Q${cx} ${y + h * 1.04} ${cx - w * 0.3} ${y + h * 0.93} Z" fill="${P.lingua}"/>`;
    if (dentes) {
      miolo += `<path d="M${L + 4} ${y + 1.5} Q${cx} ${y + 6} ${R - 4} ${y + 1.5} L${R - 8} ${y + h * 0.3} Q${cx} ${y + h * 0.36} ${L + 8} ${y + h * 0.3} Z" fill="#fff"/>`;
      if (falha) miolo += `<rect x="${cx + w * 0.06}" y="${y + 2}" width="${w * 0.16}" height="${h * 0.34}" fill="${P.boca}"/>`;
    }
    return miolo + `<path d="${d}" fill="none" ${s(5)}/>`;
  }
  const sorriso = (cx, y, w = 30, c = 10, e = 5) => linha(`M${cx - w / 2} ${y} Q${cx} ${y + c} ${cx + w / 2} ${y}`, e);
  /** Sorriso de canto: sobe para a direita. */
  const debocho = (cx, y, w = 30) => linha(`M${cx - w / 2} ${y + 2} Q${cx + w * 0.05} ${y + 8} ${cx + w / 2} ${y - 6}`, 5);
  const oh = (cx, y, rx = 8, ry = 10) => `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${P.boca}" ${s(5)}/>`;
  function dentinhos(cx, y, w = 40, h = 18) {
    const n = 4, x0 = cx - w / 2;
    let v = '';
    for (let i = 1; i < n; i++) v += `M${x0 + (w * i) / n} ${y} V${y + h}`;
    return `<rect x="${x0}" y="${y}" width="${w}" height="${h}" rx="${h / 2.2}" fill="#fff" ${s(5)}/>${linha(`M${x0 + 2} ${y + h / 2} H${x0 + w - 2}`, 3)}${linha(v, 3)}`;
  }

  // ---------------------------------------------------------------- peças da pilcha

  /** O bigode do Gaudério, na escala `e` (1 = igual ao símbolo). */
  function bigode(cx, cy, e = 1, cor = T, contorno = false) {
    const d = 'M512 790 C470 764 414 764 372 790 C336 812 306 796 298 764 C278 810 312 852 372 850 C428 848 476 830 512 812 C548 830 596 848 652 850 C712 852 746 810 726 764 C718 796 688 812 652 790 C610 764 554 764 512 790 Z';
    const k = 0.25 * e;
    return `<path transform="translate(${cx} ${cy}) scale(${k}) translate(-512 -800)" d="${d}" fill="${cor}"${
      contorno ? ` stroke="${T}" stroke-width="${22 / e}" stroke-linejoin="round"` : ''
    }/>`;
  }

  /** O lenço do Gaudério (gola, nó e pontas). `y` desloca em relação ao símbolo. */
  function lenco(cor, { y = -10, e = 1, escuro } = {}) {
    const n = escuro || escurece(cor, 0.22);
    const k = 0.3 * e;
    const st = `stroke="${T}" stroke-width="${20 / e}" stroke-linejoin="round"`;
    return `<g transform="translate(128 ${226 + y}) scale(${k}) translate(-512 -904)">
      <path d="M384 872 C430 910 594 910 640 872 L664 930 C600 968 424 968 360 930 Z" fill="${cor}" ${st}/>
      <path d="M478 948 L430 1060 L500 1060 L512 968 L524 1060 L594 1060 L546 948 Z" fill="${cor}" ${st}/>
      <path d="M470 912 C490 900 534 900 554 912 L562 964 C540 978 484 978 462 964 Z" fill="${n}" ${st}/></g>`;
  }

  /** Chapéu campeiro de frente: aba larga, copa de topo afundado e fita. */
  function chapeu({ x = 128, y = 80, rot = -6, e = 1, cor = P.chapeu, aba, fita = P.copas } = {}) {
    const ab = aba || escurece(cor, 0.25);
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${e})">
      <ellipse cx="0" cy="0" rx="96" ry="17" fill="${ab}" ${s(6 / e)}/>
      <path d="M-48 2 C-50 -26 -45 -48 -37 -55 C-16 -61 16 -61 37 -55 C45 -48 50 -26 48 2 C24 7 -24 7 -48 2 Z" fill="${cor}" ${s(6 / e)}/>
      ${fita ? `<path d="M-49 -12 C-24 -6 24 -6 49 -12 L48 2 C24 7 -24 7 -48 2 Z" fill="${fita}" ${s(5 / e)}/>` : ''}
      ${linha('M-22 -55 Q0 -45 22 -55', 5 / e)}</g>`;
  }

  /** Boina basca: disco inclinado com o biquinho em cima. */
  function boina({ x = 128, y = 72, rot = -10, e = 1, cor = '#2C3A55' } = {}) {
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${e})">
      ${forma('M-2 -30 L0 -40 L6 -30 Z', cor, 5 / e)}
      ${forma('M-66 8 C-72 -22 -34 -34 6 -32 C48 -30 76 -16 70 6 C54 16 -44 18 -66 8 Z', cor, 6 / e)}
      ${linha('M-58 4 C-36 12 40 12 62 2', 4 / e, escurece(cor, 0.35))}</g>`;
  }

  // ---------------------------------------------------------------- personagens

  const personagens = [];
  /** `zoom` aproxima o desenho em volta do rosto (o que sobra sai pela borda do círculo). */
  const def = (slug, label, desenha, zoom = 1.06) => personagens.push({ slug, label, desenha, zoom });

  // O Gaudério da marca, agora de chapéu tombado e com cara de quem já sabe quantas faz.
  def('gauderio', 'Gaudério bigodudo', () => {
    const pele = PELE.clara;
    return `${corpo(P.pala)}${linha('M70 214 L84 256 M186 214 L172 256', 5, escurece(P.pala, 0.4))}
      ${pescoco(pele)}${lenco(P.ouro)}
      ${cabeca({ top: 68, h: 128, pele })}
      ${forma('M68 128 C66 110 70 98 80 90 L84 134 Z M188 128 C190 110 186 98 176 90 L172 134 Z', T, 3)}
      ${bochechas(166, 42)}
      ${olho(104, 136, { dx: 5, dy: 1 })}${olho(152, 136, { dx: 5, dy: 1 })}
      ${palpebra(104, 136, { pele, frac: 0.42 })}${palpebra(152, 136, { pele, frac: 0.42 })}
      ${sobr('M86 104 Q102 90 120 100', 9)}${sobr('M138 112 Q154 106 170 112', 9)}
      ${bigode(128, 170, 1.12)}
      ${debocho(132, 184, 26)}
      ${chapeu({ x: 126, y: 84, rot: -14 })}`;
  }, 1);

  def('vo-do-chimarrao', 'Vó do chimarrão', () => {
    const pele = PELE.rosada;
    const cabelo = '#E4DFD6';
    return `${corpo('#8E4F86')}${forma('M100 206 L128 240 L156 206 Z', '#F4EEE2', 5)}
      ${pescoco(pele)}
      ${nuvem([[74, 118, 22], [182, 118, 22], [70, 150, 18], [186, 150, 18], [84, 92, 22], [172, 92, 22], [128, 76, 30]], cabelo)}
      ${cabeca({ top: 72, h: 124, w: 118, pele })}
      ${nuvem([[92, 88, 16], [112, 80, 16], [134, 78, 16], [156, 82, 16], [170, 94, 13]], cabelo, 10)}
      ${bochechas(164, 40)}
      ${feliz(106, 136, 11)}${feliz(150, 136, 11)}
      <circle cx="106" cy="134" r="19" fill="#fff" fill-opacity=".25" ${s(6)}/><circle cx="150" cy="134" r="19" fill="#fff" fill-opacity=".25" ${s(6)}/>
      ${linha('M125 132 Q128 128 131 132', 5)}
      ${sobr('M92 106 Q106 100 120 106', 6, '#B9B1A4')}${sobr('M136 106 Q150 100 164 106', 6, '#B9B1A4')}
      ${oh(126, 176, 7, 7)}
      ${linha('M130 174 L168 160', 11)}${linha('M130 174 L168 160', 5, P.prata)}
      ${forma('M154 170 C150 196 162 222 186 224 C210 222 220 196 214 170 Z', '#7A4B2B')}
      ${forma('M150 164 H218 V176 H150 Z', P.prata, 5)}
      ${nuvem([[164, 164, 7], [176, 161, 8], [190, 161, 8], [203, 164, 7]], '#7FA83F', 8)}
      ${linha('M170 190 Q176 206 188 212', 5, '#A06A40')}
      ${forma('M150 214 C146 200 160 194 170 204 L178 222 C170 232 154 228 150 214 Z', pele, 5)}
      ${boina({ x: 124, y: 62, rot: -12, e: 0.95, cor: '#2C3A55' })}`;
  }, 1);

  def('vo-do-chinelo', 'Vó do chinelo', () => {
    const pele = PELE.rosada;
    const cabelo = '#E4DFD6';
    const azul = '#2F6FB5';
    return `${corpo('#4F77B8')}${[70, 110, 150, 190].map((x, i) => `<circle cx="${x}" cy="${236 + (i % 2) * 10}" r="7" fill="#F4EEE2"/>`).join('')}
      ${pescoco(pele)}
      <g transform="translate(-12 0)">
      ${nuvem([[128, 56, 22]], cabelo)}
      ${nuvem([[76, 120, 20], [180, 120, 20], [84, 94, 20], [172, 94, 20], [128, 78, 28]], cabelo)}
      ${cabeca({ top: 72, h: 124, w: 118, pele })}
      ${nuvem([[96, 86, 14], [116, 80, 14], [138, 80, 14], [158, 86, 14]], cabelo, 10)}
      <g transform="translate(146 100) scale(1.5) translate(-144 -99)">${linha('M140 94 Q146 100 140 104 M152 94 Q146 100 152 104 M136 98 Q142 92 148 98 M136 100 Q142 106 148 100', 3.5, P.copas)}</g>
      ${olho(106, 138, { rx: 13, ry: 14, pr: 5 })}${olho(150, 138, { rx: 13, ry: 14, pr: 5 })}
      ${palpebra(106, 138, { pele, rx: 13, ry: 14, frac: 0.3, inc: 6, lado: -1 })}${palpebra(150, 138, { pele, rx: 13, ry: 14, frac: 0.3, inc: 6, lado: 1 })}
      <circle cx="106" cy="138" r="18" fill="none" ${s(5)}/><circle cx="150" cy="138" r="18" fill="none" ${s(5)}/>${linha('M124 136 Q128 132 132 136', 5)}
      ${sobr('M88 114 L122 126', 8, '#9C9384')}${sobr('M168 114 L134 126', 8, '#9C9384')}
      ${bocaAberta(128, 168, 36, 20, { lingua: true })}
      ${bochechas(164, 42)}
      </g>
      <g transform="translate(194 118) rotate(12) scale(.9)">
        ${forma('M-22 -40 C-16 -62 18 -64 24 -42 L26 30 C26 52 -24 52 -24 30 Z', azul)}
        ${forma('M-17 -38 C-12 -54 13 -56 19 -40 L20 26 C20 42 -18 42 -18 26 Z', '#F4EEE2', 4)}
        ${linha('M0 -34 L-17 0 M0 -34 L19 0', 11)}${linha('M0 -34 L-17 0 M0 -34 L19 0', 5, azul)}
        ${forma('M-26 28 C-30 16 -12 12 0 16 L24 20 C34 28 30 46 16 48 L-12 48 C-22 46 -26 38 -26 28 Z', pele, 5)}
        ${linha('M-8 26 L14 28 M-10 37 L14 38', 3)}
      </g>`;
  });

  def('prenda', 'Prenda faceira', () => {
    const pele = PELE.morena;
    const cabelo = '#3E2416';
    return `${forma('M66 120 C58 170 60 214 70 250 L186 250 C196 214 198 170 190 120 Z', cabelo)}
      ${corpo('#8FB6DD')}${nuvem([[92, 210, 11], [112, 216, 11], [128, 218, 11], [144, 216, 11], [164, 210, 11]], '#FFFFFF', 10)}
      ${pescoco(pele, 176, 208)}
      ${cabeca({ top: 72, h: 124, w: 116, pele })}
      ${forma('M70 128 C66 90 90 66 128 66 C166 66 190 90 186 128 C176 108 158 94 132 92 C138 100 138 104 136 108 C120 98 96 104 82 130 Z', cabelo)}
      ${nuvem([[128, 52, 20]], cabelo, 10)}
      ${bochechas(164, 42, 14)}
      ${olho(106, 138, { rx: 14, ry: 17, dx: 1 })}${linha('M92 126 L86 120 M96 122 L92 114', 5)}
      ${feliz(150, 140, 12)}${linha('M162 136 L168 131', 5)}
      ${sobr('M92 112 Q106 104 118 110', 6)}${sobr('M140 114 Q152 108 164 114', 6)}
      ${bocaAberta(128, 170, 30, 14, { lingua: false })}
      <circle cx="68" cy="156" r="6" fill="${P.ouro}" ${s(4)}/><circle cx="188" cy="156" r="6" fill="${P.ouro}" ${s(4)}/>
      ${nuvem([[176, 72, 12], [194, 74, 12], [198, 92, 12], [182, 102, 12], [168, 90, 12]], P.copas, 10)}
      <circle cx="183" cy="87" r="8" fill="${P.ouroClaro}" ${s(4)}/>`;
  });

  def('maragato', 'Maragato brabo', () => {
    const pele = PELE.parda;
    return `${corpo('#4A3526')}
      ${pescoco(pele)}${lenco(P.copas, { e: 1.15, y: -6 })}
      ${cabeca({ top: 70, h: 128, pele })}
      ${olho(104, 138, { pr: 6 })}${olho(152, 138, { pr: 6 })}
      ${palpebra(104, 138, { pele, frac: 0.38, inc: 7, lado: -1 })}${palpebra(152, 138, { pele, frac: 0.38, inc: 7, lado: 1 })}
      ${sobr('M82 112 L122 128', 10)}${sobr('M174 112 L134 128', 10)}
      ${linha('M124 150 Q128 158 134 152', 4, escurece(pele, 0.35))}
      ${bigode(128, 168, 0.8)}
      ${dentinhos(128, 174, 40, 16)}
      ${chapeu({ x: 128, y: 84, rot: 4, cor: '#1F1712', fita: null })}`;
  }, 1);

  def('chimango', 'Chimango desconfiado', () => {
    const pele = PELE.clara;
    return `${corpo('#5E6A7A')}
      ${pescoco(pele)}${lenco('#F7F3EA', { escuro: '#D9D2C4' })}
      ${cabeca({ top: 70, h: 128, pele })}
      ${bochechas(166, 42)}
      ${olho(104, 138, { dx: -7, dy: 2 })}${olho(152, 138, { dx: -7, dy: 2 })}
      ${palpebra(104, 138, { pele, frac: 0.5 })}${palpebra(152, 138, { pele, frac: 0.5 })}
      ${sobr('M86 116 Q104 110 120 116', 8)}${sobr('M136 106 Q154 92 170 100', 8)}
      ${bigode(128, 166, 0.72)}
      ${linha('M116 182 Q122 178 128 182 Q134 186 140 180', 5)}
      ${chapeu({ x: 128, y: 84, rot: -3, cor: '#B48A55', fita: T })}`;
  }, 1);

  def('guri-de-bone', 'Guri de boné virado', () => {
    const pele = PELE.morena;
    return `${corpo('#F1ECE0')}${linha('M20 250 H236', 12, P.copas)}
      ${pescoco(pele)}
      ${forma('M66 92 C44 78 28 66 26 52 C40 50 66 60 88 76 Z', escurece(P.espadas, 0.1))}
      ${cabeca({ top: 72, h: 124, w: 120, pele })}
      ${forma('M68 118 C64 80 92 58 128 58 C164 58 192 80 188 118 C160 108 96 108 68 118 Z', P.espadas)}
      ${forma('M110 112 C110 96 146 96 146 112 Z', '#3E2416', 5)}
      ${forma('M118 102 C112 88 122 84 124 94 C126 82 138 84 132 102 Z', '#3E2416', 4)}
      ${linha('M68 118 C96 108 160 108 188 118', 6)}
      ${bochechas(164, 42)}
      ${[[90, 156], [98, 162], [84, 164]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${escurece(pele, 0.3)}"/>`).join('')}
      ${olho(106, 138, { rx: 15, ry: 18, dy: -5, dx: 2 })}${olho(150, 138, { rx: 15, ry: 18, dy: -5, dx: 2 })}
      ${bocaAberta(128, 168, 46, 20, { falha: true })}
      <g transform="rotate(-30 168 162)">${forma('M154 155 H182 C187 155 187 169 182 169 H154 C149 169 149 155 154 155 Z', '#F2D3A8', 4)}${forma('M162 155 H174 V169 H162 Z', '#E8BE8A', 3)}</g>`;
  });

  def('tio-do-churrasco', 'Tio do churrasco', () => {
    const pele = '#F2BE98';
    const gris = P.grisalho;
    return `${corpo('#F2EADB')}${forma('M86 206 L86 276 L170 276 L170 206 C150 214 106 214 86 206 Z', P.copas, 6)}
      ${linha('M92 206 L108 180 M164 206 L148 180', 6)}
      ${pescoco(pele, 176, 204)}
      <g transform="translate(20 8) rotate(-12 58 160) scale(.9)">
        ${linha('M58 62 L58 262', 11)}${linha('M58 62 L58 262', 5, P.prata)}
        ${forma('M32 96 C32 76 84 76 84 96 L84 112 C84 126 32 126 32 112 Z', '#9A3B25')}${forma('M32 96 C32 76 84 76 84 96 C70 90 46 90 32 96 Z', '#F7EBD5', 5)}
        ${forma('M40 136 C40 126 76 126 76 136 L76 160 C76 170 40 170 40 160 Z', '#B5432C')}${linha('M44 148 H72', 3, '#7C2A1A')}
      </g>
      ${cabeca({ top: 70, h: 126, w: 124, pele })}
      ${nuvem([[70, 112, 11], [68, 130, 10], [186, 112, 11], [188, 130, 10]], gris, 9)}
      ${linha('M112 76 Q116 66 124 70 M130 72 Q134 62 142 66', 5)}
      ${forma('M170 92 C166 100 166 106 172 108 C178 106 178 100 170 92 Z', '#9FD6F2', 4)}
      ${feliz(104, 136, 12)}${feliz(152, 136, 12)}
      ${sobr('M90 114 Q104 106 118 114', 7, '#9C9384')}${sobr('M138 114 Q152 106 166 114', 7, '#9C9384')}
      ${bochechas(158, 44, 15)}
      <circle cx="128" cy="152" r="11" fill="#E0785E" ${s(5)}/>
      ${bocaAberta(128, 176, 42, 18, { dentes: true })}
      ${bigode(128, 170, 0.95, gris, true)}`;
  });

  def('veio-de-pala', 'Véio de pala', () => {
    const pele = PELE.clara;
    const barba = '#F3EEE6';
    return `${corpo('#8A4B2A')}${linha('M20 238 H236', 10, P.ouro)}${linha('M20 252 H236', 6, T)}
      ${cabeca({ top: 72, h: 124, w: 120, pele })}
      ${nuvem([[80, 162, 16], [92, 188, 20], [114, 206, 22], [142, 206, 22], [164, 188, 20], [176, 162, 16], [128, 222, 18], [104, 226, 14], [152, 226, 14]], barba)}
      ${bochechas(152, 42)}
      ${linha('M98 136 L112 136', 7)}${linha('M144 136 L158 136', 7)}
      ${nuvem([[88, 122, 10], [102, 118, 11], [116, 122, 10], [140, 122, 10], [154, 118, 11], [168, 122, 10]], barba, 9)}
      <ellipse cx="128" cy="154" rx="13" ry="12" fill="${escurece(pele, 0.12)}" ${s(5)}/>
      ${bigode(128, 172, 1.05, barba, true)}
      ${sorriso(128, 188, 16, -5, 5)}
      ${chapeu({ x: 128, y: 88, rot: 2, e: 1.02, cor: '#262019', fita: '#6E4124' })}`;
  }, 1);

  def('cuia', 'Cuia matreira', () => {
    const cuia = '#8A5431';
    return `${forma('M44 118 C34 196 70 262 128 266 C186 262 222 196 212 118 Z', cuia)}
      <path d="M180 132 C194 170 188 214 162 240 C196 214 206 170 198 132 Z" fill="${escurece(cuia, 0.2)}"/>
      ${linha('M70 134 C62 160 66 186 76 204', 6, '#B27A4E')}
      ${linha('M168 92 L196 22 L214 16', 13)}${linha('M168 92 L196 22 L214 16', 6, P.prata)}
      ${nuvem([[64, 104, 18], [92, 94, 20], [124, 90, 20], [156, 92, 20], [188, 102, 18]], '#7FA83F', 12)}
      ${[[80, 98], [110, 88], [140, 90], [170, 98], [98, 104], [150, 102]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#5C8A2A"/>`).join('')}
      ${forma('M38 108 C70 122 186 122 218 108 L216 128 C186 142 70 142 40 128 Z', P.prata, 6)}
      ${linha('M54 122 L62 130 L70 124 L78 132 L86 125 L94 133 L102 126 L110 134 L118 127 L126 135 L134 127 L142 134 L150 126 L158 133 L166 125 L174 132 L182 124 L190 130 L198 122', 3, '#9E9A8E')}
      ${olho(104, 166, { rx: 15, ry: 18, dx: 3, dy: 2 })}${olho(152, 166, { rx: 15, ry: 18, dx: 3, dy: 2 })}
      ${palpebra(104, 166, { pele: cuia, rx: 15, ry: 18, frac: 0.3 })}
      ${sobr('M86 140 Q102 136 118 142', 8)}${sobr('M136 138 Q152 124 170 132', 8)}
      ${bochechas(196, 50, 13)}
      ${bocaAberta(130, 198, 48, 18, { lingua: true })}`;
  });

  def('capivara', 'Capivara plena', () => {
    const pelo = '#A8784D';
    const esc = escurece(pelo, 0.2);
    return `${corpo(pelo, 206)}
      <ellipse cx="78" cy="84" rx="16" ry="14" fill="${esc}" ${s()}/><ellipse cx="178" cy="84" rx="16" ry="14" fill="${esc}" ${s()}/>
      ${forma('M66 120 C66 84 94 70 128 70 C162 70 190 84 190 120 L194 186 C194 222 164 238 128 238 C92 238 62 222 62 186 Z', pelo)}
      <path d="M190 120 C190 84 162 70 128 70 C156 78 176 96 176 124 L180 192 C180 216 162 232 138 237 C170 234 194 218 194 186 Z" fill="${esc}" opacity=".6"/>
      ${forma('M88 176 C88 156 104 150 128 150 C152 150 168 156 168 176 L168 196 C168 214 150 222 128 222 C106 222 88 214 88 196 Z', '#6E4A2E')}
      ${linha('M110 168 L118 174 M146 168 L138 174', 7, T)}
      ${linha('M128 188 V200 M114 206 Q128 200 142 206', 5)}
      ${olho(92, 126, { rx: 12, ry: 13, pr: 5, dy: 3 })}${olho(164, 126, { rx: 12, ry: 13, pr: 5, dy: 3 })}
      ${palpebra(92, 126, { pele: pelo, rx: 12, ry: 13, frac: 0.6 })}${palpebra(164, 126, { pele: pelo, rx: 12, ry: 13, frac: 0.6 })}
      ${chapeu({ x: 136, y: 70, rot: 10, e: 0.62 })}`;
  });

  def('quero-quero', 'Quero-quero fiscal', () => {
    const cinza = '#BDB4A7';
    return `${forma('M16 280 C20 220 64 196 128 196 C192 196 236 220 240 280 Z', '#8C8479')}
      ${forma('M84 208 C100 226 156 226 172 208 L180 280 L76 280 Z', '#FFFFFF', 5)}
      ${forma('M96 196 C104 216 152 216 160 196 L164 214 C150 232 106 232 92 214 Z', T, 4)}
      ${forma('M146 72 C166 48 194 36 222 40 C204 52 184 66 164 88 Z', T, 5)}
      ${forma('M70 128 C70 90 94 66 128 66 C162 66 186 90 186 128 C186 176 160 204 128 204 C96 204 70 176 70 128 Z', cinza)}
      ${forma('M128 66 C150 66 162 80 166 94 C150 88 140 100 134 116 L134 204 L122 204 L122 116 C116 100 106 88 90 94 C94 80 106 66 128 66 Z', '#2E2622', 5)}
      <circle cx="102" cy="126" r="17" fill="${P.copas}" ${s(5)}/><circle cx="154" cy="126" r="17" fill="${P.copas}" ${s(5)}/>
      <circle cx="104" cy="128" r="8" fill="${T}"/><circle cx="152" cy="128" r="8" fill="${T}"/><circle cx="101" cy="125" r="2.6" fill="#fff"/><circle cx="149" cy="125" r="2.6" fill="#fff"/>
      ${forma('M80 104 L124 118 L122 106 Z', T, 5)}${forma('M176 104 L132 118 L134 106 Z', T, 5)}
      ${forma('M114 176 C120 190 136 190 142 176 L128 204 Z', '#D8483C', 5)}
      ${forma('M112 184 C118 176 138 176 144 184 L128 196 Z', P.boca, 4)}
      ${forma('M108 150 C116 144 140 144 148 150 L134 182 L122 182 Z', '#D8483C', 5)}
      ${forma('M124 170 L132 170 L130 184 L126 184 Z', T, 3)}`;
  });

  def('cusco', 'Cusco caramelo', () => {
    const pelo = '#D38B3E';
    const claro = '#F6E6C8';
    return `${corpo(pelo)}${lenco(P.copas, { y: -8 })}
      ${forma('M70 96 C46 96 34 130 40 170 C54 170 70 150 78 124 Z', escurece(pelo, 0.25))}
      ${forma('M176 104 C182 70 196 48 214 40 C220 66 214 98 196 124 Z', pelo)}${forma('M186 96 C192 74 202 60 210 54 C212 72 208 92 196 110 Z', '#F2B8A8', 0)}
      ${cabeca({ top: 70, h: 132, w: 124, pele: pelo, orelhas: false })}
      ${forma('M92 156 C92 136 108 128 128 128 C148 128 164 136 164 156 C170 188 152 204 128 204 C104 204 86 188 92 156 Z', claro)}
      ${forma('M140 186 C140 212 146 234 160 236 C174 236 172 212 162 186 Z', '#E86B7A', 5)}
      ${linha('M151 196 L153 222', 3, '#B8465A')}
      ${forma('M108 150 C108 140 148 140 148 150 C148 160 136 168 128 168 C120 168 108 160 108 150 Z', T, 4)}<ellipse cx="120" cy="147" rx="6" ry="3" fill="#6B5A50"/>
      ${linha('M128 168 V178 M104 176 Q116 188 128 178 Q140 188 152 176', 5)}
      ${olho(100, 118, { rx: 14, ry: 16, pr: 8 })}${olho(156, 118, { rx: 14, ry: 16, pr: 8 })}
      <ellipse cx="96" cy="94" rx="8" ry="5" fill="${escurece(pelo, 0.25)}"/><ellipse cx="160" cy="94" rx="8" ry="5" fill="${escurece(pelo, 0.25)}"/>`;
  });

  def('ovelha', 'Ovelha de boina', () => {
    const la = '#F5F0E4';
    const cara = '#3B312C';
    return `${nuvem([[40, 250, 30], [80, 236, 30], [128, 232, 30], [176, 236, 30], [216, 250, 30]], la)}
      ${nuvem([[74, 106, 26], [96, 80, 26], [128, 70, 28], [160, 80, 26], [182, 106, 26], [70, 138, 22], [186, 138, 22]], la)}
      ${forma('M54 130 C36 128 26 140 30 150 C44 156 62 148 72 138 Z', cara)}${forma('M202 130 C220 128 230 140 226 150 C212 156 194 148 184 138 Z', cara)}
      ${forma('M84 128 C84 100 104 94 128 94 C152 94 172 100 172 128 C172 176 154 212 128 212 C102 212 84 176 84 128 Z', cara)}
      ${nuvem([[104, 102, 14], [128, 96, 15], [152, 102, 14]], la, 10)}
      ${olho(108, 138, { rx: 14, ry: 15, pr: 6, dx: -5, dy: 3 })}${olho(148, 138, { rx: 14, ry: 15, pr: 6, dx: 5, dy: -3 })}
      ${palpebra(108, 138, { pele: cara, rx: 14, ry: 15, frac: 0.4 })}${palpebra(148, 138, { pele: cara, rx: 14, ry: 15, frac: 0.4 })}
      <ellipse cx="118" cy="174" rx="4" ry="3" fill="#1A1210"/><ellipse cx="138" cy="174" rx="4" ry="3" fill="#1A1210"/>
      ${linha('M116 190 Q128 196 140 188', 5, '#EFE7D6')}
      <rect x="122" y="190" width="12" height="12" rx="2" fill="#fff" ${s(4)}/>
      ${boina({ x: 136, y: 58, rot: 14, e: 0.9, cor: P.copas })}`;
  }, 1);

  def('cavalo-crioulo', 'Cavalo crioulo', () => {
    const pelo = '#C99A5E';
    const crina = '#2E2119';
    return `${forma('M40 280 C44 230 70 200 96 196 L160 196 C186 200 212 230 216 280 Z', pelo)}
      ${forma('M92 200 C74 224 70 250 76 280 L96 280 C92 250 100 224 112 206 Z', crina, 5)}
      ${forma('M90 56 L82 16 L112 44 Z', pelo)}${forma('M166 56 L174 16 L144 44 Z', pelo)}
      ${forma('M80 86 C80 52 102 40 128 40 C154 40 176 52 176 86 C176 116 168 138 166 160 L90 160 C88 138 80 116 80 86 Z', pelo)}
      ${forma('M100 44 C108 30 122 36 128 48 C134 34 150 32 156 46 C150 64 138 70 128 66 C118 72 104 64 100 44 Z', crina, 5)}
      ${forma('M122 70 L134 70 L136 150 L120 150 Z', '#FFF6E6', 0)}
      ${forma('M76 172 C76 146 98 138 128 138 C158 138 180 146 180 172 C180 214 158 236 128 236 C98 236 76 214 76 172 Z', '#8A6446')}
      <ellipse cx="104" cy="164" rx="7" ry="9" fill="${T}"/><ellipse cx="152" cy="164" rx="7" ry="9" fill="${T}"/>
      ${bocaAberta(128, 186, 72, 34, { lingua: true })}
      ${linha('M104 188 V198 M116 189 V200 M128 190 V200 M140 189 V200 M152 188 V198', 3)}
      ${olho(96, 102, { rx: 13, ry: 15, pr: 6, dx: -3 })}${olho(160, 102, { rx: 13, ry: 15, pr: 6, dx: 3 })}
      ${palpebra(96, 102, { pele: pelo, rx: 13, ry: 15, frac: 0.25 })}${palpebra(160, 102, { pele: pelo, rx: 13, ry: 15, frac: 0.25 })}`;
  }, 1);

  def('graxaim', 'Graxaim malandro', () => {
    const pelo = '#8F8A83';
    const ruivo = '#BF7440';
    return `${corpo(pelo)}${forma('M104 204 L128 250 L152 204 Z', '#F2ECE2', 5)}
      ${forma('M70 110 L60 30 L114 84 Z', ruivo)}${forma('M186 110 L196 30 L142 84 Z', ruivo)}
      ${forma('M76 96 L70 50 L102 84 Z', '#F2ECE2', 0)}${forma('M180 96 L186 50 L154 84 Z', '#F2ECE2', 0)}
      ${forma('M128 76 C164 76 190 96 196 130 L218 150 L192 160 C180 186 156 206 128 212 C100 206 76 186 64 160 L38 150 L60 130 C66 96 92 76 128 76 Z', pelo)}
      ${forma('M92 160 C100 146 116 144 128 150 C140 144 156 146 164 160 C160 190 144 210 128 212 C112 210 96 190 92 160 Z', '#F2ECE2', 5)}
      ${forma('M128 96 C140 110 140 140 132 160 L124 160 C116 140 116 110 128 96 Z', ruivo, 0)}
      <ellipse cx="128" cy="170" rx="11" ry="8" fill="${T}"/>
      ${linha('M128 178 V186 M110 190 Q124 198 146 184', 5)}${forma('M136 191 L140 200 L143 189 Z', '#fff', 3)}
      ${olho(102, 132, { rx: 13, ry: 14, pr: 6, dx: 5 })}${olho(154, 132, { rx: 13, ry: 14, pr: 6, dx: 5 })}
      ${palpebra(102, 132, { pele: pelo, rx: 13, ry: 14, frac: 0.5 })}${palpebra(154, 132, { pele: pelo, rx: 13, ry: 14, frac: 0.42 })}
      ${sobr('M86 112 L118 116', 7)}${sobr('M140 110 Q156 94 172 104', 7)}`;
  });

  def('garnise', 'Garnisé invocado', () => {
    const pena = '#E0892F';
    return `${forma('M20 280 C24 222 70 196 128 196 C186 196 232 222 236 280 Z', '#B8542A')}
      ${forma('M66 196 L84 164 L96 200 L110 170 L120 204 L136 170 L146 204 L160 170 L172 200 L188 164 L190 204 Z', pena, 5)}
      ${forma('M90 66 C84 44 100 34 108 50 C106 30 128 22 132 46 C136 28 158 30 154 54 C166 44 180 56 166 74 Z', P.copas)}
      ${forma('M76 126 C76 88 98 66 128 66 C158 66 180 88 180 126 C180 166 158 190 128 190 C98 190 76 166 76 126 Z', pena)}
      ${forma('M118 158 C112 172 116 196 128 200 C140 196 144 172 138 158 Z', P.copas)}
      ${forma('M110 140 L146 140 L128 164 Z', P.ouroClaro, 5)}${linha('M112 146 H144', 3)}
      ${olho(104, 118, { rx: 14, ry: 16, pr: 5 })}${olho(152, 116, { rx: 16, ry: 19, pr: 8, dx: -2 })}
      ${palpebra(104, 118, { pele: pena, rx: 14, ry: 16, frac: 0.42, inc: 6, lado: -1 })}
      ${sobr('M84 92 L122 106', 8)}${sobr('M168 86 L136 98', 8)}`;
  });

  def('tche-bagual', 'Tchê bagual', () => {
    const pele = PELE.parda;
    return `${corpo('#6B3E22')}${linha('M100 206 L114 256 M156 206 L142 256', 5, '#3F2414')}
      ${pescoco(pele)}${lenco(P.ouro, { y: -10 })}
      ${cabeca({ top: 70, h: 128, pele })}
      ${forma('M74 124 C74 118 80 116 88 116 L124 118 L132 118 L168 116 C176 116 182 118 182 124 C182 150 168 158 152 158 C140 158 132 148 130 134 L126 134 C124 148 116 158 104 158 C88 158 74 150 74 124 Z', '#171311', 5)}
      ${linha('M86 130 L98 124 M142 130 L154 124', 5, '#fff')}
      ${sobr('M84 104 Q102 94 120 104', 8)}${sobr('M136 100 Q154 90 172 100', 8)}
      ${bigode(128, 172, 0.7)}
      ${debocho(132, 186, 34)}
      ${linha('M146 182 L196 170', 8)}${linha('M146 182 L196 170', 4, P.ouroClaro)}
      ${chapeu({ x: 128, y: 84, rot: -8, cor: '#2A2320', fita: P.prata })}`;
  }, 1);

  def('gaiteiro', 'Gaiteiro apaixonado', () => {
    const pele = PELE.clara;
    return `${corpo('#EFE6D2')}
      ${pescoco(pele, 176, 206)}${lenco(P.copas, { y: -16, e: 0.9 })}
      ${cabeca({ top: 64, h: 124, pele })}
      ${bochechas(152, 42)}
      ${dorme(104, 128, 12)}${dorme(152, 128, 12)}
      ${sobr('M88 110 Q98 100 118 104', 7)}${sobr('M138 104 Q158 100 168 110', 7)}
      ${bigode(128, 158, 0.9)}
      ${oh(128, 174, 11, 12)}<ellipse cx="128" cy="180" rx="6" ry="4" fill="${P.lingua}"/>
      ${chapeu({ x: 128, y: 82, rot: 8, cor: '#B48A55', fita: P.copas })}
      ${forma('M34 206 H222 V276 H34 Z', P.copas)}
      ${linha('M66 206 V276 M92 206 V276 M118 206 V276 M144 206 V276 M170 206 V276 M196 206 V276', 6, P.copasEscuro)}
      ${forma('M18 200 H66 V276 H18 Z', '#1F1A17')}${forma('M26 206 H56 V276 H26 Z', '#FFFFFF', 4)}
      ${linha('M26 222 H44 M26 240 H44 M26 258 H44', 6, T)}
      ${forma('M190 200 H238 V276 H190 Z', '#1F1A17')}
      ${[[204, 216], [222, 216], [204, 234], [222, 234], [204, 252], [222, 252]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${P.ouroClaro}"/>`).join('')}
`;
  }, 1);

  def('gringo-do-vinho', 'Gringo do vinho', () => {
    const pele = '#F4C4A4';
    return `${corpo('#F4EEE2')}${linha('M86 206 L80 276 M170 206 L176 276', 12, '#6E4124')}
      ${pescoco(pele)}
      ${cabeca({ top: 72, h: 126, pele })}
      ${feliz(104, 134, 12)}${linha('M142 130 Q152 138 164 130', 6)}
      ${sobr('M88 112 Q104 106 118 112', 8, '#5A3A22')}${sobr('M140 106 Q154 96 168 106', 8, '#5A3A22')}
      ${rubor(90, 156, 17, 11)}${rubor(166, 156, 17, 11)}
      <circle cx="128" cy="154" r="13" fill="#E06C60" ${s(5)}/>
      ${bocaAberta(126, 178, 34, 14)}
      ${bigode(128, 172, 1, '#6B4428', true)}
      ${forma('M54 90 C54 66 92 58 128 58 C164 58 204 64 206 84 C206 94 196 98 188 98 L66 98 C58 98 54 96 54 90 Z', '#5E6344')}
      ${forma('M66 96 C100 86 170 86 200 96 C206 104 198 110 188 108 C150 100 100 100 68 108 C60 108 58 100 66 96 Z', escurece('#5E6344', 0.2))}
      ${forma('M176 142 H222 C222 170 212 180 199 180 C186 180 176 170 176 142 Z', '#FFFFFF', 5)}
      ${forma('M180 156 H218 C216 170 208 176 199 176 C190 176 182 170 180 156 Z', '#7A1E2E', 0)}
      ${linha('M199 180 V210 M188 212 H210', 6)}
      ${forma('M184 200 C176 206 178 220 190 222 L210 222 C220 218 220 206 212 200 Z', pele, 5)}`;
  });

  def('guria-sapeca', 'Guria sapeca', () => {
    const pele = PELE.clara;
    const cabelo = '#C9722E';
    const tranca = (x) =>
      nuvem([[x, 150, 14], [x + 2, 174, 14], [x, 198, 13], [x + 2, 220, 12]], cabelo, 10) +
      forma(`M${x - 12} ${232} L${x - 16} ${248} L${x} ${238} L${x + 16} ${248} L${x + 12} ${232} Z`, P.espadas, 5);
    return `${corpo('#F0C2CF')}
      ${pescoco(pele)}
      ${tranca(62)}${tranca(192)}
      ${cabeca({ top: 72, h: 124, w: 118, pele })}
      ${forma('M68 132 C62 94 88 68 128 68 C168 68 194 94 188 132 C176 110 156 96 128 96 C100 96 80 110 68 132 Z', cabelo)}
      ${linha('M128 70 L128 96', 5)}
      ${[[92, 158], [100, 164], [86, 166], [164, 158], [172, 164], [158, 166]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${escurece(cabelo, 0.1)}"/>`).join('')}
      ${bochechas(158, 42)}
      ${olho(106, 136, { rx: 14, ry: 17, dx: 2, dy: -1 })}
      ${aperta(152, 136, -1, 10)}
      ${sobr('M92 114 Q104 108 118 114', 6)}${sobr('M140 116 Q152 112 164 118', 6)}
      ${bocaAberta(128, 172, 36, 12, { lingua: false })}
      ${forma('M124 178 C122 196 128 206 136 206 C146 206 148 194 142 178 Z', '#E86B7A', 5)}`;
  });

  def('pinhao', 'Pinhão com frio', () => {
    const casca = '#9C4A2E';
    return `${forma('M64 276 C58 200 76 120 128 70 C180 120 198 200 192 276 Z', casca)}
      <path d="M150 104 C176 140 186 200 180 276 L192 276 C198 200 180 120 128 70 Z" fill="${escurece(casca, 0.25)}" opacity=".7"/>
      ${forma('M70 240 C96 250 160 250 186 240 L190 276 L66 276 Z', '#EBD3AD')}
      ${forma('M62 212 C92 226 164 226 194 212 L196 238 C164 252 92 252 60 238 Z', P.espadas)}
      ${linha('M88 222 L84 246 M112 226 L110 250 M144 226 L146 250 M168 222 L172 246', 6, P.ouroClaro)}
      ${forma('M184 226 L204 262 L186 266 L174 234 Z', P.espadas, 5)}
      ${forma('M84 108 C84 64 104 46 128 46 C152 46 172 64 172 108 C150 98 106 98 84 108 Z', P.paus)}
      ${linha('M90 80 C110 72 146 72 166 80', 7, P.ouro)}
      ${forma('M80 104 C104 92 152 92 176 104 L178 120 C152 110 104 110 78 120 Z', P.ouro, 5)}
      ${linha('M92 104 V114 M106 101 V111 M120 100 V110 M134 100 V110 M148 101 V111 M162 104 V114', 3, P.ouroEscuro)}
      ${nuvem([[128, 40, 13]], P.copas, 10)}
      ${olho(108, 148, { rx: 14, ry: 17, pr: 5, dy: -2 })}${olho(150, 148, { rx: 14, ry: 17, pr: 5, dy: -2 })}
      ${sobr('M94 128 Q106 120 118 126', 6)}${sobr('M138 126 Q150 120 162 128', 6)}
      ${dentinhos(128, 180, 36, 15)}
      ${linha('M46 140 L38 146 L46 152 L38 158 M210 140 L218 146 L210 152 L218 158', 5)}`;
  });

  def('bugio', 'Bugio berrador', () => {
    const pelo = '#7A3A22';
    const cara = '#3B2A24';
    return `${corpo(pelo)}
      ${nuvem([[76, 104, 24], [100, 78, 24], [128, 70, 26], [156, 78, 24], [180, 104, 24], [72, 140, 22], [184, 140, 22], [84, 176, 22], [172, 176, 22], [104, 204, 24], [152, 204, 24], [128, 214, 24]], pelo)}
      ${forma('M92 124 C92 100 108 92 128 92 C148 92 164 100 164 124 C170 164 156 196 128 200 C100 196 86 164 92 124 Z', cara)}
      ${aperta(110, 124, 1, 9)}${aperta(146, 124, -1, 9)}
      ${linha('M96 108 L120 114 M160 108 L136 114', 6, '#E6C9B0')}
      <ellipse cx="122" cy="142" rx="3" ry="2.5" fill="#E6C9B0"/><ellipse cx="134" cy="142" rx="3" ry="2.5" fill="#E6C9B0"/>
      ${forma('M106 162 C106 150 150 150 150 162 C152 186 142 200 128 200 C114 200 104 186 106 162 Z', P.boca, 5)}
      <path d="M114 186 C116 176 140 176 142 186 C140 196 116 196 114 186 Z" fill="${P.lingua}"/>
      ${linha('M112 160 L116 170 M144 160 L140 170', 4, '#fff')}
      ${linha('M60 60 Q52 66 60 72 M196 60 Q204 66 196 72 M48 50 Q36 66 48 82 M208 50 Q220 66 208 82', 5)}`;
  });

  def('zorrilho', 'Zorrilho perfumado', () => {
    const pelo = '#3A3434';
    return `${corpo(pelo)}${forma('M112 204 C118 230 138 230 144 204 Z', '#F4EFE6', 4)}
      <circle cx="84" cy="84" r="16" fill="${pelo}" ${s()}/><circle cx="172" cy="84" r="16" fill="${pelo}" ${s()}/><circle cx="84" cy="86" r="7" fill="#E8A99A"/><circle cx="172" cy="86" r="7" fill="#E8A99A"/>
      ${forma('M70 130 C70 94 96 74 128 74 C160 74 186 94 186 130 C186 174 160 202 128 202 C96 202 70 174 70 130 Z', pelo)}
      ${forma('M118 76 C122 74 134 74 138 76 L136 150 C134 160 122 160 120 150 Z', '#F4EFE6', 0)}
      ${forma('M104 156 C104 144 152 144 152 156 C156 178 144 196 128 196 C112 196 100 178 104 156 Z', '#F4EFE6', 5)}
      <ellipse cx="128" cy="160" rx="10" ry="7" fill="#E8A99A" ${s(4)}/>
      ${linha('M114 178 Q128 188 142 178', 5)}
      ${linha('M88 126 Q100 134 112 126 M144 126 Q156 134 168 126', 6, '#F4EFE6')}
      ${linha('M88 110 L110 114 M146 114 L168 110', 5, '#F4EFE6')}
      ${nuvem([[200, 178, 11], [214, 162, 9], [214, 190, 8]], '#A9C94A', 8)}
      ${nuvem([[54, 176, 9], [44, 190, 7]], '#A9C94A', 8)}`;
  });

  def('ema', 'Ema curiosa', () => {
    const pena = '#9E9486';
    return `${nuvem([[40, 262, 34], [90, 244, 34], [140, 246, 34], [190, 244, 34], [226, 262, 30]], '#8C8276')}
      ${forma('M112 150 C104 190 96 220 92 256 L160 256 C154 220 146 190 144 150 Z', pena)}
      ${nuvem([[106, 58, 12], [124, 50, 13], [142, 56, 12], [96, 72, 10]], '#7E7468', 9)}
      ${forma('M76 104 C76 72 100 58 128 58 C156 58 180 72 180 104 C180 138 158 158 128 158 C98 158 76 138 76 104 Z', pena)}
      ${forma('M100 128 C100 116 156 116 156 128 C160 146 148 154 128 154 C108 154 96 146 100 128 Z', '#E9D9A8')}
      ${linha('M104 136 Q128 142 152 136', 4)}
      ${olho(106, 98, { rx: 20, ry: 22, pr: 7, dx: 6, dy: 4 })}${olho(152, 98, { rx: 20, ry: 22, pr: 7, dx: -6, dy: -4 })}`;
  });

  // ---------------------------------------------------------------- saída

  const enxuga = (svg) =>
    svg
      .replace(/-?\d+\.\d{3,}/g, (m) => String(+(+m).toFixed(2)))
      .replace(/\s*\n\s*/g, '')
      .replace(/>\s+</g, '><');

  /** SVG completo e enxuto de um avatar. */
  function avatarSvg(slug) {
    const p = personagens.find((x) => x.slug === slug);
    if (!p) throw new Error(`avatar desconhecido: ${slug}`);
    const z = p.zoom;
    const miolo = z === 1 ? p.desenha() : `<g transform="translate(128 150) scale(${z}) translate(-128 -150)">${p.desenha()}</g>`;
    return enxuga(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${miolo}</svg>`);
  }

  /** Ordem da escolha no perfil: os mais carismáticos primeiro. */
  const ORDEM = [
    'gauderio', 'capivara', 'vo-do-chinelo', 'cuia', 'tche-bagual', 'vo-do-chimarrao', 'cavalo-crioulo',
    'tio-do-churrasco', 'prenda', 'graxaim', 'cusco', 'gringo-do-vinho', 'ovelha', 'veio-de-pala',
    'maragato', 'chimango', 'guria-sapeca', 'bugio', 'ema', 'garnise', 'gaiteiro', 'quero-quero',
    'pinhao', 'guri-de-bone', 'zorrilho',
  ];
  const faltando = personagens.filter((p) => !ORDEM.includes(p.slug)).map((p) => p.slug);
  if (faltando.length || ORDEM.length !== personagens.length) throw new Error(`ORDEM desalinhada: ${faltando}`);

  globalThis.AVATARES = ORDEM.map((slug) => {
    const { label } = personagens.find((p) => p.slug === slug);
    return { slug, label };
  });
  globalThis.avatarSvg = avatarSvg;
})();
