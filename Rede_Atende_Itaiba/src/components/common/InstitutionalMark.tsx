import { Landmark } from 'lucide-react';
/** Identidade acadêmica inspirada em portais públicos; NÃO representa brasão oficial. */
export function InstitutionalMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="flex items-center gap-2"
      aria-label="Identificação visual demonstrativa do Rede Atende"
    >
      <span
        className="h-11 w-11 shrink-0 rounded-xl bg-blue-900 text-white flex items-center justify-center border-2 border-amber-400"
        aria-hidden="true"
      >
        <Landmark className="h-6 w-6" />
      </span>
      <span className="leading-tight">
        <strong className="block text-sm text-slate-900">
          Rede Atende<span className="brand-place"> · Itaíba–PE</span>
        </strong>
        {!compact && (
          <small className="block text-xs text-slate-600">
            Identidade acadêmica ilustrativa · não é um portal oficial
          </small>
        )}
      </span>
    </div>
  );
}
