# CryptoFolio

**Portfolio de criptomonedas con módulo fiscal para España.**

Seguimiento en tiempo real de tus wallets y exchanges, cálculo de ganancias y pérdidas patrimoniales por el método FIFO, estimación IRPF y exportación de informes fiscales — todo self-hosted, tus datos en tu servidor.

---

## Características

- **Portfolio en tiempo real** — precios vía Binance WebSocket, actualización automática
- **Múltiples wallets y exchanges** — hardware wallets, Binance, Kraken, etc.
- **Módulo fiscal (España)** — cálculo FIFO, ganancias/pérdidas patrimoniales, rendimientos del capital mobiliario
- **Estimación IRPF** — tramos configurables, base del ahorro
- **Informe PDF profesional** — apto para llevar al gestor o consultar con Hacienda
- **Importación CSV** — compatible con exports de los principales exchanges
- **Historial de operaciones** — filtros, búsqueda, exportación Excel
- **Self-hosted** — tus datos no salen de tu servidor

---

## Instalación rápida

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Clona el repositorio

```bash
git clone https://github.com/SrMeirins/CryptoFolio.git
cd CryptoFolio
```

### 2. Configura el entorno

```bash
cp .env.example .env
```

Edita `.env` y cambia como mínimo:

```env
POSTGRES_PASSWORD=una_contraseña_segura
DATABASE_URL=postgresql://cryptotracker:una_contraseña_segura@postgres:5432/cryptotracker
JWT_SECRET=una_clave_aleatoria_de_minimo_32_caracteres
```

Genera el JWT_SECRET con:

```bash
openssl rand -hex 32
```

### 3. Arranca la aplicación

```bash
docker compose up -d
```

La primera vez descargará las imágenes y construirá los contenedores (~2 minutos).

### 4. Abre el navegador

```text
http://localhost:5173
```

---

## Actualizar a una nueva versión

```bash
git pull
docker compose up -d --build
```

---

## Despliegue en VPS (producción)

`docker-compose.prod.yml` incluye todo lo necesario para producción:

- **Caddy** — HTTPS automático con Let's Encrypt, HTTP→HTTPS redirect
- **nginx** — sirve el frontend compilado, proxea `/api` y `/ws` al backend
- **Redes aisladas** — PostgreSQL y backend solo accesibles internamente
- **Usuarios no-root** en todos los contenedores
- **Límites de CPU y memoria** por servicio

### 1. Requisitos previos en el VPS

- Docker y Docker Compose instalados
- Puertos **80** y **443** abiertos en el firewall
- Un dominio con un registro **A** apuntando a la IP del VPS

### 2. Configura el `.env`

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales:

```env
POSTGRES_PASSWORD=una_clave_muy_segura
DATABASE_URL=postgresql://cryptotracker:una_clave_muy_segura@postgres:5432/cryptotracker
JWT_SECRET=genera_con_openssl_rand_hex_32
DOMAIN=tudominio.com
```

### 3. Arranca

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy obtiene el certificado SSL automáticamente en el primer arranque (~30 segundos).
La app estará disponible en `https://tudominio.com`.

---

## Estructura del proyecto

```text
CryptoFolio/
├── backend/          # API Node.js + TypeScript
│   └── src/
│       ├── routes/   # Endpoints REST
│       ├── modules/  # Lógica de negocio (FIFO, precios, operaciones)
│       └── db/       # Schema SQL y cliente PostgreSQL
├── frontend/         # React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/    # Dashboard, Portfolio, Fiscal, Historial, Settings
│       └── components/
├── Caddyfile                 # Configuración HTTPS producción
├── docker-compose.yml        # Desarrollo local
└── docker-compose.prod.yml   # Producción
```

---

## Licencia

CryptoFolio es **gratuito para uso personal self-hosted** bajo la licencia [AGPL-3.0](LICENSE).

El uso comercial (ofrecer el software como servicio, integrarlo en un producto de pago) requiere una [licencia comercial](COMMERCIAL_LICENSE.md).

---

## Aviso legal

Este software es orientativo y no constituye asesoramiento fiscal. Consulta con un asesor fiscal antes de presentar tu declaración de la renta.
