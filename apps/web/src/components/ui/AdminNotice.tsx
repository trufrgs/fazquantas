import { Megaphone, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnline } from '../../stores/online';

/** Faixa com o recado da administração para a sala (lobby e mesa), até a pessoa fechar. */
export function AdminNotice({ fixed = false }: { fixed?: boolean } = {}) {
  const notice = useOnline((s) => s.notice);
  const dismiss = useOnline((s) => s.dismissNotice);
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.at}
          role="alert"
          className={`${fixed ? 'fixed' : 'absolute'} inset-x-3 z-50 mx-auto flex max-w-lg items-start gap-2 rounded-2xl bg-ouros px-3 py-2 text-tinta shadow-[0_10px_24px_rgb(0_0_0/0.45)] ring-1 ring-black/15`}
          style={{ top: fixed ? 'calc(0.75rem + var(--safe-top))' : '0.5rem' }}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
        >
          <Megaphone size="1.2rem" className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm">
            <strong>Recado da administração:</strong> {notice.text}
          </p>
          <button type="button" onClick={dismiss} aria-label="Fechar recado" className="shrink-0 rounded-full p-0.5 hover:bg-black/10">
            <X size="1.1rem" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
