import { CircleCheck, Download, Ellipsis, EllipsisVertical, MonitorSmartphone, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { instalar, useComoInstalar, type ComoInstalar } from '../../lib/instalar';
import { isNative } from '../../lib/platform';
import { storage } from '../../lib/storage';
import { Button } from '../ui/Button';
import { Panel } from '../ui/ScreenFrame';
import { Sheet } from '../ui/Sheet';

/** Ícone no meio do texto, do tamanho da letra (o mesmo desenho do botão do navegador). */
function Icone({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex translate-y-[0.15em] items-center [&>svg]:size-[1.1em]" aria-hidden="true">
      {children}
    </span>
  );
}

function Passos({ children }: { children: ReactNode }) {
  return <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[0.9375rem] marker:font-bold">{children}</ol>;
}

function ehCelular(como: ComoInstalar): boolean {
  return como === 'ios' || como === 'android' || /Android|iPhone|iPad|Mobile/.test(navigator.userAgent);
}

/** O que muda instalando, numa linha (celular ou computador). */
function Vantagens({ como }: { como: ComoInstalar }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-espadas/12 text-espadas" aria-hidden="true">
        <MonitorSmartphone size={24} />
      </span>
      <p className="text-sm text-tinta-2">
        {ehCelular(como)
          ? 'Ícone próprio na tela inicial e tela cheia, como um app. Sem loja: atualiza sozinho.'
          : 'Ícone próprio no Dock ou no menu Iniciar e janela própria, como um app. Sem loja: atualiza sozinho.'}
      </p>
    </div>
  );
}

/**
 * O caminho de cada navegador que não deixa o site pedir a instalação (iPhone e iPad, Safari do Mac,
 * Android e computador sem o pedido, Firefox).
 */
export function InstalarPassos({ como }: { como: ComoInstalar }) {
  if (como === 'ios') {
    return (
      <>
        <Passos>
          <li>
            Toca em <strong>Compartilhar</strong>
            <Icone>
              <Share />
            </Icone>
            (no Safari mais novo, ele fica dentro do botão
            <Icone>
              <Ellipsis />
            </Icone>
            ).
          </li>
          <li>
            Escolhe <strong>Adicionar à Tela de Início</strong>
            <Icone>
              <SquarePlus />
            </Icone>
            (se não aparecer, rola a lista).
          </li>
          <li>
            Toca em <strong>Adicionar</strong>.
          </li>
        </Passos>
        <p className="mt-2 text-sm text-tinta-2">
          No iPhone, é assim que o jogo avisa quando é tua vez. Instala antes de entrar numa sala: o app instalado não leva o que está no navegador (apelido,
          sala aberta).
        </p>
      </>
    );
  }
  if (como === 'mac-safari') {
    return (
      <Passos>
        <li>
          No menu <strong>Arquivo</strong> do Safari, escolhe <strong>Adicionar ao Dock</strong>.
        </li>
        <li>
          Confirma em <strong>Adicionar</strong>: o jogo abre numa janela própria, pelo Dock.
        </li>
      </Passos>
    );
  }
  if (como === 'android') {
    return (
      <Passos>
        <li>
          Abre o menu do navegador
          <Icone>
            <EllipsisVertical />
          </Icone>
          (no canto de cima).
        </li>
        <li>
          Toca em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
        </li>
      </Passos>
    );
  }
  if (como === 'computador') {
    return (
      <Passos>
        <li>
          No <strong>Chrome</strong>: clica no ícone de instalar no fim da barra de endereço, ou no menu
          <Icone>
            <EllipsisVertical />
          </Icone>
          → <strong>Transmitir, salvar e compartilhar</strong> → <strong>Instalar</strong>.
        </li>
        <li>
          No <strong>Edge</strong>: menu
          <Icone>
            <Ellipsis />
          </Icone>
          → <strong>Aplicativos</strong> → <strong>Instalar este site como um aplicativo</strong>.
        </li>
      </Passos>
    );
  }
  if (como === 'sem-suporte') {
    return (
      <p className="mt-3 text-[0.9375rem]">
        Esse navegador não instala site como app. No <strong>Chrome</strong>, no <strong>Edge</strong> ou no <strong>Safari</strong> dá, no computador e no celular.
      </p>
    );
  }
  return null;
}

