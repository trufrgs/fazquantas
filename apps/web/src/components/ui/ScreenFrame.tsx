import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../../stores/app';
import { IconButton } from './Button';

/** Moldura das telas de menu: mesa ao fundo, cabeçalho com voltar e título. */
export function ScreenFrame({
  title,
  children,
  footer,
  onBack,
  right,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const back = useApp((s) => s.back);
  return (
    <div className="mesa flex h-full flex-col">
      <header
        className="flex items-center gap-3 px-4 pb-2"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}
      >
        <IconButton label="Voltar" onClick={onBack ?? back}>
          <ArrowLeft size={22} />
        </IconButton>
        <h1
          className="flex-1 font-display text-3xl font-bold texto-gravado"
          style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
        >
          {title}
        </h1>
        {right}
      </header>
      <main className="sem-barra min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4">{children}</div>
      </main>
      {footer && (
        <footer className="px-4 pt-2" style={{ paddingBottom: 'calc(1rem + var(--safe-bottom))' }}>
          <div className="mx-auto w-full max-w-lg">{footer}</div>
        </footer>
      )}
    </div>
  );
}

/** Painel de papel para agrupar conteúdo nas telas de menu. */
export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`papel rounded-[24px] p-4 shadow-[0_10px_28px_rgb(0_0_0/0.35)] ${className ?? ''}`}>
      {title && (
        <h2 className="mb-2 font-display text-xl font-bold" style={{ fontVariationSettings: '"SOFT" 100' }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
