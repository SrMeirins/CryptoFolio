# Guía de estilo de textos

Norma para los textos de la interfaz de CryptoFolio: etiquetas, botones, avisos, ayudas y mensajes. Se aplica también a los textos de los PR que describen cambios visibles.

## Tono

- **Castellano claro y directo.** Frases cortas, una idea por frase. Sin anglicismos cuando hay palabra en castellano (importar, no «hacer import»), salvo nombres propios de los exchanges y siglas de uso común (P&L, FIFO, TWR, IRPF).
- **Tuteo.** «Añade el historial», «puedes realizar esa ganancia».
- **Sin alarmismo.** Se explica qué pasa y qué hacer; no se usan mayúsculas ni signos de exclamación para dar urgencia.
- **Orientativo en lo fiscal.** Lo que dependa de la interpretación de la norma lo dice («Consúltalo con tu asesor»), y cita el artículo cuando hay uno claro.

## Puntuación y símbolos

- **Sin raya larga (—).** En su lugar: dos puntos, coma, punto o paréntesis.
- **Sin flechas de texto** (→, ←, ›, ⇒). Las relaciones se dicen con palabras: «de 100 € a 120 €», «Ajustes, sección Wallets», «antes» y «después».
- **Sin emojis ni símbolos decorativos** en la interfaz. Los iconos van como componentes, con `aria-hidden` y texto equivalente cuando aportan significado.
- **Comillas angulares** para citar un elemento de la interfaz: pulsa «Guardar en mi wallet».
- **Mayúscula solo al principio** de títulos, botones y etiquetas: «Pérdidas pendientes de compensar», no «Pérdidas Pendientes De Compensar».

## Verbos y objetos

- **Botones: infinitivo con objeto concreto.** «Guardar en mi wallet», «Quitar marca», «Añadir historial de retiradas». Se evita el botón «Aceptar» o «Hacer» sin objeto.
- **Hechos: participio.** «Importación completada», «Wallet guardada», «Renta de 2024 declarada el 3 jun 2025».
- **Nombre accesible con destino.** Un enlace o celda pulsable dice adónde lleva: «Ver Pérdidas en Operaciones».

## Cifras y fechas

- **Formato común** de `frontend/src/utils/format.ts` (#489): nunca se escribe una cifra a mano.
- **Nunca «-0,00 €».** Un importe que redondea a cero es «0,00 €», y uno menor que la precisión es «< 0,01 €» o «-< 0,01 €».
- **Importes en cifras** y en la moneda de la pantalla. Lo fiscal siempre en euros.
- **Fechas legibles** con las utilidades de formato («3 jun 2025»). En los límites de la API van en ISO 8601.
- **Ejemplos con datos inventados** (activos AAA, BBB; importes redondos). Nunca cifras de una cartera real.

## Avisos, consejos e información

Se usa el componente `Notice` (`frontend/src/components/ui/Notice.tsx`) con uno de tres tipos. El tipo no va solo en el color: lleva icono y el lector de pantalla lo anuncia.

| Tipo | Cuándo | Ejemplo |
| --- | --- | --- |
| `aviso` | Algo requiere atención: datos incompletos, plazos, cifras que cambiaron. | «AAA no tiene precio configurado: valor y P&L no disponibles.» |
| `consejo` | Una acción recomendada que mejora el resultado. | «¿Es una wallet tuya? Guárdala y la próxima vez estos retiros se asignarán solos.» |
| `informacion` | Contexto que ayuda a leer la pantalla. | «Hay que presentarlo si el valor en exchanges extranjeros supera 50.000 €.» |

- **Título solo si hace falta:** cuando el aviso ocupa varias líneas o es una lista. Una frase suelta no lleva título.
- **Primero el hecho, después qué hacer:** «X caduca el 31 de diciembre: puedes…».
- **Acción opcional** con verbo y objeto, junto al texto.
- **Los errores de una acción no son avisos:** siguen la norma de errores y confirmaciones (#497).

## Explicaciones de cálculo

- **Pie de metodología** (`PieMetodologia`) en las pantallas con cálculos: una línea con el método y el enlace «Cómo calculamos».
- **Panel «Cómo calculamos»** (`frontend/src/components/metodologia/`): una sección por tema con qué hace la aplicación, la norma en que se apoya y un ejemplo. Si cambia un cálculo del backend, se actualiza su sección en el mismo cambio.
- **Ayudas «?»** (`Tooltip`, `InfoTooltip`) para la definición de una cifra concreta; no para avisos.
