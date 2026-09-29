import { CircleCheck, Ellipsis, EllipsisVertical, MonitorSmartphone, Share, SquarePlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { instalar, useComoInstalar } from '../../lib/instalar';
import { isNative } from '../../lib/platform';
import { Button } from '../ui/Button';
import { Panel } from '../ui/ScreenFrame';

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

/**
 * "Instalar como app": o jogo com ícone próprio na tela inicial (no computador, no Dock ou no menu
 * Iniciar) e em tela cheia, sem loja. Um toque onde o navegador oferece; nos outros, o caminho de
 * cada um (iPhone, Safari do Mac, Android, Chrome e Edge no computador).
 */
export function InstalarApp() {
  const como = useComoInstalar();
  const [pronto, setPronto] = useState(false);
  if (isNative) return null;
  const celular = como === 'ios' || como === 'android' || /Android|iPhone|iPad|Mobile/.test(navigator.userAgent);
  if (como === 'instalado') {
    return pronto ? (
      <Panel title="Instalar como app">
        <p className="flex items-center gap-2 font-semibold text-paus">
          <CircleCheck size={20} aria-hidden="true" /> Pronto! O Faz quantas? está nos teus apps.
        </p>
      </Panel>
    ) : null;
  }
  return (
    <Panel title="Instalar como app">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-espadas/12 text-espadas" aria-hidden="true">
          <MonitorSmartphone size={24} />
        </span>
        <p className="text-sm text-tinta-2">
          {celular
            ? 'Ícone próprio na tela inicial e tela cheia, como um app. Sem loja: atualiza sozinho.'
            : 'Ícone próprio no Dock ou no menu Iniciar e janela própria, como um app. Sem loja: atualiza sozinho.'}
        </p>
      </div>

      {como === 'pedido' && (
        <Button
          variant="ouro"
          className="mt-3 w-full"
          onClick={async () => {
            if ((await instalar()) === 'aceitou') setPronto(true);
          }}
        >
          Instalar
        </Button>
      )}

      {como === 'ios' && (
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
      )}

      {como === 'mac-safari' && (
        <Passos>
          <li>
            No menu <strong>Arquivo</strong> do Safari, escolhe <strong>Adicionar ao Dock</strong>.
          </li>
          <li>
            Confirma em <strong>Adicionar</strong>: o jogo abre numa janela própria, pelo Dock.
          </li>
        </Passos>
      )}

      {como === 'android' && (
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
      )}

      {como === 'computador' && (
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
      )}

      {como === 'sem-suporte' && (
        <p className="mt-3 text-[0.9375rem]">
          Esse navegador não instala site como app. No <strong>Chrome</strong>, no <strong>Edge</strong> ou no <strong>Safari</strong> dá, no computador e no celular.
        </p>
      )}
    </Panel>
  );
}
