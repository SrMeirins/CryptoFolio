<div align="center">

<img src="public/favicon.svg" width="80" alt="CryptoFolio logo" />

# CryptoFolio

**Gestión de portfolio y fiscalidad crypto para España — 100% self-hosted**

*Tus datos en tu máquina. Sin suscripciones. Sin nubes.*

<br/>

[![License: AGPL-3.0](https://img.shields.io/badge/licencia-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/get-docker/)
[![Node](https://img.shields.io/badge/node-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![España](https://img.shields.io/badge/España-IRPF_FIFO-c60b1e?style=flat-square)](https://www.agenciatributaria.es)

[![GitHub stars](https://img.shields.io/github/stars/SrMeirins/CryptoFolio?style=flat-square&color=f5a623)](https://github.com/SrMeirins/CryptoFolio/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/SrMeirins/CryptoFolio?style=flat-square&color=f5a623)](https://github.com/SrMeirins/CryptoFolio/forks)
[![GitHub issues](https://img.shields.io/github/issues/SrMeirins/CryptoFolio?style=flat-square)](https://github.com/SrMeirins/CryptoFolio/issues)

</div>

---

## ¿Qué es CryptoFolio?

CryptoFolio es una aplicación **gratuita y open source** para gestionar tu portfolio de criptomonedas y calcular tu declaración de la renta en España.

Diseñada para inversores que quieren **control total** sobre sus datos: se instala en tu propio ordenador con un solo comando, sin crear cuentas, sin enviar tus datos a ningún servidor externo.

> **¿Por qué self-hosted?** Las apps de crypto tax online cuestan entre 50€ y 200€/año y tienen acceso completo a tu historial financiero. Con CryptoFolio, todo queda en tu máquina.

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
- Soporte para **wallets frías** (Ledger, Tangem, Trezor...) y **exchanges** (Binance, Kraken...)
- Variación **24h** por activo con indicadores visuales
- Distribución del portfolio con gráfico interactivo
- Detección de **posiciones de polvo** (dust)

### 🧾 Fiscal (España)
- Cálculo **FIFO** según normativa española vigente (LIRPF)
- Ganancias y pérdidas patrimoniales separadas por activo y año
- Rendimientos del capital mobiliario (staking, intereses, airdrops)
- Estimación de cuota **IRPF** por tramos configurables
- Compensación de pérdidas de ejercicios anteriores
- Modelo **721** (criptomonedas en el extranjero)
- **Informe PDF profesional** listo para llevar al gestor

### 📥 Importación
- CSV de **Binance** (español e inglés)
- Deduplicación automática — importa el mismo CSV dos veces sin problemas
- Preview antes de confirmar la importación
- Asignación de coste de adquisición para depósitos externos
- Motor FIFO que se **recalcula automáticamente** tras cada importación

### 📋 Historial
- Búsqueda y filtrado por fecha, activo, tipo de operación y wallet
- Exportación a **Excel**
- Vista de operaciones manuales y agrupadas

---

## 📸 Capturas de pantalla

<div align="center">

| Dashboard | Portfolio |
|:---------:|:---------:|
| ![Dashboard](https://raw.githubusercontent.com/SrMeirins/CryptoFolio/main/docs/screenshots/dashboard.png) | ![Portfolio](https://raw.githubusercontent.com/SrMeirins/CryptoFolio/main/docs/screenshots/portfolio.png) |

| Módulo Fiscal | Informe PDF |
|:-------------:|:-----------:|
| ![Fiscal](https://raw.githubusercontent.com/SrMeirins/CryptoFolio/main/docs/screenshots/fiscal.png) | ![PDF](https://raw.githubusercontent.com/SrMeirins/CryptoFolio/main/docs/screenshots/pdf.png) |

</div>

> 📌 *Añade tus propias capturas de pantalla en `docs/screenshots/` y actualiza este README.*

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

## 🚀 Instalación paso a paso

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

Ahora abre el archivo `.env` con cualquier editor de texto (Notepad, VSCode, etc.) y cambia los valores marcados:

```env
# Cambia "cambia_esto" por una contraseña que tú elijas (sin espacios)
POSTGRES_PASSWORD=MiContraseñaSegura123
DATABASE_URL=postgresql://cryptotracker:MiContraseñaSegura123@postgres:5432/cryptotracker

# Genera una clave aleatoria para JWT (ver instrucciones abajo)
JWT_SECRET=pega_aqui_la_clave_generada
```

**Para generar el JWT_SECRET:**

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

```
✔ Container cryptotracker_postgres   Started
✔ Container cryptotracker_backend    Started
✔ Container cryptotracker_frontend   Started
```

---

### Paso 5 — Abre el navegador

```
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

### 1. Importa tus transacciones

Ve a **Importación** → exporta el CSV de tu exchange y súbelo.

- **Binance:** Cartera → Historial → Generar estado de cuenta → exportar CSV
- Otros exchanges: en desarrollo

### 2. Ejecuta el motor FIFO

Tras importar, el motor FIFO se ejecuta automáticamente y calcula tus lotes de adquisición.

### 3. Revisa tu portfolio

En **Portfolio** verás el valor actual de cada activo, el P&L y la distribución.

### 4. Consulta el módulo fiscal

En **Fiscal** selecciona el año y verás:
- Ganancias y pérdidas patrimoniales
- Rendimientos del capital mobiliario
- Estimación de cuota IRPF
- Opción de exportar el informe en PDF

---

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Es seguro? ¿Mis datos van a algún servidor?</b></summary>

No. CryptoFolio funciona completamente en tu máquina. Los únicos datos que salen son las peticiones de precios a Binance y CoinGecko (que son APIs públicas sin autenticación). Tu historial de transacciones nunca sale de tu ordenador.

</details>

<details>
<summary><b>¿Puedo usar la app con exchanges distintos a Binance?</b></summary>

De momento el parser de CSV está optimizado para Binance (exportación en español e inglés). Se puede añadir soporte para otros exchanges. Si quieres contribuir, abre un issue.

</details>

<details>
<summary><b>¿Los cálculos fiscales son correctos?</b></summary>

Los cálculos implementan el método FIFO según la normativa española vigente (LIRPF). No obstante, esta aplicación es orientativa y **no sustituye el asesoramiento de un gestor o asesor fiscal**. Contrasta siempre los resultados antes de presentar tu declaración.

</details>

<details>
<summary><b>¿Qué pasa si cierro el ordenador? ¿Se pierden los datos?</b></summary>

No. Los datos se guardan en un volumen Docker que persiste aunque pares o reinicias los contenedores. Solo se perderían si borras explícitamente el volumen (`docker volume rm`).

</details>

<details>
<summary><b>El comando docker compose up -d da error. ¿Qué hago?</b></summary>

Los errores más comunes:
- **Puerto ya en uso:** otro programa usa el puerto 5173 o 3001. Puedes cambiarlo en el `.env`.
- **Docker no está corriendo:** abre Docker Desktop y espera a que arranque.
- **Error de permisos en Linux:** asegúrate de haber ejecutado `sudo usermod -aG docker $USER` y haber cerrado sesión.

Si el problema persiste, abre un [issue](https://github.com/SrMeirins/CryptoFolio/issues) con el mensaje de error.

</details>

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Si encuentras un bug, tienes una idea o quieres añadir soporte para un nuevo exchange:

1. Abre un [issue](https://github.com/SrMeirins/CryptoFolio/issues) describiendo el problema o la mejora
2. Si quieres implementarlo tú, haz un fork y abre un Pull Request
3. Para cambios grandes, mejor discútelo en el issue antes de ponerte a programar

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
