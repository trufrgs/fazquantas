import {
  MAX_CARDS_OPTIONS,
  MAX_LIVES,
  MIN_LIVES,
  PRESETS,
  presetOf,
  type BlindRound,
  type HierarchyMode,
  type PenaltyMode,
  type PresetId,
  type Progression,
  type Rules,
  type TieRule,
} from '@fodinha/engine';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Segmented, Stepper, Toggle } from '../ui/Controls';

const HIERARCHY_LABEL: Record<HierarchyMode, string> = { gaucha: 'Gaúcha', vira: 'Com vira', mineira: 'Mineira' };
const TIE_LABEL: Record<TieRule, string> = { cancel: 'empardam', nobody: 'ninguém leva', suit: 'naipe desempata' };
const PROGRESSION_LABEL: Record<Progression, string> = { up: 'subindo', down: 'descendo', upDown: 'sobe e desce' };
const PROGRESSION_HINT: Record<Progression, string> = {
  up: '1 carta, depois 2, 3… até o máximo, e volta pra 1 (serrote).',
  down: 'Começa com o máximo de cartas e desce até 1; depois volta pro máximo.',
  upDown: 'Sobe de 1 até o máximo e desce de volta até 1 (pirâmide).',
};
const TIE_HINT: Record<TieRule, string> = {
  nobody: 'Se as maiores empardam, ninguém leva a mão e quem começou começa de novo.',
  cancel: 'As iguais se anulam e leva a maior que sobrou.',
  suit: 'O naipe decide: ouros < espadas < copas < paus.',
};

