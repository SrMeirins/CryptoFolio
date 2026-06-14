# Operaciones soportadas — Binance CSV

Referencia completa de todos los tipos de operación que CryptoTracker reconoce e importa desde el historial CSV de Binance. Cada sección describe qué es la operación, cómo aparece en el CSV, cómo la procesamos internamente, cómo se refleja en el historial y el portfolio, y cuál es su tratamiento fiscal en España (IRPF 2024).

---

## Índice

1. [BUY — Compra de criptomoneda](#1-buy--compra-de-criptomoneda)
2. [SELL — Venta de criptomoneda](#2-sell--venta-de-criptomoneda)
3. [FEE_EXCHANGE — Comisión de exchange](#3-fee_exchange--comisión-de-exchange)
4. [STAKING_REWARD — Recompensa de staking](#4-staking_reward--recompensa-de-staking)
5. [LENDING_INTEREST / LENDING_INTEREST_LOCKED — Interés de préstamo/depósito](#5-lending_interest--lending_interest_locked--interés-de-préstamodeposito)
6. [AIRDROP — Distribución gratuita de tokens](#6-airdrop--distribución-gratuita-de-tokens)
7. [CASHBACK — Devolución de comisión o bono](#7-cashback--devolución-de-comisión-o-bono)
8. [STAKING_LOCK / STAKING_UNLOCK — Bloqueo y desbloqueo de staking](#8-staking_lock--staking_unlock--bloqueo-y-desbloqueo-de-staking)
9. [LAUNCHPOOL_LOCK / LAUNCHPOOL_UNLOCK — Bloqueo y desbloqueo de Launchpool](#9-launchpool_lock--launchpool_unlock--bloqueo-y-desbloqueo-de-launchpool)
10. [TRANSFER_INTERNAL — Transferencia interna entre wallets](#10-transfer_internal--transferencia-interna-entre-wallets)
11. [DEPOSIT_FIAT — Ingreso de dinero fiat](#11-deposit_fiat--ingreso-de-dinero-fiat)
12. [WITHDRAW_FIAT — Retiro de dinero fiat](#12-withdraw_fiat--retiro-de-dinero-fiat)
13. [DEPOSIT_CRYPTO — Depósito de criptomoneda desde wallet externa](#13-deposit_crypto--depósito-de-criptomoneda-desde-wallet-externa)
14. [WITHDRAW — Retiro de criptomoneda a wallet externa](#14-withdraw--retiro-de-criptomoneda-a-wallet-externa)
15. [IGNORED — Operaciones reconocidas sin impacto fiscal](#15-ignored--operaciones-reconocidas-sin-impacto-fiscal)

---

## 1. BUY — Compra de criptomoneda

### Qué es

Una compra es cualquier operación en la que adquieres criptomoneda a cambio de euros (fiat) u otra criptomoneda. También cubre conversiones (swaps) entre dos criptos distintas.

### Etiquetas CSV de Binance que generan un BUY

| Etiqueta CSV | Cuenta | Descripción |
|---|---|---|
| `Transaction Buy` | Spot / Cross Margin / Isolated Margin / Strategy | Compra en el mercado spot. Aparece junto a `Transaction Spend` (la salida de dinero) y opcionalmente `Transaction Fee` (la comisión). |
| `Transaction Spend` | Spot / Cross Margin / Isolated Margin / Strategy | Fila de coste de la compra anterior. Se agrupa automáticamente con `Transaction Buy`. |
| `Transaction Fee` | Spot / Cross Margin / Isolated Margin / Strategy | Fila de comisión de la compra o venta. Se agrupa automáticamente con su operación. |
| `Binance Convert` | Spot / Funding | Swap entre dos activos (EUR↔cripto o cripto↔cripto). Genera una fila de entrada y otra de salida. |
| `Small Assets Exchange BNB` | Spot | Conversión de "dust" (saldos residuales ínfimos) a BNB. |
| `Buy Crypto With Fiat` | Spot | Compra directa con euro bancario. |
| `Buy Crypto With Card` | Spot | Compra con tarjeta de débito/crédito. |
| `Convert Fiat to Crypto OCBS` | Spot | Compra via sistema OCBS de Binance (equivalente a `Buy Crypto With Fiat`). |
| `Transaction Related` | Spot | Patrón antiguo pre-OCBS: el euro entra como depósito al mismo segundo y la compra se registra bajo esta etiqueta. |
| `ETH 2.0 Staking` | Funding | Conversión ETH → BETH al hacer staking en Ethereum 2.0 (ratio 1:1). |
| `ETH 2.0 Staking Withdrawals` | Funding | Conversión BETH → ETH al retirar el stake de Ethereum 2.0 (ratio 1:1). |

### Ejemplo de CSV

**Compra normal EUR → BTC:**
```
84158159,24-01-15 10:30:00,Spot,Transaction Buy,BTC,0.00250000,
84158159,24-01-15 10:30:00,Spot,Transaction Spend,EUR,-250.00000000,
84158159,24-01-15 10:30:00,Spot,Transaction Fee,BNB,-0.00015000,
```

**Compra ejecutada por un grid bot en Strategy (USDT → AMP):**
```
84158159,24-03-15 12:36:00,Strategy,Transaction Buy,AMP,598,
84158159,24-03-15 12:36:00,Strategy,Transaction Spend,USDT,-5.979402,
84158159,24-03-15 12:36:00,Strategy,Transaction Fee,AMP,-0.598,
```

**Swap cripto → cripto (Binance Convert USDT → SOL):**
```
84158159,24-03-20 14:00:00,Spot,Binance Convert,SOL,2.50000000,
84158159,24-03-20 14:00:00,Spot,Binance Convert,USDT,-250.00000000,
```

**ETH 2.0 Staking (ETH → BETH):**
```
84158159,21-09-22 21:18:36,Spot,ETH 2.0 Staking,ETH,-0.05000000,
84158159,21-09-22 21:18:36,Spot,ETH 2.0 Staking,BETH,0.05000000,
```

### Cómo lo procesamos

El parser agrupa todas las filas con el mismo timestamp y tipo de operación en un único "grupo". Dentro del grupo identifica:
- La fila positiva → el activo que se recibe (`asset`, `amount`)
- La fila negativa → el coste (`cost_asset`, `cost_amount`)
- La fila de fee (si la hay) → `fee_asset`, `fee_amount`

Para ETH 2.0 Staking, el parser detecta las dos filas (ETH negativo, BETH positivo) y construye un BUY de BETH pagado con ETH.

### En el historial

Aparece como **"Compra"** con el activo recibido en verde. La columna de valor muestra:
- Si se pagó con EUR: el coste en euros directamente.
- Si se pagó con otra cripto: el importe en la cripto pagada (ej. `0,0500 ETH`). No se muestra un valor EUR inventado.
- La línea secundaria `@ X EUR` muestra el precio por unidad al que se compró.

### En FIFO

- Se **abre un lote nuevo** para el activo recibido, con `cost_basis_eur` = lo que se pagó en EUR (o su equivalente si se pagó en cripto, valorado al precio de mercado del momento).
- Si se pagó con otra cripto, se **consumen los lotes FIFO** de esa cripto (disposición patrimonial: puede generar ganancia o pérdida).
- Si la fee es en un activo distinto al comprado (ej. BNB), su valor EUR se suma al cost basis del lote abierto y además se consumen los lotes de BNB correspondientes.

### Fiscalmente (España — IRPF)

Una compra EUR → cripto **no es un hecho imponible** en sí. Se registra el coste de adquisición del lote para calcular la ganancia o pérdida cuando se venda (art. 14 y 35 LIRPF).

Un swap cripto → cripto **sí es un hecho imponible** (permuta de bienes). La diferencia entre el valor de mercado de la cripto entregada y su coste de adquisición FIFO es una **ganancia o pérdida patrimonial** (art. 33.1 LIRPF), que va a la base del ahorro (Disposición Adicional 37ª, LIRPF).

---

## 2. SELL — Venta de criptomoneda

### Qué es

Una venta es cualquier operación en la que entregas criptomoneda a cambio de euros u otra criptomoneda. Para el caso cripto→cripto, ambas operaciones (la BUY del activo recibido y la SELL del activo entregado) quedan enlazadas en el mismo grupo.

### Etiquetas CSV de Binance que generan un SELL

| Etiqueta CSV | Cuenta | Descripción |
|---|---|---|
| `Transaction Sold` | Spot / Cross Margin / Isolated Margin / Strategy | Venta en el mercado spot. Fila negativa que representa la salida de cripto. |
| `Transaction Revenue` | Spot / Cross Margin / Isolated Margin / Strategy | Fila de ingreso de la venta (el EUR recibido). Se agrupa con `Transaction Sold`. |
| `Cross Margin Liquidation - Small Assets Takeover` | Cross Margin | Venta forzosa de colateral durante una liquidación. Transmisión patrimonial imponible. |

### Ejemplo de CSV

**Venta BTC → EUR:**
```
84158159,24-06-01 16:45:00,Spot,Transaction Sold,BTC,-0.00250000,
84158159,24-06-01 16:45:00,Spot,Transaction Revenue,EUR,287.50000000,
84158159,24-06-01 16:45:00,Spot,Transaction Fee,BNB,-0.00012000,
```

### Cómo lo procesamos

El parser agrupa las filas del mismo timestamp. Identifica:
- La fila negativa de cripto → el activo vendido
- La fila positiva de EUR → el ingreso recibido
- La fila de fee → se añade al coste para reducir el beneficio neto

### En el historial

Aparece como **"Venta"** con el activo vendido en rojo. La columna de valor muestra los euros recibidos y el precio por unidad.

### En FIFO

Se **consumen lotes FIFO** del activo vendido en orden cronológico (primero el más antiguo). Para cada lote consumido se calcula:
- `ganancia = valor_venta_eur - cost_basis_eur`

La ganancia neta acumulada está visible en el panel de FIFO del portfolio.

### Fiscalmente (España — IRPF)

Cada venta es una **transmisión patrimonial** (art. 33 LIRPF). La ganancia o pérdida se integra en la **base imponible del ahorro**:
- 19% hasta 6.000 €
- 21% de 6.000 € a 50.000 €
- 23% de 50.000 € a 200.000 €
- 27% a partir de 200.000 €

Las pérdidas pueden compensarse con ganancias del mismo año o de los 4 años siguientes (art. 49 LIRPF).

---

## 3. FEE_EXCHANGE — Comisión de exchange

### Qué es

Comisiones que el exchange cobra en un activo que ya posees (normalmente BNB, que Binance descuenta si activas "pagar fees con BNB"). Al pagar una fee con un activo que tienes en cartera, estás haciendo una disposición parcial de ese activo → hecho imponible.

### Etiquetas CSV de Binance que generan un FEE_EXCHANGE

| Etiqueta CSV | Cuenta | Descripción |
|---|---|---|
| `Transaction Fee` | Spot / Cross Margin / Isolated Margin | Fee de la operación de compra o venta. Cuando va en BNB, es un FEE_EXCHANGE; cuando va en el mismo activo de la operación, se integra en el BUY/SELL. |
| `BNB Fee Deduction` | Spot / Isolated Margin | Deducción de fee en BNB como operación independiente. |
| `Margin Fee` | Cross Margin | Interés de margen periódico pagado en cripto. |
| `Isolated Margin Repayment` | Isolated Margin | Devolución de préstamo en margin que consume lotes. |
| `Isolated Margin Liquidation - Fee` | Isolated Margin | Fee cobrada en una liquidación de margin. |
| `Margin Repayment` | Cross Margin | Devolución de préstamo cross margin. |
| `Cross Margin Liquidation - Repayment` | Cross Margin | Repago de deuda tras liquidación. |

### Ejemplo de CSV

```
84158159,24-01-15 10:30:00,Spot,Transaction Fee,BNB,-0.00015000,
```

### Cómo lo procesamos

Se consumen los lotes FIFO del activo de la fee (ej. BNB). El valor de esos lotes consumidos se compara con su coste de adquisición para calcular ganancia/pérdida.

### En el historial

Aparece como **"Fee exchange"** con el activo de la fee en rojo y el importe pagado.

### En FIFO

Se consumen lotes del activo de la fee. Se registra ganancia o pérdida patrimonial por el tramo consumido.

### Fiscalmente (España — IRPF)

Pagar una fee con BNB (u otro cripto) es una **permuta** → ganancia o pérdida patrimonial (art. 33 LIRPF, base del ahorro). La DGT lo ha confirmado en diversas consultas vinculantes (V0999-18, V1604-18).

---

## 4. STAKING_REWARD — Recompensa de staking

### Qué es

Tokens recibidos como recompensa por participar en el mecanismo de consenso Proof of Stake de una red blockchain, o por dejar activos bloqueados en Binance Earn (staking delegado). Son ingresos periódicos, normalmente diarios o semanales.

### Etiquetas CSV de Binance que generan un STAKING_REWARD

| Etiqueta CSV | Cuenta | Descripción |
|---|---|---|
| `Staking Rewards` | Spot | Recompensa de staking PoS en Binance Earn. |
| `ETH 2.0 Staking Rewards` | Spot | Recompensa periódica de validar bloques en Ethereum 2.0, recibida en BETH. |
| `Launchpool Interest` | Funding | Rendimiento generado por participar en un Launchpool. |
| `BNB Vault Rewards` | Funding | Rendimiento del BNB Vault de Binance. |

### Ejemplo de CSV

```
84158159,24-02-10 00:00:00,Spot,Staking Rewards,ADA,2.15000000,
84158159,23-09-23 10:00:00,Spot,ETH 2.0 Staking Rewards,BETH,0.00000580,
```

### Cómo lo procesamos

El parser busca el precio histórico del activo en CoinGecko (o en caché de Binance) para la fecha y hora exacta de la fila. Almacena `price_per_unit` en EUR y calcula el valor total en euros al momento de recepción.

### En el historial

Aparece como **"Staking"** con el importe recibido y el valor en euros al momento de recibir. La línea secundaria muestra `@ X EUR` (el precio por unidad ese día).

### En FIFO

Se abre un lote nuevo con `cost_basis_eur` = valor de mercado en el momento de recepción. Este coste servirá de base para calcular la ganancia o pérdida cuando se venda en el futuro.

### Fiscalmente (España — IRPF)

Las recompensas de staking se consideran **rendimientos del capital mobiliario** (art. 25.4 LIRPF), integrándose en la **base del ahorro**. Se valoran al precio de mercado en el momento de recepción. La DGT tiene consultas vinculantes que apuntan a esta clasificación para el staking delegado (no minería directa).

> **Nota:** El tratamiento del staking de validador propio (ETH 2.0) está en debate doctrinal. Puede considerarse actividad económica o ganancia patrimonial según el volumen y la frecuencia. Consulta con tu asesor fiscal.

---

## 5. LENDING_INTEREST / LENDING_INTEREST_LOCKED — Interés de préstamo/depósito

### Qué es

Intereses recibidos por prestar liquidez a Binance a través de los productos Simple Earn (antes Savings). En Simple Earn Flexible el capital es rescatable en cualquier momento; en Simple Earn Locked el capital queda bloqueado un plazo fijo a cambio de un interés mayor.

### Etiquetas CSV de Binance que generan un LENDING_INTEREST

| Etiqueta CSV | Cuenta | Tipo interno | Descripción |
|---|---|---|---|
| `Simple Earn Flexible Interest` | Spot | `LENDING_INTEREST` | Interés diario de Simple Earn Flexible. |
| `Savings Interest` | Funding | `LENDING_INTEREST` | Variante antigua de Simple Earn Flexible. |
| `POS savings interest` | Funding | `LENDING_INTEREST` | Variante POS de savings. |
| `Simple Earn Locked Rewards` | Spot | `LENDING_INTEREST_LOCKED` | Interés de Simple Earn Locked al vencimiento del plazo. |

### Ejemplo de CSV

```
84158159,24-03-01 00:00:00,Spot,Simple Earn Flexible Interest,USDT,0.12500000,
84158159,24-03-31 00:00:00,Spot,Simple Earn Locked Rewards,BNB,0.05000000,
```

### Cómo lo procesamos

Igual que `STAKING_REWARD`: se busca el precio histórico en EUR y se abre un lote al coste de mercado en el momento de recepción.

### En el historial

Aparece como **"Interés"** con el activo recibido y el valor en euros en el momento de recepción.

### En FIFO

Se abre un lote nuevo con `cost_basis_eur` = valor de mercado en el momento de recepción.

### Fiscalmente (España — IRPF)

Los intereses de depósito/préstamo de criptomonedas se clasifican como **rendimientos del capital mobiliario** (art. 25.2 LIRPF — intereses y rendimientos de capitales prestados a terceros). Base del ahorro. Mismo tipo impositivo que los intereses bancarios.

---

## 6. AIRDROP — Distribución gratuita de tokens

### Qué es

Tokens recibidos gratis, sin entregar nada a cambio. Puede ser un airdrop de un proyecto nuevo para promocionarse, una distribución por participar en actividades de Binance (Launchpool), una recuperación de activos antiguos (Asset Recovery) o la distribución del nuevo token en un swap de rebranding.

### Etiquetas CSV de Binance que generan un AIRDROP

| Etiqueta CSV | Cuenta | Descripción |
|---|---|---|
| `Airdrop Assets` | Funding | Airdrop genérico de un proyecto. |
| `Distribution` | Spot | Distribución de tokens por Binance. |
| `Asset Recovery` | Funding | Recuperación de tokens de un proyecto antiguo/migrado. |
| `Launchpool Airdrop - User Claim Distribution` | Spot | Tokens de Launchpool que el usuario reclama manualmente. |
| `Launchpool Airdrop - System Distribution` | Spot | Tokens de Launchpool distribuidos automáticamente por Binance. |
| `Token Swap - Distribution` | Funding | Tokens nuevos recibidos en un swap/rebrand de Binance (ej. LUNA → LUNC). |

### Ejemplo de CSV

```
84158159,24-08-29 11:53:20,Spot,Token Swap - Distribution,SLF,45,
84158159,23-06-15 00:00:00,Funding,Launchpool Airdrop - User Claim Distribution,ARKM,120.50000000,
84158159,23-04-01 00:00:00,Funding,Airdrop Assets,ARB,15.00000000,
```

### Cómo lo procesamos

Se busca el precio histórico del activo en CoinGecko para la fecha exacta. Se almacena como `price_per_unit` en EUR y se calcula el valor total recibido en euros.

### En el historial

Aparece como **"Airdrop"** con el token recibido en verde y el valor en euros del momento de recepción.

### En FIFO

Se abre un lote nuevo con `cost_basis_eur` = valor de mercado en el momento de recepción. Este valor se considera el coste de adquisición a efectos fiscales.

### Fiscalmente (España — IRPF)

Los airdrops recibidos sin contraprestación son una **ganancia patrimonial no derivada de transmisión** (art. 33.1 LIRPF), integrable en la **base del ahorro**. El valor se fija al precio de mercado en el momento de recepción.

> **Nota:** Existe debate sobre si los airdrops de Launchpool (obtenidos bloqueando capital, no por azar) podrían clasificarse como rendimientos del capital mobiliario. La posición conservadora (y la más habitual en la práctica) es tratarlos como ganancia patrimonial.

---

## 7. CASHBACK — Devolución de comisión o bono

### Qué es

Tokens o importes recibidos como devolución por comisiones pagadas, bonos de referido, recompensas de programas de fidelización de Binance, o cualquier ingreso asimilable a un bono sin transmisión patrimonial.

### Etiquetas CSV de Binance que generan un CASHBACK

| Etiqueta CSV | Cuenta | Descripción |
|---|---|---|
| `Commission History` | Funding | Comisión de referido recibida en el activo que ha operado tu referido. |
| `Commission Rebate` | Funding | Rebate de comisión. |
| `Referral Kickback` | Funding | Bonus de referido recibido en BNB u otro activo. |
| `Cashback Voucher` | Funding | Voucher de cashback por campañas de Binance. |
| `Cash Voucher Distribution` | Funding | Distribución de vouchers en efectivo cripto. |
| `Mission Reward Distribution` | Funding | Premio por completar misiones en Binance. |
| `Crypto Box` | Funding | Token recibido en un "Crypto Box" (sobre sorpresa de Binance). |
| `Strategy Trading Fee Rebate` | Spot | Devolución de fee del grid trading / strategy trading en BNB u otros activos. |

### Ejemplo de CSV

```
84158159,24-05-20 09:00:00,Funding,Commission History,DOGE,5.25000000,
84158159,24-04-10 12:00:00,Funding,Cashback Voucher,BNB,0.01500000,
```

### Cómo lo procesamos

Se busca el precio histórico en EUR para la fecha. Para `Strategy Trading Fee Rebate` el parser diferencia: la fila negativa de BNB se procesa como `FEE_EXCHANGE`; las filas positivas del activo rebateado como `CASHBACK`.

### En el historial

Aparece como **"Cashback"** con el activo recibido y su valor en euros al momento de recepción.

### En FIFO

Se abre un lote nuevo al precio de mercado del momento de recepción.

### Fiscalmente (España — IRPF)

Los cashbacks y bonos recibidos de un exchange son **ganancias patrimoniales no derivadas de transmisión** (art. 33.1 LIRPF), base del ahorro, valoradas al precio de mercado en el momento de recepción. Algunos asesores los asimilan a rendimientos del capital mobiliario por analogía con los bonos bancarios; la posición más habitual es la ganancia patrimonial.

---

## 8. STAKING_LOCK / STAKING_UNLOCK — Bloqueo y desbloqueo de staking

### Qué es

Cuando haces staking en Binance Earn, el sistema bloquea tus activos en una cuenta interna separada (el capital no sale de tu propiedad, pero queda inmovilizado). `STAKING_LOCK` registra ese bloqueo y `STAKING_UNLOCK` la recuperación al finalizar el periodo.

Estos dos tipos van **siempre enlazados**: cada UNLOCK tiene un puntero (`linked_tx_id`) al LOCK que lo originó, asignado automáticamente por orden cronológico (FIFO) durante el import.

### Etiquetas CSV de Binance

| Etiqueta CSV | Cuenta | Tipo interno |
|---|---|---|
| `Staking Purchase` | Spot / Funding | `STAKING_LOCK` |
| `Staking Redemption` | Spot / Funding | `STAKING_UNLOCK` |

### Ejemplo de CSV

```
84158159,24-01-01 10:00:00,Funding,Staking Purchase,DOT,50.00000000,
84158159,24-04-01 10:00:00,Funding,Staking Redemption,DOT,50.00000000,
```

### Cómo lo procesamos

Al importar un `STAKING_UNLOCK`, el importer busca en la base de datos el `STAKING_LOCK` más antiguo no enlazado del mismo activo y wallet, y almacena su `id` en `linked_tx_id`. Esto permite trazar qué capital se liberó en cada redención.

### En el historial

- `STAKING_LOCK` aparece como **"Staking lock"** (badge ámbar).
- `STAKING_UNLOCK` aparece como **"Staking unlock"** (badge verde).
- En el panel expandido de cada operación se muestra el link a su contraparte (fecha y cantidad del LOCK vinculado al UNLOCK, y viceversa).

### En el portfolio (AssetTable)

Los activos con capital bloqueado aparecen bajo la fila del asset con un sub-badge **"X bloqueado en staking"** en color ámbar. El saldo bloqueado se calcula como `SUM(LOCK) - SUM(UNLOCK)` en tiempo real.

### En FIFO

**No-op**: los lotes permanecen exactamente donde están. El staking lock/unlock es un movimiento contable interno de Binance, no una transmisión patrimonial. El lote abierto en su día sigue siendo el mismo, con el mismo `cost_basis_eur`.

### Fiscalmente (España — IRPF)

El bloqueo para staking **no es un hecho imponible**. No hay transmisión patrimonial: sigues siendo propietario del activo. Solo cuando se reciben las recompensas (→ STAKING_REWARD) se genera renta. El capital en sí tributa cuando finalmente se vende.

---

## 9. LAUNCHPOOL_LOCK / LAUNCHPOOL_UNLOCK — Bloqueo y desbloqueo de Launchpool

### Qué es

En los Launchpools de Binance puedes bloquear un activo (BNB, FDUSD, USDT, u otros) durante un periodo limitado para recibir tokens de un nuevo proyecto como recompensa. Al entrar, tus activos quedan bloqueados (LAUNCHPOOL_LOCK); al salir o al finalizar el evento, se liberan (LAUNCHPOOL_UNLOCK). Las recompensas en tokens del nuevo proyecto se reciben via AIRDROP.

El activo bloqueado puede ser **cualquier token** que Binance permita en cada Launchpool, no solo BNB.

### Etiquetas CSV de Binance

| Etiqueta CSV | Cuenta | Tipo interno |
|---|---|---|
| `Launchpool Subscription` | Spot / Funding | `LAUNCHPOOL_LOCK` |
| `Launchpool Redemption` | Spot / Funding | `LAUNCHPOOL_UNLOCK` |

### Ejemplo de CSV

```
84158159,24-06-01 09:00:00,Spot,Launchpool Subscription,BNB,2.00000000,
84158159,24-06-15 09:00:00,Spot,Launchpool Redemption,BNB,2.00000000,
84158159,24-06-02 00:00:00,Spot,Launchpool Airdrop - System Distribution,LISTA,350.00000000,
```

### Cómo lo procesamos

Igual que el staking: el UNLOCK se enlaza al LOCK correspondiente via `linked_tx_id` (FIFO por antigüedad).

### En el historial

- `LAUNCHPOOL_LOCK` aparece como **"Launchpool lock"** (badge violeta).
- `LAUNCHPOOL_UNLOCK` aparece como **"Launchpool unlock"** (badge verde).

### En el portfolio (AssetTable)

Los activos con capital bloqueado en Launchpool aparecen con un sub-badge **"X bloqueado en launchpool"** en color violeta, diferenciado visualmente del staking (ámbar).

### En FIFO

**No-op**: igual que el staking, los lotes permanecen en su wallet original. No hay transmisión.

### Fiscalmente (España — IRPF)

El bloqueo del capital en Launchpool **no es un hecho imponible**. Las recompensas recibidas en el nuevo token (AIRDROP) sí tributan como ganancia patrimonial al precio de mercado en el momento de recepción.

---

## 10. TRANSFER_INTERNAL — Transferencia interna entre wallets

### Qué es

Movimiento de activos entre dos sub-cuentas dentro del mismo exchange (ej. de Spot a Funding, de Spot a Margin, de Spot a Strategy). El activo no sale de tu propiedad, solo cambia de "cajón" dentro de Binance.

### Etiquetas CSV de Binance

| Etiqueta CSV | Cuenta origen | Wallet destino |
|---|---|---|
| `Transfer Between Main and Funding Wallet` | Spot | → Binance Funding |
| `Transfer Between Main and Funding Wallet` | Funding | → Binance Spot |
| `Transfer Between Main Account/Futures and Margin Account` | Spot | → Binance Cross Margin |
| `Transfer Between Main Account/Futures and Margin Account` | Cross Margin | → Binance Spot |
| `Transfer Between Spot and Strategy Account` | Spot | → Binance Strategy |
| `Transfer Between Spot and Strategy Account` | Strategy | → Binance Spot |

### Ejemplo de CSV

```
84158159,24-02-01 11:00:00,Spot,Transfer Between Main and Funding Wallet,ETH,-1.50000000,
84158159,24-02-01 11:00:00,Funding,Transfer Between Main and Funding Wallet,ETH,1.50000000,
```

### Cómo lo procesamos

El parser genera **una transacción `TRANSFER_INTERNAL` por cada activo saliente**. La fila negativa marca el origen (wallet que envía) y la positiva el destino; la fila del destino se ignora para no duplicar.

Cuando Binance emite varios activos en la misma transferencia al mismo segundo (ej: al cerrar un grid bot se transfieren simultáneamente el USDT de capital y el token residual no vendido), el parser crea una transacción separada por cada activo.

### En el historial

Aparece como **"Transferencia"** indicando el wallet de origen y el de destino.

### En FIFO

Se mueven los lotes del wallet de origen al wallet de destino, manteniendo íntegramente su `cost_basis_eur` original. No se crea ganancia ni pérdida.

### Fiscalmente (España — IRPF)

Una transferencia interna entre sub-cuentas del mismo exchange **no es un hecho imponible**. El propietario no cambia.

---

## 11. DEPOSIT_FIAT — Ingreso de dinero fiat

### Qué es

Ingreso de euros (u otra moneda fiat) en tu cuenta de Binance desde una cuenta bancaria. No es una operación de cripto en sí, pero queda registrado en el historial para mantener el tracking completo de flujos.

### Etiquetas CSV de Binance

| Etiqueta CSV | Cuenta |
|---|---|
| `Deposit` | Spot |

### Ejemplo de CSV

```
84158159,24-01-10 09:00:00,Spot,Deposit,EUR,1000.00000000,
```

### Cómo lo procesamos

Se registra como `DEPOSIT_FIAT`. No se abre ningún lote FIFO (el EUR no es un activo con coste de adquisición rastreable en nuestra lógica).

### En el historial

Aparece como **"Depósito fiat"** con el importe en euros.

### En FIFO

No genera lotes ni consumos. Es un apunte contable.

### Fiscalmente (España — IRPF)

No es un hecho imponible.

---

## 12. WITHDRAW_FIAT — Retiro de dinero fiat

### Qué es

Retiro de euros de tu cuenta Binance a una cuenta bancaria.

### Etiquetas CSV de Binance

| Etiqueta CSV | Cuenta |
|---|---|
| `Fiat Withdraw` | Spot |

### Ejemplo de CSV

```
84158159,24-06-30 15:00:00,Spot,Fiat Withdraw,EUR,-500.00000000,
```

### Cómo lo procesamos

Se registra como `WITHDRAW_FIAT`. No hay lote que mover.

### En el historial

Aparece como **"Retiro fiat"** con el importe retirado.

### En FIFO

No genera lotes ni consumos.

### Fiscalmente (España — IRPF)

No es un hecho imponible. El retiro de fiat es la consecuencia de una venta ya registrada; la venta ya tributó en su momento.

---

## 13. DEPOSIT_CRYPTO — Depósito de criptomoneda desde wallet externa

### Qué es

Recepción de cripto en Binance enviada desde una wallet propia externa (ej. MetaMask, Ledger, otro exchange). El activo llega "nuevo" a Binance y hay que abrir un lote con su coste de adquisición original.

### Cómo lo procesamos

Se abre un lote al precio de mercado en la fecha del depósito como valor de referencia. **Importante:** si el activo tenía un coste de adquisición distinto en la wallet de origen, deberías ajustarlo manualmente, ya que el CSV de Binance no incluye ese dato.

### En el historial

Aparece como **"Depósito crypto"**.

### En FIFO

Se abre un lote al precio de mercado del momento del depósito (CoinGecko histórico).

### Fiscalmente (España — IRPF)

El depósito en sí no es un hecho imponible. El coste de adquisición real a efectos fiscales es el que se pagó originalmente por esos tokens, independientemente de dónde estén custodiados.

---

## 14. WITHDRAW — Retiro de criptomoneda a wallet externa

### Qué es

Envío de cripto desde Binance a una wallet externa propia (Ledger, MetaMask, otro exchange).

### Cómo lo procesamos

Se marca como `WITHDRAW` con `destination_pending: true` si no se puede enlazar con un depósito en otra wallet importada. Los lotes se mueven o se dejan en pending según si el destino está en CryptoTracker.

### En el historial

Aparece como **"Retiro crypto"** con la cantidad enviada.

### En FIFO

Se consumen los lotes del activo retirado. Si el destino es una wallet registrada en CryptoTracker, los lotes se transfieren a esa wallet (igual que TRANSFER_INTERNAL). Si el destino es desconocido, quedan en `destination_pending`.

### Fiscalmente (España — IRPF)

El retiro a una wallet propia **no es un hecho imponible** (no hay cambio de propietario). El retiro a una wallet de terceros podría considerarse donación o venta, dependiendo del contexto.

---

## 15. IGNORED — Operaciones reconocidas sin impacto fiscal

### Qué es

Operaciones que Binance incluye en el CSV como asientos contables auxiliares, pero que no representan ningún movimiento patrimonial real. Se reconocen para que el importador no genere un error de "operación desconocida", pero no generan ninguna transacción en CryptoTracker.

### Etiquetas CSV ignoradas

| Etiqueta CSV | Cuenta | Motivo |
|---|---|---|
| `Simple Earn Flexible Subscription` | Funding | El capital se mueve internamente a Earn; no es una venta ni una compra. |
| `Simple Earn Flexible Redemption` | Funding | Vuelta del capital de Earn a Spot; no es una compra. |
| `Simple Earn Locked Subscription` | Funding | Bloqueo en Earn Locked; el capital sigue siendo tuyo. |
| `Simple Earn Locked Redemption` | Funding | Liberación del bloqueo; el capital vuelve a Spot. |
| `Token Swap - Redenomination/Rebranding` | Funding | La salida del token viejo en un rebrand (la entrada del nuevo → AIRDROP). |
| `Dual Investment - Subscribe` | Funding | Suscripción a un producto estructurado de Binance. Pendiente de estudio fiscal completo. |
| `Dual Investment - Settlement` | Funding | Liquidación del producto estructurado. Pendiente de estudio fiscal completo. |
| `Fiat OCBS - Add Fiat and Fees` | Spot | Asiento contable interno del sistema OCBS; la compra ya queda registrada en `Buy Crypto With Card`. |
| `Deposit Fiat OCBS` | Spot | Asiento contable interno del sistema OCBS; redundante con `Convert Fiat to Crypto OCBS`. |

### Cómo lo procesamos

El parser los reconoce y los descarta silenciosamente. Quedan registrados como operaciones "ignoradas" en el log del import para auditoría, pero no se insertan en la tabla de transacciones.

### Fiscalmente (España — IRPF)

Ningún hecho imponible. Son movimientos internos entre cuentas propias o asientos contables auxiliares del exchange.

---

## Apéndice A — Cuenta Strategy (grid bots y bots de trading)

La cuenta **Strategy** es la sub-cuenta que Binance usa para aislar los activos de los bots de grid trading y otros productos de trading algorítmico. El CSV la identifica con `Account = Strategy`.

### Operaciones soportadas en Strategy

| Etiqueta CSV | Tipo interno | Descripción |
|---|---|---|
| `Transaction Buy` | `BUY` | Compra ejecutada automáticamente por el bot (orden de compra del grid). |
| `Transaction Spend` | `BUY` | Coste de la compra del bot (USDT u otro par base). |
| `Transaction Fee` | `BUY` | Comisión de la operación del bot (normalmente en el activo comprado). |
| `Transaction Sold` | `SELL` | Venta ejecutada automáticamente por el bot (orden de venta del grid). |
| `Transaction Revenue` | `SELL` | Ingreso de la venta del bot. |
| `Transfer Between Spot and Strategy Account` | `TRANSFER_INTERNAL` | Capital entrando o saliendo de la sub-cuenta Strategy. |

### Flujo típico de un grid bot

```text
[Abrir bot]
Spot → Strategy: USDT 200 (Transfer Between Spot and Strategy Account)

[El bot opera durante días/semanas]
Strategy: Transaction Buy AMP + Transaction Spend USDT  (compras del grid)
Strategy: Transaction Sold AMP + Transaction Revenue USDT (ventas del grid)
Spot:     Strategy Trading Fee Rebate AMP + BNB          (rebate de fees)

[Cerrar bot]
Strategy → Spot: USDT 212 + AMP 0.40 (dos TRANSFER_INTERNAL simultáneas al mismo segundo)
```

El capital USDT que entra y sale de Strategy se trata como transferencia interna — sin evento fiscal. Las compras y ventas que ejecuta el bot dentro de Strategy sí son hechos imponibles (cada venta genera ganancia o pérdida patrimonial).

### Fiscalmente (España — IRPF)

Cada venta ejecutada por el bot dentro de Strategy es una **transmisión patrimonial** (art. 33 LIRPF), igual que una venta manual en Spot. El hecho de que la operación la haga un bot automático no cambia su naturaleza fiscal.

---

## Apéndice — Resumen rápido de tipos internos

| Tipo interno | Descripción corta | Abre lote | Consume lotes | Hecho imponible |
|---|---|---|---|---|
| `BUY` | Compra EUR→cripto o swap cripto→cripto | ✅ (activo recibido) | ✅ si pagó con cripto | Solo el activo pagado (si era cripto) |
| `SELL` | Venta cripto→EUR | ❌ | ✅ | ✅ Ganancia/pérdida patrimonial |
| `FEE_EXCHANGE` | Fee pagada en cripto | ❌ | ✅ | ✅ Ganancia/pérdida patrimonial |
| `STAKING_REWARD` | Recompensa de staking PoS | ✅ (al precio de mercado) | ❌ | ✅ Rendimiento capital mobiliario (art. 25.4) |
| `LENDING_INTEREST` | Interés de Simple Earn Flexible | ✅ (al precio de mercado) | ❌ | ✅ Rendimiento capital mobiliario (art. 25.2) |
| `LENDING_INTEREST_LOCKED` | Interés de Simple Earn Locked | ✅ (al precio de mercado) | ❌ | ✅ Rendimiento capital mobiliario (art. 25.2) |
| `AIRDROP` | Token recibido gratis | ✅ (al precio de mercado) | ❌ | ✅ Ganancia patrimonial (art. 33.1) |
| `CASHBACK` | Bono / rebate recibido | ✅ (al precio de mercado) | ❌ | ✅ Ganancia patrimonial (art. 33.1) |
| `STAKING_LOCK` | Bloqueo para staking | ❌ | ❌ | ❌ No imponible |
| `STAKING_UNLOCK` | Desbloqueo de staking | ❌ | ❌ | ❌ No imponible |
| `LAUNCHPOOL_LOCK` | Bloqueo en Launchpool | ❌ | ❌ | ❌ No imponible |
| `LAUNCHPOOL_UNLOCK` | Desbloqueo de Launchpool | ❌ | ❌ | ❌ No imponible |
| `TRANSFER_INTERNAL` | Movimiento entre sub-cuentas | ❌ (mueve lotes) | ❌ (mueve lotes) | ❌ No imponible |
| `DEPOSIT_FIAT` | Ingreso fiat en exchange | ❌ | ❌ | ❌ No imponible |
| `WITHDRAW_FIAT` | Retiro fiat a banco | ❌ | ❌ | ❌ No imponible |
| `DEPOSIT_CRYPTO` | Depósito cripto desde wallet externa | ✅ (precio de mercado) | ❌ | ❌ No imponible (transferencia propia) |
| `WITHDRAW` | Retiro cripto a wallet externa | ❌ | ✅ (o mueve lotes) | ❌ si es wallet propia |
| `IGNORED` | Asiento contable auxiliar | ❌ | ❌ | ❌ No imponible |

---

*Última actualización: 2026-06-14. Basado en la legislación española vigente (LIRPF, consultas DGT). Esta documentación no constituye asesoramiento fiscal — consulta con un profesional para tu situación concreta.*
