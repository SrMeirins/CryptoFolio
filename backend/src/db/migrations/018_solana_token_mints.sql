-- ============================================================
-- Migración 018_solana_token_mints
-- Qué: rellena contract_address para WIF y PYTH sobre Solana, que nacieron
--      con NULL en el seed inicial de network_assets.
-- Por qué: con contract_address NULL, el motor de verificación on-chain
--          (walletSync) no puede distinguir "verificar este token" de
--          "verificar el activo nativo", y terminaba reportando el saldo
--          nativo de SOL como si fuera el saldo de WIF/PYTH (falso positivo
--          de discrepancia). Direcciones de mint verificadas en Solana
--          Explorer / documentación oficial de cada proyecto.
-- ============================================================

UPDATE network_assets SET contract_address = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
WHERE asset = 'WIF' AND contract_address IS NULL
  AND network_id = (SELECT id FROM networks WHERE name = 'Solana');

UPDATE network_assets SET contract_address = 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3'
WHERE asset = 'PYTH' AND contract_address IS NULL
  AND network_id = (SELECT id FROM networks WHERE name = 'Solana');
