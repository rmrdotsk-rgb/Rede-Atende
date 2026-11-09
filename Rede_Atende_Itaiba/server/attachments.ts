import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { config } from './config';
import { transaction } from './db/database';
import { loadScope, saveState } from './db/repository';
import { validateFileStructure } from './fileValidation';
import { audit, digest, HttpError, type User } from './auth';
import { assertRequestAccess } from './requestAccess';

type AttachmentRow = {
  id: string;
  request_id: string;
  name: string;
  mime: string;
  size: number;
  storage_name: string;
  sha256: string;
  fingerprint?: string;
};
const publicFile = (file: AttachmentRow) => ({
  id: file.id,
  requestId: file.request_id,
  name: file.name,
  mime: file.mime,
  size: file.size,
});
async function verifyStored(file: AttachmentRow) {
  const bytes = await readFile(resolve(config.uploadDir, file.storage_name));
  if (bytes.length !== file.size || digest(bytes) !== file.sha256)
    throw new HttpError(
      503,
      'Anexo temporariamente indisponível. Nenhum novo arquivo foi confirmado.',
    );
  return publicFile(file);
}

export async function receiveAttachment(req: FastifyRequest, user: User, id: string) {
  await transaction((sql) => assertRequestAccess(sql, user, id));
  const suppliedKey = z.string().min(16).max(150).optional().parse(req.headers['idempotency-key']);
  const file = await req.file();
  if (!file) throw new HttpError(400, 'Selecione um arquivo.');
  const buffer = await file.toBuffer();
  let mime = '';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    mime = 'image/png';
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mime = 'image/jpeg';
  else if (buffer.subarray(0, 5).toString() === '%PDF-') mime = 'application/pdf';
  const extension =
    mime === 'image/png' ? /\.png$/i : mime === 'image/jpeg' ? /\.jpe?g$/i : /\.pdf$/i;
  if (!mime || mime !== file.mimetype || !extension.test(file.filename) || buffer.length === 0)
    throw new HttpError(400, 'Assinatura, tipo MIME ou extensão do arquivo inválidos.');
  validateFileStructure(buffer, mime);
  if (
    mime === 'application/pdf' &&
    /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/.test(buffer.toString('latin1'))
  )
    throw new HttpError(400, 'PDF com conteúdo ativo não é permitido.');
  const name = basename(file.filename)
      .replace(/[\x00-\x1f\x7f<>]/g, '_')
      .slice(0, 180),
    sha256 = digest(buffer);
  const fingerprint = digest(JSON.stringify({ name, mime, size: buffer.length, sha256 }));
  // Clientes anteriores sem cabeçalho reconciliam conteúdo e metadados iguais.
  const key = suppliedKey ?? `legacy-${fingerprint}`;
  let createdPath: string | undefined,
    createdId: string | undefined,
    ownsFile = false;
  try {
    return await transaction(async (sql) => {
      await assertRequestAccess(sql, user, id);
      const prior = await sql.query<AttachmentRow>(
        `SELECT a.*,k.fingerprint FROM attachment_upload_keys k JOIN attachments a ON a.id=k.attachment_id WHERE k.user_id=$1 AND k.request_id=$2 AND k.key=$3`,
        [user.id, id, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].fingerprint !== fingerprint)
          throw new HttpError(409, 'Esta chave de envio de anexo já foi usada com outro arquivo.');
        return verifyStored(prior.rows[0]);
      }
      if (!suppliedKey) {
        const legacy = await sql.query<AttachmentRow>(
          'SELECT * FROM attachments WHERE uploader_id=$1 AND request_id=$2 AND sha256=$3 AND name=$4 AND mime=$5 ORDER BY created_at LIMIT 1',
          [user.id, id, sha256, name, mime],
        );
        if (legacy.rows[0]) {
          const result = await verifyStored(legacy.rows[0]);
          await sql.query(
            'INSERT INTO attachment_upload_keys(user_id,request_id,key,fingerprint,attachment_id) VALUES($1,$2,$3,$4,$5)',
            [user.id, id, key, fingerprint, legacy.rows[0].id],
          );
          return result;
        }
      }
      const count = await sql.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM attachments WHERE request_id=$1',
        [id],
      );
      if (Number(count.rows[0].count) >= 5)
        throw new HttpError(422, 'Limite de cinco anexos por solicitação.');
      const fileId = randomUUID(),
        storageName = randomUUID();
      await mkdir(config.uploadDir, { recursive: true, mode: 0o700 });
      createdPath = resolve(config.uploadDir, storageName);
      createdId = fileId;
      await writeFile(createdPath, buffer, { mode: 0o600, flag: 'wx' });
      ownsFile = true;
      await sql.query(
        'INSERT INTO attachments(id,request_id,uploader_id,storage_name,name,mime,size,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [fileId, id, user.id, storageName, name, mime, buffer.length, sha256],
      );
      await sql.query(
        'INSERT INTO attachment_upload_keys(user_id,request_id,key,fingerprint,attachment_id) VALUES($1,$2,$3,$4,$5)',
        [user.id, id, key, fingerprint, fileId],
      );
      const state = await loadScope(sql, { requestId: id }),
        before = structuredClone(state),
        request = state.requests.find((r) => r.id === id)!;
      request.attachmentName = name;
      request.attachmentSize = `${(buffer.length / 1048576).toFixed(2)} MB`;
      await saveState(sql, state, before, user);
      await audit(sql, user, 'attachment.upload', fileId);
      return { id: fileId, requestId: id, name, mime, size: buffer.length };
    });
  } catch (error) {
    // Em erro de commit incerto, mantenha o binário até confirmar ausência do registro.
    if (ownsFile && createdPath && createdId) {
      try {
        const existing = await transaction((sql) =>
          sql.query('SELECT id FROM attachments WHERE id=$1', [createdId]),
        );
        if (!existing.rows.length) await unlink(createdPath);
      } catch {
        /* Preserve arquivo privado se a reconciliação também estiver indisponível. */
      }
    }
    throw error;
  }
}
