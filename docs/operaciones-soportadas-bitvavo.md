# Operaciones soportadas — Bitvavo CSV

Referencia completa de todos los tipos de operación que CryptoFolio reconoce e importa desde el historial CSV de Bitvavo. Bitvavo es una cuenta única (sin sub-cuentas como Spot/Margin/Funding en Binance), así que su modelo de operaciones es mucho más simple: solo 4 tipos reconocidos.

Cada sección describe qué es la operación, cómo aparece en el CSV, cómo la procesamos internamente, cómo se refleja en el historial y el portfolio, y cuál es su tratamiento fiscal en España (IRPF).

---

## Índice

1. [BUY — Compra de criptomoneda](#1-buy--compra-de-criptomoneda)
2. [DEPOSIT — Depósito de fiat o cripto](#2-deposit--depósito-de-fiat-o-cripto)
3. [WITHDRAWAL — Retiro de fiat o cripto](#3-withdrawal--retiro-de-fiat-o-cripto)
4. [REBATE — Devolución de comisión](#4-rebate--devolución-de-comisión)
5. [Tipos no reconocidos — fallo explícito, no silencioso](#5-tipos-no-reconocidos--fallo-explícito-no-silencioso)
6. [Zona horaria y conversión a UTC](#6-zona-horaria-y-conversión-a-utc)

---

## 1. BUY — Compra de criptomoneda

### Qué es

Una compra de criptomoneda con fiat (normalmente EUR) en el mercado de Bitvavo.

### Columna CSV

| Columna | Valor |
|---------|-------|
| `Type`  | `buy` |

### Ejemplo de CSV

```csv
Europe/Madrid,2024-03-15,10:30:00.000,buy,BTC,0.00250000,EUR,285.71,EUR,-285.94,EUR,-0.23,Completed,abc123,
```

### Cómo lo procesamos

- El activo comprado y su cantidad vienen de `Currency`/`Amount`.
- El coste viene de `Received / Paid Currency`/`Received / Paid Amount` (con fallback a `Quote Currency` si el primero viniera vacío).
- **El fee va incluido en `Received / Paid Amount` cuando está en la misma moneda de cotización** (normalmente EUR) — verificado numéricamente: `Quote Price × Amount + Fee = Received/Paid Amount`. En ese caso no se registra por separado, para no restarlo dos veces. Si Bitvavo cobrara el fee en un activo distinto al de cotización, sí se registra aparte (`feeAsset`/`feeAmount`) para que el motor FIFO lo trate como una disposición patrimonial independiente.
- Solo se procesan filas con `Status = Completed`. Cualquier otro estado (pendiente, cancelada) se ignora.

### En el historial

Aparece como **"Compra"**, igual que un BUY de Binance — mismo tratamiento visual en toda la app, independiente del exchange de origen.

### En FIFO

Se **abre un lote nuevo** para el activo comprado, con `cost_basis_eur` = lo pagado en EUR (fee ya incluido si aplica, ver arriba).

### Fiscalmente (España — IRPF)

Una compra EUR → cripto **no es un hecho imponible** en sí — se registra el coste de adquisición del lote para calcular la ganancia o pérdida cuando se venda (art. 14 y 35 LIRPF). Mismo criterio que en Binance.

---

## 2. DEPOSIT — Depósito de fiat o cripto

### Qué es

Ingreso de fondos en Bitvavo — puede ser una transferencia bancaria en EUR o la recepción de cripto desde una wallet externa propia.

### Columna CSV

| Columna | Valor     |
|---------|-----------|
| `Type`  | `deposit` |

### Ejemplo de CSV

**Depósito fiat:**

```csv
Europe/Madrid,2024-01-10,09:00:00.000,deposit,EUR,1000.00000000,,,,,,,Completed,abc124,
```

**Depósito cripto (desde wallet externa):**

```csv
Europe/Madrid,2024-02-01,11:00:00.000,deposit,ETH,0.50000000,,,,,,,Completed,abc125,0x1234...
```

### Cómo lo procesamos

Se distingue automáticamente por el activo: si `Currency` es EUR/USD/GBP/CHF, se registra como `DEPOSIT_FIAT`. Cualquier otro activo se registra como `DEPOSIT_CRYPTO`.

Para el depósito de cripto, se marca `needsCostReview: true` — la app avisa de que el coste de adquisición original se desconoce (el CSV de Bitvavo no lo incluye, viene de fuera) y **conviene revisarlo y ajustarlo a mano** si se conoce el precio real de compra.

### En el historial

`DEPOSIT_FIAT` aparece como **"Depósito fiat"**; `DEPOSIT_CRYPTO` como **"Depósito crypto"**, con un aviso de revisión de coste si aplica.

### En FIFO

- `DEPOSIT_FIAT`: no genera lotes, es un apunte contable.
- `DEPOSIT_CRYPTO`: se abre un lote al precio de mercado del momento del depósito (CoinGecko histórico) como valor de referencia — ajustable manualmente después si el coste real era otro.

### Fiscalmente (España — IRPF)

Ninguno de los dos es un hecho imponible. Para el depósito de cripto, el coste de adquisición real a efectos fiscales es el que se pagó originalmente por esos tokens, no el precio de mercado del día del depósito — de ahí el aviso de revisión.

---

## 3. WITHDRAWAL — Retiro de fiat o cripto

### Qué es

Salida de fondos de Bitvavo — transferencia bancaria en EUR o envío de cripto a una wallet externa.

### Columna CSV

| Columna | Valor        |
|---------|--------------|
| `Type`  | `withdrawal` |

### Ejemplo de CSV

```csv
Europe/Madrid,2024-06-30,15:00:00.000,withdrawal,ETH,0.50000000,,,,,ETH,0.00300000,Completed,abc126,0x5678...
```

### Cómo lo procesamos

Igual que en el depósito, se distingue por el activo: EUR/USD/GBP/CHF → `WITHDRAW_FIAT`; cualquier otro → `WITHDRAW`.

**Fee de red en el mismo activo retirado:** cuando `Fee currency` coincide con `Currency`, el fee va incluido dentro de `Amount` (verificado: `Amount` coincide con la cantidad bruta enviada, y `Fee` es una porción de ese `Amount`). El importe neto que llega a la wallet destino es `Amount − Fee`. Esa porción de fee se registra como `feeAsset`/`feeAmount` para que el motor FIFO la trate como una disposición patrimonial (hecho imponible) antes de mover el resto a la wallet destino.

### En el historial

`WITHDRAW_FIAT` aparece como **"Retiro fiat"**; `WITHDRAW` como **"Retiro crypto"**.

### En FIFO

- `WITHDRAW_FIAT`: no genera lotes.
- `WITHDRAW`: se consume la porción de fee (si la hay) como disposición patrimonial; el resto se mueve a la wallet de destino si está registrada en CryptoFolio, o queda `destination_pending` si no.

### Fiscalmente (España — IRPF)

El retiro a una wallet propia **no es un hecho imponible** (no hay cambio de propietario) — salvo la porción de fee de red pagada en el propio activo, que sí es una disposición patrimonial (permuta del activo por el servicio de red).

---

## 4. REBATE — Devolución de comisión

### Qué es

Bitvavo no documenta este tipo con detalle públicamente. Por los importes observados, coincide con devoluciones puntuales de comisión de trading (promociones). Se trata con cautela: se registra para que no se pierda del tracking, dejando constancia explícita de la incertidumbre para que se revise el tratamiento fiscal caso por caso.

### Columna CSV

| Columna | Valor    |
|---------|----------|
| `Type`  | `rebate` |

### Ejemplo de CSV

```csv
Europe/Madrid,2024-04-10,12:00:00.000,rebate,EUR,1.50000000,,,,,,,Completed,abc127,
```

### Cómo lo procesamos

Se registra como `CASHBACK` — mismo tipo interno que las devoluciones de comisión de Binance — con una nota explícita: *"Bitvavo rebate — probable devolución de comisión de trading (verificar tratamiento fiscal)"*.

### En el historial

Aparece como **"Cashback"**, con la nota de incertidumbre visible en el detalle de la operación.

### En FIFO

Se abre un lote nuevo al precio de mercado del momento de recepción (igual que un `CASHBACK` de Binance).

### Fiscalmente (España — IRPF)

Tratado por defecto como **ganancia patrimonial no derivada de transmisión** (art. 33.1 LIRPF), igual que un cashback de Binance — pero con la salvedad explícita de que Bitvavo no confirma la naturaleza exacta de este tipo. Si tu volumen de `rebate` es significativo, conviene revisarlo con un asesor fiscal antes de dar por buena la clasificación automática.

---

## 5. Tipos no reconocidos — fallo explícito, no silencioso

Bitvavo puede introducir en el futuro un `Type` que este parser no conozca todavía (por ejemplo, si empezara a exportar ventas como un tipo `sell` separado, o añadiera staking). El comportamiento es el mismo que en el parser de Binance: **el import se detiene con un error explícito** —

> *"Tipo(s) de operación Bitvavo no reconocido(s): `<tipo>`. Bitvavo puede haber añadido un tipo nuevo — verifica manualmente antes de continuar."*

— en vez de ignorar la fila en silencio o clasificarla mal. Ningún tipo de operación real se pierde ni se malinterpreta sin que el usuario se entere.

*Nota: al 2026-09-30, el conjunto de tipos verificado contra CSVs reales de Bitvavo es exactamente `buy`, `deposit`, `withdrawal`, `rebate` — no se ha observado un tipo `sell` independiente en la práctica.*

---

## 6. Zona horaria y conversión a UTC

A diferencia de Binance (que exporta directamente en UTC), el CSV de Bitvavo da la fecha/hora en **hora local** junto con el nombre de zona horaria IANA (columna `Timezone`, p. ej. `Europe/Madrid`). CryptoFolio convierte esto a UTC real respetando el cambio de horario (CET/CEST) de la fecha concreta, usando `Intl.DateTimeFormat` (sin tablas de offset hardcodeadas).

**Caso límite conocido y documentado:** en la madrugada del último domingo de octubre, la franja horaria local 02:00–02:59 ocurre dos veces (primero en CEST, luego en CET tras el cambio de hora). El CSV de Bitvavo no distingue cuál de las dos ocurrencias es una operación concreta. CryptoFolio resuelve siempre a la segunda ocurrencia (CET) — una operación real en la primera ocurrencia (CEST) quedaría registrada hasta 1 hora más tarde de lo real. Es un caso extremo (una hora al año, solo afecta a operaciones en esa franja exacta).

---

*Última actualización: 2026-09-30. Basado en el código real del parser (`backend/src/modules/csv/bitvavoParser.ts`) y verificado contra CSVs reales de Bitvavo. Esta documentación no constituye asesoramiento fiscal — consulta con un profesional para tu situación concreta.*
