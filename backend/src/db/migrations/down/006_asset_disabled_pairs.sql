-- Reversión de 006: quita la lista de pares desactivados a mano.
ALTER TABLE asset_metadata DROP COLUMN IF EXISTS disabled_pairs;
