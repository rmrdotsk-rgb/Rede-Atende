-- Evolução aditiva: não altera ou remove os registros da migração 001.
CREATE TABLE IF NOT EXISTS attachment_upload_keys (
 user_id text NOT NULL REFERENCES users(id),
 request_id text NOT NULL REFERENCES requests(id),
 key text NOT NULL CHECK(length(key) BETWEEN 16 AND 150),
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 attachment_id text NOT NULL REFERENCES attachments(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id,key)
);
CREATE INDEX IF NOT EXISTS upload_keys_attachment ON attachment_upload_keys(attachment_id);
CREATE INDEX IF NOT EXISTS requests_protocol_upper ON requests(upper(protocol));
CREATE INDEX IF NOT EXISTS requests_created_order ON requests(created_at DESC,id DESC);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
