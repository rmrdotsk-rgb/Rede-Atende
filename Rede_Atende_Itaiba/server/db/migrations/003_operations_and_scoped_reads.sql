-- Aditiva e reaplicável; preserva as migrações 001/002 e os dados existentes.
CREATE TABLE IF NOT EXISTS operation_keys (
 user_id text NOT NULL REFERENCES users(id), operation text NOT NULL,
 key text NOT NULL CHECK(length(key) BETWEEN 16 AND 150),
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 entity_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation,key)
);
CREATE TABLE IF NOT EXISTS operational_sequences (id text PRIMARY KEY,next_value bigint NOT NULL CHECK(next_value>0));
INSERT INTO operational_sequences(id,next_value)
 SELECT 'work-order',COALESCE(max(substring(number from '[0-9]+$')::bigint),0)+1 FROM work_orders
 ON CONFLICT(id) DO UPDATE SET next_value=GREATEST(operational_sequences.next_value,excluded.next_value);
CREATE INDEX IF NOT EXISTS appointments_conflict_window ON appointments(lower(trim(technician)),day) WHERE status IN ('Agendada','Confirmada');
CREATE INDEX IF NOT EXISTS notifications_audience ON notifications(audience,(data->>'createdAt') DESC,id DESC);
CREATE INDEX IF NOT EXISTS request_history_recent ON request_history(occurred_at DESC,id DESC);
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
