import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';

/**
 * Botão de ação que não tem volta (encerrar mesa, bloquear): o primeiro toque arma, o segundo
 * confirma. Sem o segundo toque em 5 s, desarma sozinho.
 */
export function Confirmar({
  children,
  confirmar,
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  confirmar: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return undefined;
    const t = setTimeout(() => setArmado(false), 5000);
    return () => clearTimeout(t);
  }, [armado]);
  if (!armado) {
    return (
      <Button size="sm" variant="copas" disabled={disabled} onClick={() => setArmado(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="copas"
        onClick={() => {
          setArmado(false);
          onConfirm();
        }}
      >
        {confirmar}
      </Button>
      <Button size="sm" onClick={() => setArmado(false)}>
        Cancelar
      </Button>
    </span>
  );
}
