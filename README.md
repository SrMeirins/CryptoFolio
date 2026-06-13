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
git clone https://github.com/tu-usuario/cryptofolio.git
cd cryptofolio
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

Puedes generar un JWT_SECRET seguro con:

```bash
openssl rand -hex 32
```

### 3. Arranca la aplicación

```bash
docker compose up -d
```

La primera vez descargará las imágenes y construirá los contenedores (~2 minutos).

### 4. Abre el navegador

```
http://localhost:5173
```

---

## Actualizar a una nueva versión

```bash
git pull
docker compose up -d --build
```

---

## Configuración en un VPS (producción)

Si quieres acceder desde fuera de localhost, necesitas un servidor con Docker y un proxy inverso (Nginx o Caddy).

### Variables adicionales para producción

En tu `.env`:

```env
NODE_ENV=production
CORS_ORIGIN=https://tudominio.com
VITE_API_URL=https://tudominio.com/api
VITE_WS_URL=wss://tudominio.com
```

### Ejemplo con Caddy (recomendado, HTTPS automático)

```caddyfile
tudominio.com {
    reverse_proxy /api/* localhost:3001
    reverse_proxy /* localhost:5173
}
```

---

## Estructura del proyecto

```
cryptofolio/
├── backend/          # API Node.js + TypeScript
│   └── src/
│       ├── routes/   # Endpoints REST
│       ├── modules/  # Lógica de negocio (FIFO, precios, operaciones)
│       └── db/       # Schema SQL y cliente PostgreSQL
├── frontend/         # React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/    # Dashboard, Portfolio, Fiscal, Historial, Settings
│       └── components/
└── docker-compose.yml
```

---

## Licencia

CryptoFolio es **gratuito para uso personal self-hosted** bajo la licencia [AGPL-3.0](LICENSE).

El uso comercial (ofrecer el software como servicio, integrarlo en un producto de pago) requiere una [licencia comercial](COMMERCIAL_LICENSE.md).

---

## Aviso legal

Este software es orientativo y no constituye asesoramiento fiscal. Consulta con un asesor fiscal antes de presentar tu declaración de la renta.
