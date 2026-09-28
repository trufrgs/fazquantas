// O Gaudério, símbolo do Faz quantas?: o parceiro de chapéu campeiro tombado, bigodão e lenço, na
// rodada de uma carta. A mesa toda vê a carta na testa dele; só ele não.
//
// Cada função devolve o miolo de um <svg viewBox="0 0 1024 1024">. Script comum (sem módulos) para
// abrir direto do disco em brand/marca.html.

const PALETA = {
  copas: '#C4372D', copasEscuro: '#8E231C', copasClaro: '#E0584B',
  papel: '#FBF2DF', papel2: '#EBDFC4',
  tinta: '#2B1D14', noite: '#1D120B',
  ouro: '#E3A82B', ouroEscuro: '#A8741A', ouroClaro: '#F6D77A',
  espadas: '#2E5C9C', paus: '#3D7A3A',
  pala: '#5B3A24',
};

let seqId = 0;
/** Ids únicos: a mesma página desenha o símbolo várias vezes. */
const novoId = (prefixo) => `${prefixo}${++seqId}`;

function gradienteOuro(id) {
  const P = PALETA;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${P.ouroEscuro}"/><stop offset=".18" stop-color="${P.ouroClaro}"/>
    <stop offset=".5" stop-color="${P.ouro}"/><stop offset="1" stop-color="${P.ouroEscuro}"/></linearGradient>`;
}

/** Fundo vermelho de copas com a luz do lampião por cima. */
function fundoCopas() {
  const id = novoId('fundo');
  return `<defs>
    <radialGradient id="${id}b" cx=".5" cy=".3" r=".78"><stop offset="0" stop-color="${PALETA.copas}"/><stop offset="1" stop-color="${PALETA.copasEscuro}"/></radialGradient>
    <radialGradient id="${id}l" cx=".5" cy=".22" r=".55"><stop offset="0" stop-color="#FFE7B8" stop-opacity=".3"/><stop offset="1" stop-color="#FFE7B8" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#${id}b)"/><rect width="1024" height="1024" fill="url(#${id}l)"/>`;
}

/** A copa do ás de copas do Fournier 1878, simplificada para caber na carta. Centro em (512, 482). */
function copaDoAs() {
  const P = PALETA;
  const o = novoId('ouro');
  const s = `stroke="${P.tinta}" stroke-width="18" stroke-linejoin="round"`;
  return `<defs>${gradienteOuro(o)}</defs>
    <path d="M512 92 L530 150 L494 150 Z" fill="url(#${o})" ${s}/>
    <circle cx="512" cy="170" r="30" fill="${P.espadas}" ${s}/>
    <path d="M392 348 C392 282 452 250 480 214 C492 198 500 192 512 192 C524 192 532 198 544 214 C572 250 632 282 632 348 Z" fill="url(#${o})" ${s}/>
    <rect x="370" y="338" width="284" height="38" rx="12" fill="${P.paus}" ${s}/>
    <path d="M356 380 L668 380 C668 482 616 548 566 568 L458 568 C408 548 356 482 356 380 Z" fill="url(#${o})" ${s}/>
    <path d="M362 396 L662 396 L656 446 L368 446 Z" fill="${P.copas}" stroke="${P.tinta}" stroke-width="6"/>
    <path d="M374 462 L650 462 C646 476 641 486 634 494 L390 494 C383 486 378 476 374 462 Z" fill="${P.paus}" stroke="${P.tinta}" stroke-width="6"/>
    <rect x="488" y="566" width="48" height="30" fill="url(#${o})" ${s}/>
    <ellipse cx="512" cy="622" rx="56" ry="33" fill="${P.copas}" ${s}/>
    <path d="M494 652 L530 652 L526 714 L498 714 Z" fill="url(#${o})" ${s}/>
    <path d="M498 708 C488 770 412 800 380 838 L644 838 C612 800 536 770 526 708 Z" fill="url(#${o})" ${s}/>
    <rect x="352" y="834" width="320" height="38" rx="10" fill="${P.espadas}" ${s}/>`;
}

/** Carta do baralho espanhol virada para a mesa: moldura de copas (uma interrupção) e o ás de copas. */
function cartaNaTesta({ cx, cy, w, rot }) {
  const P = PALETA;
  const h = w * 1.6;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const m = w * 0.1;
  const esc = w * 0.001;
  const sombra = novoId('sombra');
  return `<defs><filter id="${sombra}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${w * 0.04}" stdDeviation="${w * 0.045}" flood-color="#000" flood-opacity=".45"/></filter></defs>
  <g transform="rotate(${rot} ${cx} ${cy})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.09}" fill="${P.papel}" stroke="${P.tinta}" stroke-width="${w * 0.035}" filter="url(#${sombra})"/>
    <path d="M${x + m} ${y + m} H${cx - w * 0.07} M${cx + w * 0.07} ${y + m} H${x + w - m} V${y + h - m} H${cx + w * 0.07} M${cx - w * 0.07} ${y + h - m} H${x + m} Z" fill="none" stroke="${P.tinta}" stroke-width="${w * 0.019}" opacity=".55"/>
    <g transform="translate(${cx - 512 * esc} ${cy - 482 * esc}) scale(${esc})">${copaDoAs()}</g>
  </g>`;
}

/**
 * O Gaudério. `fundo: false` desenha só o personagem (frente do ícone adaptativo, artes sobre a
 * mesa). Os ombros descem além da borda para o recorte do sistema nunca mostrar o fim do busto.
 */
