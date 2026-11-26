-- ============================================================
-- Migración 021_wallet_fallback_y_trigger
-- Qué: trigger BEFORE DELETE que impide borrar una wallet de sistema incluso
--      por acceso directo a la base de datos (el endpoint ya lo impedía, pero
--      solo a nivel de aplicación).
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_system_wallet_delete() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'No se puede borrar la wallet de sistema "%": es_system=TRUE', OLD.name;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_system_wallet_delete ON wallets;
CREATE TRIGGER trg_prevent_system_wallet_delete
  BEFORE DELETE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION prevent_system_wallet_delete();
