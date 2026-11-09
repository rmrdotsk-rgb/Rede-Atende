import { useEffect, useRef, useState } from 'react';
import { UploadCloud, Paperclip, FileCheck } from 'lucide-react';

export function RequestAttachment({
  file,
  error,
  onChange,
}: {
  file: File | null;
  error: string;
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const size = file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : '';
  return (
    <section className="space-y-3" aria-labelledby="attachment-title">
      <div
        className="border border-dashed border-slate-400 rounded-xl p-4 bg-slate-50"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files[0]) onChange(event.dataTransfer.files[0]);
        }}
      >
        <h2 id="attachment-title" className="font-bold flex items-center gap-2">
          <UploadCloud className="w-5 h-5 shrink-0 text-blue-700" aria-hidden="true" />
          Anexo opcional
        </h2>
        <p className="text-sm text-slate-600 mt-2">
          Arraste um arquivo ou selecione abaixo. JPG, PNG ou PDF de até 5 MB. O envio é privado e
          acontece após o registro da solicitação.
        </p>
        <label className="action secondary-action mt-3 cursor-pointer gap-2 focus-within:outline-2 focus-within:outline-blue-700">
          <Paperclip className="w-4 h-4" aria-hidden="true" />
          Selecionar Arquivo
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
            onChange={(event) => {
              if (event.target.files?.[0]) onChange(event.target.files[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-red-800 text-sm">
          {error}
        </p>
      )}
      {file && (
        <div className="space-y-3" role="region" aria-label="Pré-visualização do anexo">
          <p className="text-sm flex items-start gap-2 text-emerald-800">
            <FileCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
            {file.name} · {size}. Arquivo selecionado para envio privado ao servidor.
          </p>
          {preview && (
            <img
              src={preview}
              alt="Pré-visualização do anexo selecionado"
              className="max-h-56 rounded-lg object-contain"
            />
          )}
          {file.type === 'application/pdf' && (
            <p className="text-sm text-slate-600">
              Pré-visualização de PDF indisponível. O arquivo será validado no envio.
            </p>
          )}
          <button
            type="button"
            className="action secondary-action"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            Remover anexo
          </button>
        </div>
      )}
    </section>
  );
}
