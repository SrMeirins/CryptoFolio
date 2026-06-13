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

## Despliegue en VPS (producción)

Para un servidor accesible desde Internet usa `docker-compose.prod.yml`, que:
- Compila el frontend como estáticos servidos por **nginx** (sin Vite dev server)
- No expone PostgreSQL ni el backend fuera de la red Docker interna
- Escucha en el puerto 80

### 1. Prepara el `.env` para producción

```env
POSTGRES_USER=cryptotracker
POSTGRES_PASSWORD=cambia_esto_por_una_clave_segura
POSTGRES_DB=cryptotracker
DATABASE_URL=postgresql://cryptotracker:cambia_esto_por_una_clave_segura@postgres:5432/cryptotracker

JWT_SECRET=genera_con_openssl_rand_hex_32

NODE_ENV=production
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
PRICE_REFRESH_INTERVAL_MS=60000
```

Genera el JWT_SECRET con:
```bash
openssl rand -hex 32
```

### 2. Arranca en modo producción

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La app quedará disponible en el puerto 80 del servidor.

### 3. HTTPS con Caddy (recomendado)

Caddy gestiona el certificado SSL automáticamente. Instálalo en el host y crea un `Caddyfile`:

```caddyfile
tudominio.com {
    reverse_proxy localhost:80
}
```

```bash
caddy start
```

### 3b. HTTPS con Nginx en el host

Si prefieres Nginx, crea `/etc/nginx/sites-available/cryptofolio`:

```nginx
server {
    server_name tudominio.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Activa el sitio y obtén certificado con Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/cryptofolio /etc/nginx/sites-enabled/
sudo certbot --nginx -d tudominio.com
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