function Pronto() {
  return (
    <p className="flex items-center gap-2 font-semibold text-paus">
      <CircleCheck size={20} aria-hidden="true" /> Pronto! O Faz quantas? está nos teus apps.
    </p>
  );
}

/**
 * "Instalar como app" nos Ajustes: o jogo com ícone próprio na tela inicial (no computador, no Dock ou
 * no menu Iniciar) e em tela cheia, sem loja. Um toque onde o navegador oferece; nos outros, o
 * caminho de cada um.
 */
export function InstalarApp() {
  const como = useComoInstalar();
  const [pronto, setPronto] = useState(false);
  if (isNative) return null;
  if (como === 'instalado') {
    return pronto ? (
      <Panel title="Instalar como app">
        <Pronto />
      </Panel>
    ) : null;
  }
  return (
    <Panel title="Instalar como app">
      <Vantagens como={como} />
      {como === 'pedido' ? (
        <Button
          variant="ouro"
          className="mt-3 w-full"
          onClick={async () => {
            if ((await instalar()) === 'aceitou') setPronto(true);
          }}
        >
          Instalar
        </Button>
      ) : (
        <InstalarPassos como={como} />
      )}
    </Panel>
  );
}

/** O botão de destaque do início aparece só no navegador, onde dá para instalar. */
export function mostraBotaoInstalar(como: ComoInstalar): boolean {
  return !isNative && como !== 'instalado' && como !== 'sem-suporte';
}

/** Quem já abriu a folha de instalar viu o convite: o botão segue dourado, sem o halo chamando. */
const VISTO_KEY = 'fodinha:instalar-visto';
export function convitePendente(): boolean {
  return storage.get<boolean>(VISTO_KEY) !== true;
}

/**
 * Pelo botão de destaque do início: onde o navegador deixa, confirma e já instala (o navegador ainda
 * mostra a confirmação dele, que o site não pode pular); onde não deixa, mostra o caminho.
 */
export function InstalarAppSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const como = useComoInstalar();
  const [pronto, setPronto] = useState(false);
  const [tentou, setTentou] = useState(false);
  /** O aviso do próprio navegador está aberto: a folha espera por ele (o pedido já foi usado). */
  const [aguardando, setAguardando] = useState(false);

  useEffect(() => {
    if (open) storage.set(VISTO_KEY, true);
  }, [open]);

  useEffect(() => {
    if (!pronto) return undefined;
    const t = window.setTimeout(onClose, 2200);
    return () => window.clearTimeout(t);
  }, [pronto, onClose]);

  const fechar = () => {
    setTentou(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={fechar} label="Instalar como app">
      <h2 className="font-display text-2xl font-bold" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
        {como === 'pedido' ? 'Instalar o Faz quantas?' : 'Instalar como app'}
      </h2>
      <div className="mt-3">
        {pronto || (como === 'instalado' && tentou) ? (
          <Pronto />
        ) : aguardando ? (
          <p role="status" className="font-semibold">
            Confirma no aviso do navegador.
          </p>
        ) : (
          <>
            <Vantagens como={como} />
            {como === 'pedido' ? (
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="ouro"
                  size="lg"
                  icon={<Download size={20} />}
                  onClick={async () => {
                    setTentou(true);
                    setAguardando(true);
                    const r = await instalar();
                    setAguardando(false);
                    if (r === 'aceitou') setPronto(true);
                    else if (r === 'recusou') fechar();
                    // 'indisponivel': a folha mostra o caminho pelo menu do navegador.
                  }}
                >
                  Instalar agora
                </Button>
                <Button variant="papel" onClick={fechar}>
                  Agora não
                </Button>
              </div>
            ) : (
              <>
                <InstalarPassos como={como} />
                <Button variant="papel" className="mt-4 w-full" onClick={fechar}>
                  Entendi
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
