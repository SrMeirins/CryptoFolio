# Política de seguridad

## Versiones soportadas

Solo la **última versión publicada** en [Releases](https://github.com/SrMeirins/CryptoFolio/releases) recibe correcciones de seguridad. Si usas una anterior, actualiza antes de reportar.

## Dependencias

- Todas las dependencias se fijan con **versión exacta** (lo comprueba el CI con `scripts/check-exact-versions.mjs`).
- Una versión nueva solo se adopta cuando lleva **al menos 2 semanas publicada**, para dar tiempo a detectar paquetes comprometidos o defectuosos.
- **Excepción:** las correcciones de avisos de seguridad de severidad **alta o crítica** se adoptan sin esperar. Las de severidad moderada o baja siguen la regla general.
- El CI ejecuta la auditoría con `scripts/audit.mjs`: falla con avisos altos o críticos sin corregir. Un aviso sin corrección disponible puede aceptarse de forma **temporal** en `scripts/audit-exceptions.json`, con motivo, issue de seguimiento y fecha de caducidad; al caducar, el CI vuelve a fallar.

## Cómo reportar una vulnerabilidad

**No abras una issue pública.** Repórtala en privado desde
[Security → Report a vulnerability](https://github.com/SrMeirins/CryptoFolio/security/advisories/new).
Solo el mantenedor puede ver el reporte.

Incluye, si puedes:

- Qué componente se ve afectado (backend, frontend, app de escritorio, Docker).
- Pasos para reproducirlo o una prueba de concepto.
- Impacto que estimas (qué podría hacer un atacante).

No incluyas datos reales de terceros ni credenciales válidas.

## Qué esperar

CryptoFolio es un proyecto mantenido por una persona, así que los plazos son orientativos:

- **Acuse de recibo:** en un máximo de 7 días.
- **Evaluación inicial:** en un máximo de 14 días, con la severidad estimada.
- **Corrección y publicación:** según la severidad. Se coordinará contigo la divulgación y se te dará crédito en el aviso si lo deseas.

Gracias por ayudar a mantener CryptoFolio seguro.
