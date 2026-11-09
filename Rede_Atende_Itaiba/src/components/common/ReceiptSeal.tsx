/** Identificação de impressão; a consulta usa o protocolo, sem QR decorativo. */
export function ReceiptSeal() {
  return (
    <p className="print-only text-xs border-t border-slate-300 pt-3">
      Comprovante acadêmico. Consulte este protocolo na sua conta do Rede Atende.
    </p>
  );
}
