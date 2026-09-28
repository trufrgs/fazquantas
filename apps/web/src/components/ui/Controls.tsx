import type { ReactNode } from 'react';
import { play } from '../../lib/sound';

export interface SegmentedProps<T extends string | number | null> {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  dark?: boolean;
}

/** Botões lado a lado para escolher uma opção. */
export function Segmented<T extends string | number | null>({ value, options, onChange, label, dark }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-1 rounded-2xl p-1 ${dark ? 'bg-noite/45 ring-1 ring-papel/10' : 'bg-tinta/8 ring-1 ring-tinta/10'}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              play('click');
              onChange(o.value);
            }}
            className={`min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold transition ${
              active
                ? dark
                  ? 'bg-papel text-tinta shadow'
                  : 'bg-tinta text-papel shadow'
                : dark
                  ? 'text-papel/80'
                  : 'text-tinta/70'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        play('click');
        onChange(!checked);
      }}
      className="flex w-full items-center justify-between gap-4 py-3 text-left"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {description && <span className="block text-sm opacity-70">{description}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-paus' : 'bg-tinta/25'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  format?: (v: number) => ReactNode;
  dark?: boolean;
}

export function Stepper({ value, min, max, onChange, label, format, dark }: StepperProps) {
  const btn = `h-11 w-11 rounded-full text-2xl font-bold leading-none transition active:scale-95 disabled:opacity-30 ${
    dark ? 'bg-papel/12 text-papel' : 'bg-tinta/10 text-tinta'
  }`;
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => { play('click'); onChange(value - 1); }}>
        −
      </button>
      <span className="min-w-12 text-center font-display text-2xl font-bold tabular-nums" aria-live="polite">
        {format ? format(value) : value}
      </span>
      <button type="button" className={btn} aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => { play('click'); onChange(value + 1); }}>
        +
      </button>
    </div>
  );
}
