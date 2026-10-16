'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function Field({
  label, type = 'text', value, onChange, autoComplete, placeholder, inputMode, maxLength, autoFocus,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string;
  placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: number; autoFocus?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-medium text-cream/80">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPw && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className="w-full rounded-xl border border-line bg-inset px-4 py-3 text-[15px] text-cream placeholder:text-muted/60 outline-none transition-colors focus:border-gold/70 focus:bg-inset"
        />
        {isPw && (
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-cream">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-[13.5px] text-danger-ink">{message}</p>;
}

export function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading} className="btn-gold w-full">
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" aria-label="Working" /> : children}
    </button>
  );
}
