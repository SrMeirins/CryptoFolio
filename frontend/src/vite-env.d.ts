/// <reference types="vite/client" />

/** Versión de la app, inyectada por Vite desde package.json (#444). */
declare const __APP_VERSION__: string

/** Sección del CHANGELOG de esta versión, en Markdown; vacía si no estaba al compilar (#447). */
declare const __APP_CHANGELOG__: string