/** Resumo em uma linha, para quem só lê as regras (convidados da sala). */
export function rulesSummary(r: Rules): string {
  const parts = [
    HIERARCHY_LABEL[r.hierarchy],
    `${r.startingLives} ${r.startingLives === 1 ? 'vida' : 'vidas'}`,
    r.penalty === 'fixed' ? 'quem erra perde 1' : 'quem erra perde a diferença',
    `cartas iguais: ${TIE_LABEL[r.tieRule]}`,
    `cartas ${PROGRESSION_LABEL[r.progression]}`,
  ];
  if (r.maxCards) parts.push(`máx. ${r.maxCards} cartas`);
  if (r.blindRound === 'off') parts.push('sem rodada cega');
  if (!r.dealerRestriction) parts.push('sem regra do pé');
  return parts.join(', ');
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <span className="block font-semibold">{label}</span>
      {hint && <span className="mb-2 block text-sm opacity-70">{hint}</span>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}

export interface RulesEditorProps {
  value: Rules;
  onChange: (rules: Rules) => void;
  /** Estilo claro (sobre papel) ou escuro (sobre a mesa). */
  dark?: boolean;
}

export function RulesEditor({ value, onChange, dark }: RulesEditorProps) {
  const [open, setOpen] = useState(false);
  const preset = presetOf(value);
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => onChange({ ...value, [k]: v });

  return (
    <div>
      <Segmented<PresetId | 'custom'>
        label="Conjunto de regras"
        dark={dark}
        value={preset ?? 'custom'}
        onChange={(id) => {
          const p = PRESETS.find((x) => x.id === id);
          if (p) onChange({ ...p.rules });
          else setOpen(true);
        }}
        options={[...PRESETS.map((p) => ({ value: p.id as PresetId | 'custom', label: p.name })), { value: 'custom', label: 'Minha' }]}
      />
      <p className={`mt-2 text-sm ${dark ? 'text-papel/75' : 'text-tinta-2'}`}>
        {PRESETS.find((p) => p.id === preset)?.description ?? rulesSummary(value)}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`mt-2 flex items-center gap-1 text-sm font-bold underline-offset-4 hover:underline ${dark ? 'text-luz' : 'text-espadas'}`}
        aria-expanded={open}
      >
        {open ? 'Esconder regras' : 'Ajustar regras'}
        <ChevronDown size="1rem" className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`mt-2 divide-y ${dark ? 'divide-papel/10' : 'divide-tinta/10'}`}>
          <Field label="Força das cartas" hint="Gaúcha: espadão, bastião, 7 de espadas e 7 de ouros são manilhas fixas.">
            <Segmented<HierarchyMode>
              label="Força das cartas"
              dark={dark}
              value={value.hierarchy}
              onChange={(v) => set('hierarchy', v)}
              options={[
                { value: 'gaucha', label: 'Gaúcha' },
                { value: 'vira', label: 'Com vira' },
                { value: 'mineira', label: 'Mineira' },
              ]}
            />
          </Field>
          <Field label="Vidas (palitos)">
            <Stepper label="vidas" dark={dark} value={value.startingLives} min={MIN_LIVES} max={MAX_LIVES} onChange={(v) => set('startingLives', v)} />
          </Field>
          <Field
            label="Quem erra a cantada perde"
            hint={value.penalty === 'fixed' ? 'Errou, perde 1, erre por quanto errar.' : 'Um pra cada mão de diferença: cantou 2 e fez 0, perde 2.'}
          >
            <Segmented<PenaltyMode>
              label="Penalidade"
              dark={dark}
              value={value.penalty}
              onChange={(v) => set('penalty', v)}
              options={[
                { value: 'fixed', label: '1 vida' },
                { value: 'difference', label: 'A diferença' },
              ]}
            />
          </Field>
          <Field label="Cartas iguais na mão" hint={TIE_HINT[value.tieRule]}>
            <Segmented<TieRule>
              label="Empate"
              dark={dark}
              value={value.tieRule}
              onChange={(v) => set('tieRule', v)}
              options={[
                { value: 'nobody', label: 'Ninguém leva' },
                { value: 'cancel', label: 'Empardam' },
                { value: 'suit', label: 'Naipe desempata' },
              ]}
            />
          </Field>
          <Field label="Rodada às cegas (carta na testa)">
            <Segmented<BlindRound>
              label="Rodada às cegas"
              dark={dark}
              value={value.blindRound}
              onChange={(v) => set('blindRound', v)}
              options={[
                { value: 'all', label: 'Toda de 1 carta' },
                { value: 'first', label: 'Só a primeira' },
                { value: 'off', label: 'Nunca' },
              ]}
            />
          </Field>
          <Toggle
            checked={value.dealerRestriction}
            onChange={(v) => set('dealerRestriction', v)}
            label="Regra do pé"
            description="Quem palpita por último não pode fazer a soma dos palpites bater com o número de cartas."
          />
          {value.dealerRestriction && value.blindRound !== 'off' && (
            <Toggle
              checked={value.dealerRestrictionInBlind}
              onChange={(v) => set('dealerRestrictionInBlind', v)}
              label="Regra do pé na rodada às cegas"
            />
          )}
          <Field label="Cartas por rodada" hint={PROGRESSION_HINT[value.progression]}>
            <Segmented<Progression>
              label="Cartas por rodada"
              dark={dark}
              value={value.progression}
              onChange={(v) => set('progression', v)}
              options={[
                { value: 'up', label: 'Subindo' },
                { value: 'down', label: 'Descendo' },
                { value: 'upDown', label: 'Sobe e desce' },
              ]}
            />
          </Field>
          <Toggle
            checked={value.restartOnElimination}
            onChange={(v) => set('restartOnElimination', v)}
            label={value.progression === 'down' ? 'Recomeçar do máximo quando alguém sai' : 'Recomeçar em 1 carta quando alguém sai'}
          />
          <Field label="Máximo de cartas por rodada">
            <Segmented<number | null>
              label="Máximo de cartas"
              dark={dark}
              value={value.maxCards}
              onChange={(v) => set('maxCards', v)}
              options={[{ value: null, label: 'Auto' }, ...MAX_CARDS_OPTIONS.map((n) => ({ value: n as number | null, label: String(n) }))]}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
