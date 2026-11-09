import { storageService } from '../../services/storage';
export function AttachmentLinks({ requestId }: { requestId: string }) {
  const files = storageService.getAttachments(requestId);
  if (!files.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold">Anexos privados</h3>
      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.id}>
            <a
              className="text-blue-800 underline text-sm break-all"
              href={`/api/v1/attachments/${file.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Baixar {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
