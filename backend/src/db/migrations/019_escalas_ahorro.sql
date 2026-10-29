-- 019 — Tramos IRPF por ejercicio (#452). Cada ejercicio usa la escala oficial
-- del ahorro de su año (en el código, modules/fiscal/escalasAhorro.ts); aquí
-- solo se guardan los tipos que el usuario cambia a mano, uno por tramo de la
-- escala de ese año. La escala que hubiera en app_config (irpf_tramos_tipos)
-- pasa al ejercicio en curso. Idempotente.
-- Reversión: migrations/down/019_escalas_ahorro.sql
CREATE TABLE IF NOT EXISTS irpf_escalas (
  ejercicio   INTEGER PRIMARY KEY CHECK (ejercicio BETWEEN 2000 AND 2100),
  tipos       NUMERIC(5, 2)[] NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_irpf_escalas_tipos CHECK (
    cardinality(tipos) BETWEEN 1 AND 10
    AND 0 < ALL(tipos) AND 100 >= ALL(tipos)
  )
);

INSERT INTO irpf_escalas (ejercicio, tipos)
SELECT EXTRACT(YEAR FROM NOW())::int, ARRAY(SELECT jsonb_array_elements_text(value::jsonb)::numeric)
FROM app_config
WHERE key = 'irpf_tramos_tipos'
  AND value ~ '^\[[0-9., ]+\]$'
  AND jsonb_array_length(value::jsonb) = 5
ON CONFLICT (ejercicio) DO NOTHING;
