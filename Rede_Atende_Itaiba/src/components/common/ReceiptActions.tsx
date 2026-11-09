import { useState } from 'react';
export function ReceiptActions({ protocol }: { protocol: string }) {
  const [feedback, setFeedback] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(protocol);
      setFeedback('Protocolo copiado.');
    } catch {
      setFeedback(`Não foi possível copiar automaticamente. Selecione o número: ${protocol}`);
    }
  };
  const print = () => {
    document.body.classList.add('printing-receipt');
    const cleanup = () => document.body.classList.remove('printing-receipt');
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch {
      cleanup();
      setFeedback('Não foi possível abrir a impressão. Tente novamente.');
    }
  };
  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="action secondary-action" onClick={copy}>
          Copiar protocolo
        </button>
        <button type="button" className="action secondary-action" onClick={print}>
          Imprimir comprovante
        </button>
      </div>
      {feedback && (
        <p className="text-xs text-slate-700" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
