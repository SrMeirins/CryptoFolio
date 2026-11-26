-- ============================================================
-- Migración 024_fk_restrict_explicito_resto
-- Qué: hace explícito ON DELETE RESTRICT (ya era el comportamiento por
--      defecto de Postgres sin especificar — NO ACTION) en las 4 FK que
--      quedaron fuera de la migración 023.
-- Por qué: mismo criterio que 023 — documentación como código, deja
--      constancia de que bloquear el borrado mientras haya dependientes es
--      intencional (no CASCADE silencioso). Sin cambio de comportamiento
--      real: una wallet con transacciones/lotes/direcciones asociadas, o
--      una red con direcciones asociadas, ya no se podía borrar antes de
--      esta migración tampoco.
-- ============================================================

ALTER TABLE wallet_addresses
  DROP CONSTRAINT IF EXISTS wallet_addresses_network_id_fkey,
  ADD CONSTRAINT wallet_addresses_network_id_fkey
    FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE RESTRICT;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_wallet_id_fkey,
  ADD CONSTRAINT transactions_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_destination_wallet_id_fkey,
  ADD CONSTRAINT transactions_destination_wallet_id_fkey
    FOREIGN KEY (destination_wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT;

ALTER TABLE fifo_lots
  DROP CONSTRAINT IF EXISTS fifo_lots_wallet_id_fkey,
  ADD CONSTRAINT fifo_lots_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT;