function gauderio({ fundo = true } = {}) {
  const P = PALETA;
  const t = P.tinta;
  const aba = novoId('aba');
  const olho = (cx, lado) => `
    <ellipse cx="${cx}" cy="648" rx="60" ry="70" fill="#fff" stroke="${t}" stroke-width="12"/>
    <circle cx="${cx - lado * 14}" cy="607" r="28" fill="${t}"/>
    <circle cx="${cx - lado * 14 - 10}" cy="597" r="9" fill="#fff"/>`;
  const barbicacho = 'M262 470 C236 560 250 700 300 800 C350 880 430 928 512 930 C594 928 674 880 724 800 C774 700 788 560 762 470';
  return `${fundo ? fundoCopas() : ''}
  <defs><radialGradient id="${aba}" cx=".5" cy=".62" r=".6"><stop offset="0" stop-color="#1B120C"/><stop offset=".75" stop-color="#3B291D"/><stop offset="1" stop-color="#5A4030"/></radialGradient></defs>
  <g transform="rotate(-4 512 640)">
    <ellipse cx="512" cy="430" rx="356" ry="150" fill="url(#${aba})" stroke="${t}" stroke-width="14"/>
    <path d="M300 404 C340 330 430 300 512 300 C594 300 684 330 724 404" fill="none" stroke="#6B4A36" stroke-width="10" opacity=".8"/>
    <path d="M150 1400 L150 1024 C160 930 270 884 392 876 L632 876 C754 884 864 930 874 1024 L874 1400 Z" fill="${P.pala}" stroke="${t}" stroke-width="12"/>
    <path d="M300 930 L360 1024 M724 930 L664 1024" stroke="${t}" stroke-width="10" opacity=".45"/>
    <path d="M384 872 C430 910 594 910 640 872 L664 930 C600 968 424 968 360 930 Z" fill="${P.ouro}" stroke="${t}" stroke-width="12" stroke-linejoin="round"/>
    <path d="M478 948 L436 1024 L500 1024 L512 968 L524 1024 L588 1024 L546 948 Z" fill="${P.ouro}" stroke="${t}" stroke-width="12" stroke-linejoin="round"/>
    <path d="M470 912 C490 900 534 900 554 912 L562 964 C540 978 484 978 462 964 Z" fill="${P.ouroEscuro}" stroke="${t}" stroke-width="12" stroke-linejoin="round"/>
    <ellipse cx="238" cy="664" rx="44" ry="62" fill="${P.papel}" stroke="${t}" stroke-width="14"/>
    <ellipse cx="786" cy="664" rx="44" ry="62" fill="${P.papel}" stroke="${t}" stroke-width="14"/>
    <path d="M232 650 q14 -18 22 6 M792 650 q-14 -18 -22 6" fill="none" stroke="${t}" stroke-width="8" stroke-linecap="round" opacity=".5"/>
    <path d="M252 660 C252 470 369 360 512 360 C655 360 772 470 772 660 C772 830 663 910 512 910 C361 910 252 830 252 660 Z" fill="${P.papel}" stroke="${t}" stroke-width="14"/>
    <path d="M772 660 C772 470 655 360 512 360 C616 400 706 500 706 660 C710 800 642 880 540 906 C681 890 772 820 772 660 Z" fill="${P.papel2}" opacity=".9"/>
    <path d="${barbicacho}" fill="none" stroke="${t}" stroke-width="14" stroke-linecap="round"/>
    <path d="${barbicacho}" fill="none" stroke="#8A6A50" stroke-width="5" stroke-linecap="round"/>
    <rect x="494" y="914" width="36" height="30" rx="8" fill="${P.ouro}" stroke="${t}" stroke-width="8"/>
    <path d="M254 640 C250 560 262 500 288 470 L300 600 Z M770 640 C774 560 762 500 736 470 L724 600 Z" fill="${t}"/>
    <ellipse cx="350" cy="760" rx="52" ry="32" fill="${P.copasClaro}" opacity=".45"/>
    <ellipse cx="674" cy="760" rx="52" ry="32" fill="${P.copasClaro}" opacity=".45"/>
    <path d="M352 556 Q414 496 480 540" fill="none" stroke="${t}" stroke-width="26" stroke-linecap="round"/>
    <path d="M546 548 Q610 526 672 548" fill="none" stroke="${t}" stroke-width="26" stroke-linecap="round"/>
    ${olho(420, -1)}${olho(604, 1)}
    <path d="M512 790 C470 764 414 764 372 790 C336 812 306 796 298 764 C278 810 312 852 372 850 C428 848 476 830 512 812 C548 830 596 848 652 850 C712 852 746 810 726 764 C718 796 688 812 652 790 C610 764 554 764 512 790 Z" fill="${t}"/>
    <path d="M446 862 Q506 896 580 852" fill="none" stroke="${t}" stroke-width="13" stroke-linecap="round"/>
  </g>
  ${cartaNaTesta({ cx: 506, cy: 300, w: 244, rot: -9 })}`;
}

/**
 * Versão de uma cor só (ícone temático do Android 13+): o que é claro no desenho vira cheio e o
 * que é escuro vira vazado. Sobram o rosto, os olhos, o bigode recortado, a carta e o lenço.
 */
function gauderioMono({ escala = 1 } = {}) {
  const id = novoId('mono');
  const d = (1024 * (1 - escala)) / 2;
  return `<defs><filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 0"/>
      <feComponentTransfer><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>
    </filter></defs>
    <g filter="url(#${id})"><g transform="translate(${d} ${d}) scale(${escala})">${gauderio({ fundo: false })}</g></g>`;
}

// O que brand/marca.html usa.
Object.assign(globalThis, { PALETA, fundoCopas, gauderio, gauderioMono });
