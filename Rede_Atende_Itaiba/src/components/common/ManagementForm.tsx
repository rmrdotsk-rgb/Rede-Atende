import { useState, type FormHTMLAttributes } from 'react';
import { storageService } from '../../services/storage';
export function ManagementForm({
  children,
  onSubmit,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const [busy, setBusy] = useState(false);
  const readOnly = storageService.user?.role === 'auditor';
  return (
    <form
      {...props}
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || readOnly) return;
        setBusy(true);
        try {
          await onSubmit?.(event);
        } finally {
          setBusy(false);
        }
      }}
    >
      {readOnly && (
        <p className="text-sm mb-3 text-blue-900">
          Perfil auditor: consulta disponível, alterações bloqueadas.
        </p>
      )}
      <fieldset disabled={readOnly || busy} className="contents">
        {children}
      </fieldset>
      {busy && (
        <p role="status" className="text-sm">
          Enviando ao servidor...
        </p>
      )}
    </form>
  );
}
