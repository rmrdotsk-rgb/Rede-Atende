CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)), name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('cidadao','operador','gestor','auditor')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, attempts integer NOT NULL CHECK(attempts >= 0), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS schools (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS departments (id text PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS requests (
 id text PRIMARY KEY, protocol text NOT NULL UNIQUE, owner_id text REFERENCES users(id), school_id text NOT NULL REFERENCES schools(id),
 department_id text REFERENCES departments(id), assigned_user_id text REFERENCES users(id),
 category text NOT NULL CHECK(category IN ('infraestrutura','transporte_escolar','alimentacao_merenda','material_didatico','apoio_pedagogico_inclusao','documentacao_transferencia','outros')),
 status text NOT NULL CHECK(status IN ('recebida','em_triagem','encaminhada','em_atendimento','concluida','aguardando_informacoes')),
 priority text NOT NULL CHECK(priority IN ('baixa','media','alta','urgente')),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deadline timestamptz, data jsonb NOT NULL,
 CHECK(data->>'id'=id AND data->>'protocol'=protocol)
);
CREATE INDEX IF NOT EXISTS requests_owner ON requests(owner_id);
CREATE INDEX IF NOT EXISTS requests_filters ON requests(school_id,category,status,priority);
CREATE INDEX IF NOT EXISTS requests_department_deadline ON requests(department_id,deadline);
CREATE TABLE IF NOT EXISTS request_history (id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), actor_id text REFERENCES users(id), occurred_at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS history_request ON request_history(request_id,occurred_at);
CREATE TABLE IF NOT EXISTS work_orders (id text PRIMARY KEY, number text NOT NULL UNIQUE, request_id text NOT NULL REFERENCES requests(id), required boolean NOT NULL, status text NOT NULL CHECK(status IN ('aberta','em_execucao','pendente','concluida','cancelada')), data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS orders_request ON work_orders(request_id,status);
CREATE TABLE IF NOT EXISTS appointments (id text PRIMARY KEY, request_id text REFERENCES requests(id), school_id text NOT NULL REFERENCES schools(id), work_order_id text REFERENCES work_orders(id), technician text NOT NULL, day date NOT NULL, time time NOT NULL, status text NOT NULL CHECK(status IN ('Agendada','Confirmada','Realizada','Cancelada')), data jsonb NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot ON appointments(lower(technician), day,time) WHERE status IN ('Agendada','Confirmada');
CREATE TABLE IF NOT EXISTS information_requests (id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS ratings (request_id text PRIMARY KEY REFERENCES requests(id), rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), audience text NOT NULL CHECK(audience IN ('comunidade','gestao')), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS notification_reads (notification_id text NOT NULL REFERENCES notifications(id), user_id text NOT NULL REFERENCES users(id), read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(notification_id,user_id));
CREATE TABLE IF NOT EXISTS settings (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS deadline_rule_history (id text PRIMARY KEY, actor_id text REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sei_simulations (id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS protocol_sequences (year integer PRIMARY KEY, next_value integer NOT NULL CHECK(next_value BETWEEN 1 AND 1000000));
CREATE TABLE IF NOT EXISTS idempotency_keys (user_id text NOT NULL REFERENCES users(id), key text NOT NULL, request_hash text NOT NULL, request_id text NOT NULL REFERENCES requests(id), PRIMARY KEY(user_id,key));
CREATE TABLE IF NOT EXISTS attachments (id text PRIMARY KEY, request_id text NOT NULL REFERENCES requests(id), uploader_id text NOT NULL REFERENCES users(id), storage_name text NOT NULL UNIQUE, name text NOT NULL, mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','application/pdf')), size integer NOT NULL CHECK(size BETWEEN 1 AND 5242880), sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS attachments_request ON attachments(request_id);
CREATE TABLE IF NOT EXISTS audit_log (id text PRIMARY KEY, actor_id text REFERENCES users(id), action text NOT NULL, entity_id text, occurred_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL DEFAULT '{}');
CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Registro de auditoria é somente acréscimo'; END $$;
DROP TRIGGER IF EXISTS audit_immutable ON audit_log;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
DROP TRIGGER IF EXISTS history_immutable ON request_history;
CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON request_history FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
