<div align="center">

<img src="public/favicon.svg" width="80" alt="CryptoFolio logo" />

# CryptoFolio

**Gestión de portfolio y fiscalidad crypto para España — 100% self-hosted**

*Tus datos en tu máquina. Sin suscripciones. Sin nubes.*

<br/>

[![License: AGPL-3.0](https://img.shields.io/badge/licencia-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/SrMeirins/CryptoFolio?style=flat-square&color=22c55e&label=release)](https://github.com/SrMeirins/CryptoFolio/releases/latest)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/get-docker/)
[![Node](https://img.shields.io/badge/node-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![España](https://img.shields.io/badge/España-IRPF_FIFO-c60b1e?style=flat-square)](https://www.agenciatributaria.es)

[![GitHub stars](https://img.shields.io/github/stars/SrMeirins/CryptoFolio?style=flat-square&color=f5a623)](https://github.com/SrMeirins/CryptoFolio/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/SrMeirins/CryptoFolio?style=flat-square&color=f5a623)](https://github.com/SrMeirins/CryptoFolio/forks)
[![GitHub issues](https://img.shields.io/github/issues/SrMeirins/CryptoFolio?style=flat-square)](https://github.com/SrMeirins/CryptoFolio/issues)
[![CI](https://img.shields.io/github/actions/workflow/status/SrMeirins/CryptoFolio/release.yml?style=flat-square&label=CI)](https://github.com/SrMeirins/CryptoFolio/actions)

</div>

---

## ¿Qué es CryptoFolio?

CryptoFolio es una aplicación **gratuita y open source** para gestionar tu portfolio de criptomonedas y calcular tu declaración de la renta en España.

Diseñada para inversores que quieren **control total** sobre sus datos: se instala en tu propio ordenador con un solo comando, sin crear cuentas, sin enviar tus datos a ningún servidor externo.

> **¿Por qué self-hosted?** Las apps de crypto tax online cuestan entre 50€ y 200€/año y tienen acceso completo a tu historial financiero. Con CryptoFolio, todo queda en tu máquina.

---

## ⚠️ Compatibilidad actual

Es importante que sepas qué soporta la app **a día de hoy** antes de instalarla:

| Funcionalidad | Soportado |
| --- | --- |
| **Exchange para importar** | ✅ Binance (CSV en español e inglés) |
| **Wallets frías** | ✅ Configuración manual (Ledger, Tangem, Trezor...) — sin conexión directa al hardware |
| **Método de cálculo fiscal** | ✅ FIFO |
| **País** | ✅ España (IRPF) |
| **Otros exchanges** | ❌ No soportados de momento |
| **Sincronización on-chain** | ❌ No disponible |
| **Otros países / métodos** | ❌ No disponible |

> Si usas Binance y tributas en España, esta app es para ti.  
> Para otros exchanges o países, la app no es útil aún.

---

## Índice

- [Características](#-características)
- [Capturas de pantalla](#-capturas-de-pantalla)
- [Stack tecnológico](#-stack-tecnológico)
- [Instalación paso a paso](#-instalación-paso-a-paso)
- [Configuración](#-configuración)
- [Cómo usar la app](#-cómo-usar-la-app)
- [Preguntas frecuentes](#-preguntas-frecuentes)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## ✨ Características

### 📊 Portfolio
- Precios en **tiempo real** vía Binance WebSocket — sin delay, sin refresco manual
- **Wallets frías** configuradas manualmente (Ledger, Tangem, Trezor...) y cuenta de **Binance** vía CSV
- Variación **24h** por activo con indicadores visuales
- Distribución del portfolio con gráfico interactivo
- Detección de **posiciones de polvo** (dust)

### 🧾 Fiscal — España
- Cálculo **FIFO** según normativa española vigente (LIRPF)
- Ganancias y pérdidas patrimoniales separadas por activo y año
- Rendimientos del capital mobiliario (staking, intereses, airdrops)
- Estimación de cuota **IRPF** por tramos configurables
- Compensación de pérdidas de ejercicios anteriores
- Modelo **721** (criptomonedas en el extranjero)
- **Informe PDF profesional** listo para llevar al gestor

### 📥 Importación — Solo Binance

- CSV exportado desde Binance (idioma español e inglés)
- Deduplicación automática — importa el mismo CSV dos veces sin problemas
- Preview antes de confirmar la importación
- Asignación de coste de adquisición para depósitos externos (transfers desde wallets frías)
- Motor FIFO que se **recalcula automáticamente** tras cada importación
- **+40 tipos de operación soportados**: compras, ventas, staking, Launchpool, ETH 2.0, airdrops, cashback, grid bots (Strategy), transfers internos, margin…

> 📖 **[Ver referencia completa de operaciones soportadas →](docs/operaciones-soportadas.md)**

### 📋 Historial
- Búsqueda y filtrado por fecha, activo, tipo de operación y wallet
- Exportación a **Excel**
- Vista de operaciones agrupadas por tipo

---

## 📸 Capturas de pantalla

### Dashboard

![Dashboard](docs/screenshots/dashboard.png)

### Portfolio

![Portfolio](docs/screenshots/portfolio.png)

### Módulo Fiscal

![Fiscal](docs/screenshots/fiscal.png)

### Informe PDF

![PDF](docs/screenshots/pdf.png)

---

## 🛠️ Stack tecnológico

<div align="center">

| Capa | Tecnología |
|:----:|:----------:|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS · Recharts |
| Backend | Node.js 20 · Express · TypeScript |
| Base de datos | PostgreSQL 16 |
| Precios | Binance WebSocket API · CoinGecko API |
| Contenedores | Docker · Docker Compose |

</div>

---

## 💾 Descarga la app de escritorio

> La versión de escritorio instala todo automáticamente — sin Docker, sin configuración.

| Sistema | Descarga | Notas |
| --- | --- | --- |
| **Windows** | [CryptoFolio-Setup.exe](https://github.com/SrMeirins/CryptoFolio/releases/latest) | Instalador NSIS, no requiere admin |
| **macOS** | [CryptoFolio.dmg](https://github.com/SrMeirins/CryptoFolio/releases/latest) | Apple Silicon (M1/M2/M3). Sin notarizar — ver nota abajo |
| **Linux** | [CryptoFolio.deb](https://github.com/SrMeirins/CryptoFolio/releases/latest) | Para Debian / Ubuntu |

### macOS Gatekeeper — cómo abrir la app sin notarizar

La app no está notarizada con una cuenta Apple Developer de pago. Para abrirla la primera vez:

1. Abre el `.dmg` y arrastra `CryptoFolio.app` a Aplicaciones
2. Haz **clic derecho → Abrir** en el Finder (no doble clic)
3. Acepta el aviso de "desarrollador no identificado"

---

## 🚀 Instalación con Docker (self-hosted)

> ⏱️ **Tiempo estimado:** 5-10 minutos  
> 🖥️ **Compatible con:** Windows, macOS y Linux

### Paso 1 — Instala Docker

Docker es el programa que permite ejecutar CryptoFolio sin instalar nada más en tu sistema.

<details>
<summary><b>🪟 Windows</b></summary>

1. Descarga **Docker Desktop** desde [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Ejecuta el instalador y sigue los pasos (requiere reiniciar)
3. Abre Docker Desktop y espera a que el icono de la ballena aparezca en la barra de tareas
4. Abre **PowerShell** o **Terminal** y verifica que funciona:
   ```powershell
   docker --version
   ```
   Deberías ver algo como `Docker version 26.x.x`

</details>

<details>
<summary><b>🍎 macOS</b></summary>

1. Descarga **Docker Desktop** desde [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Arrastra Docker.app a tu carpeta de Aplicaciones
3. Ábrelo y acepta los permisos
4. Abre **Terminal** y verifica:
   ```bash
   docker --version
   ```

</details>

<details>
<summary><b>🐧 Linux (Ubuntu/Debian)</b></summary>

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Cierra sesión y vuelve a entrar para aplicar el grupo
docker --version
```

</details>

---

### Paso 2 — Descarga CryptoFolio

**Opción A — Con Git** (recomendado, te permite actualizar fácilmente):

Si no tienes Git, descárgalo desde [git-scm.com](https://git-scm.com/downloads).

```bash
git clone https://github.com/SrMeirins/CryptoFolio.git
cd CryptoFolio
```

**Opción B — Descarga directa:**

1. Haz clic en el botón verde **`Code`** de esta página
2. Selecciona **Download ZIP**
3. Extrae el ZIP en una carpeta de tu elección
4. Abre una terminal en esa carpeta

---

### Paso 3 — Configura el entorno

Necesitas crear un archivo `.env` con la configuración de la base de datos.

**En macOS / Linux:**

```bash
cp .env.example .env
```

**En Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

Abre el archivo `.env` con cualquier editor de texto (Notepad, VSCode...) y cambia los valores marcados:

```env
# Elige una contraseña para la base de datos (sin espacios ni comillas)
POSTGRES_PASSWORD=MiContraseñaSegura123
DATABASE_URL=postgresql://cryptotracker:MiContraseñaSegura123@postgres:5432/cryptotracker

# Genera una clave aleatoria para JWT (ver instrucciones abajo)
JWT_SECRET=pega_aqui_la_clave_generada
```

**Cómo generar el JWT_SECRET:**

*macOS / Linux:*

```bash
openssl rand -hex 32
```

*Windows (PowerShell):*

```powershell
[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Copia el resultado y pégalo como valor de `JWT_SECRET` en el `.env`.

---

### Paso 4 — Arranca la aplicación

```bash
docker compose up -d
```

La primera vez tardará unos minutos mientras descarga las imágenes. Verás algo así:

```text
✔ Container cryptotracker_postgres   Started
✔ Container cryptotracker_backend    Started
✔ Container cryptotracker_frontend   Started
```

---

### Paso 5 — Abre el navegador

```text
http://localhost:5173
```

¡Listo! 🎉

---

### Parar y arrancar

```bash
# Parar (los datos se conservan)
docker compose down

# Volver a arrancar
docker compose up -d

# Ver si está corriendo
docker compose ps
```

---

### Actualizar a una nueva versión

```bash
git pull
docker compose up -d --build
```

---

## ⚙️ Configuración

Todas las opciones se configuran en el archivo `.env`:

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `POSTGRES_PASSWORD` | Contraseña de la base de datos | *(obligatorio cambiarlo)* |
| `DATABASE_URL` | URL de conexión a PostgreSQL | *(debe coincidir con la contraseña)* |
| `JWT_SECRET` | Clave de seguridad interna | *(obligatorio generarla)* |
| `BACKEND_PORT` | Puerto del backend | `3001` |
| `PRICE_REFRESH_INTERVAL_MS` | Intervalo de refresco de precios (ms) | `60000` (1 min) |
| `COINGECKO_API_KEY` | API key de CoinGecko Pro (opcional) | vacío |

---

## 📖 Cómo usar la app

### 1. Exporta tu CSV desde Binance

Dentro de Binance: **Cartera → Historial → Generar estado de cuenta → Todos los registros → Exportar**

Descarga el CSV y guárdalo en tu ordenador.

> ⚠️ Solo se soporta el CSV de Binance. Otros exchanges no son compatibles actualmente.

### 2. Importa el CSV en CryptoFolio

Ve a la sección **Importación**, sube el CSV y revisa el preview antes de confirmar. El motor FIFO se ejecuta automáticamente tras la importación.

### 3. Configura tus wallets frías (opcional)

Si tienes activos en wallets frías (Ledger, Tangem, Trezor...), ve a **Settings → Wallets** y añádelas manualmente indicando qué activos tienes y en qué cantidad.

> Las wallets frías no se sincronizan automáticamente. Deberás actualizar los saldos manualmente cuando muevas fondos.

### 4. Revisa tu portfolio

En **Portfolio** verás el valor actual de todos tus activos, el P&L y la distribución entre wallets y exchanges.

### 5. Consulta el módulo fiscal

En **Fiscal** selecciona el año fiscal y verás:

- Ganancias y pérdidas patrimoniales (método FIFO)
- Rendimientos del capital mobiliario
- Estimación de cuota IRPF por tramos
- Exportación del informe en PDF

---

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Es seguro? ¿Mis datos van a algún servidor?</b></summary>

No. CryptoFolio funciona completamente en tu máquina. Los únicos datos que salen son peticiones de precios a las APIs públicas de Binance y CoinGecko (sin autenticación, sin datos personales). Tu historial de transacciones nunca sale de tu ordenador.

</details>

<details>
<summary><b>¿Funciona con Kraken, Coinbase u otros exchanges?</b></summary>

No. Actualmente solo se soporta la importación mediante el CSV de Binance. Otros exchanges requieren parsers específicos que no están implementados todavía. Si quieres contribuir añadiendo soporte para otro exchange, abre un issue.

</details>

<details>
<summary><b>¿Puedo usarla si no estoy en España?</b></summary>

El módulo de portfolio funciona para cualquier usuario. El módulo fiscal está diseñado exclusivamente para la normativa española (IRPF, método FIFO). Si tributas en otro país, los cálculos fiscales no serán válidos para ti.

</details>

<details>
<summary><b>¿Los cálculos fiscales son correctos?</b></summary>

Los cálculos implementan el método FIFO según la normativa española vigente (LIRPF). No obstante, esta aplicación es orientativa y **no sustituye el asesoramiento de un gestor o asesor fiscal**. Contrasta siempre los resultados antes de presentar tu declaración.

</details>

<details>
<summary><b>¿Qué pasa con mis datos si cierro el ordenador?</b></summary>

Los datos se guardan en un volumen Docker que persiste aunque apagues o reinicies el ordenador. Solo se perderían si eliminas explícitamente el volumen con `docker volume rm`.

</details>

<details>
<summary><b>El comando docker compose up -d da error. ¿Qué hago?</b></summary>

Los errores más comunes:

- **Puerto ya en uso:** otro programa usa el puerto 5173 o 3001. Puedes cambiarlo en el `.env`.
- **Docker no está corriendo:** abre Docker Desktop y espera a que arranque.
- **Error de permisos en Linux:** asegúrate de haber ejecutado `sudo usermod -aG docker $USER` y haber cerrado sesión.

Si el problema persiste, abre un [issue](https://github.com/SrMeirins/CryptoFolio/issues) con el mensaje de error completo.

</details>

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Áreas donde ayudar:

- 🏦 **Parsers para otros exchanges** (Kraken, Coinbase, KuCoin...)
- 🌍 **Soporte para otros países** (Portugal, Francia, Alemania...)
- 🐛 **Reporte de bugs** — abre un [issue](https://github.com/SrMeirins/CryptoFolio/issues)
- 💡 **Sugerencias** — también via issues

Para cambios grandes, abre primero un issue para discutirlo antes de ponerte a programar.

---

## 📄 Licencia

CryptoFolio es **gratuito para uso personal self-hosted** bajo la licencia [AGPL-3.0](LICENSE).

El uso comercial — ofrecer el software como servicio o integrarlo en un producto de pago — requiere una [licencia comercial](COMMERCIAL_LICENSE.md). Contacto: marincaserojorge@gmail.com

---

## ⚠️ Aviso legal

Este software tiene carácter orientativo y no constituye asesoramiento fiscal. Los cálculos se basan en el método FIFO según la normativa española vigente. Consulta con un asesor fiscal colegiado antes de presentar tu declaración de la renta.

---

<div align="center">

Hecho con ☕ en España

⭐ Si te resulta útil, dale una estrella al repo — ayuda mucho

</div>
