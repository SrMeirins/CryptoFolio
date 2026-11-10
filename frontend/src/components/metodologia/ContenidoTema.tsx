import type { ReactNode } from 'react'
import type { TemaMetodo } from './temas'

// Texto de cada tema de «Cómo calculamos» (#493): qué hace la aplicación, la
// norma en que se apoya y un ejemplo con cifras inventadas. Debe coincidir con
// el cálculo del backend (motor FIFO, módulos pnl y fiscal): si cambia uno,
// cambia el otro.

function Ejemplo({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-background-tertiary px-3 py-2 text-fg-muted"><span className="font-semibold text-fg">Ejemplo. </span>{children}</p>
}

function Fuente({ children }: { children: ReactNode }) {
  return <p className="text-fg-subtle">Base: {children}</p>
}

export function ContenidoTema({ tema }: { tema: TemaMetodo }) {
  switch (tema) {
    case 'fifo':
      return (
        <>
          <p>Cada venta, permuta o pago consume primero las unidades de ese activo que adquiriste antes, estén en la wallet que estén.</p>
          <p>Un traspaso entre tus wallets no es una transmisión: no genera ganancia ni pérdida, y las unidades conservan su fecha y su coste.</p>
          <p>Una comisión en euros o en el propio activo suma al coste de la compra o resta del importe de la venta. Si se paga con otro activo, entregar ese activo cuenta además como una transmisión suya.</p>
          <Ejemplo>Compras 1 AAA a 100 € y, más tarde, otra a 150 €, que traspasas a tu wallet. Si vendes 1 AAA a 180 € desde esa wallet, se vende la de 100 €: ganancia de 80 €.</Ejemplo>
          <Fuente>art. 37.2 de la Ley del IRPF (valores homogéneos: se transmiten primero los adquiridos antes), criterio que Hacienda aplica a las criptomonedas.</Fuente>
        </>
      )
    case 'valoracion':
      return (
        <>
          <p>El valor actual usa precios en vivo de Binance. Los activos sin par en Binance se actualizan con CoinGecko cada minuto. Todo se convierte a la moneda elegida en la cabecera.</p>
          <p>Cada operación se valora en euros con su precio en el momento en que se hizo. Si el archivo no lo trae, se usa el precio histórico de Binance o, si no lo tiene, el de una fuente de respaldo.</p>
          <p>El cierre de cada día en las curvas es el precio a las 00:00 de la zona horaria de la aplicación.</p>
          <Ejemplo>Tienes 0,5 AAA, que cotiza a 2.000 €: valen 1.000 €. Si las compraste por 800 €, el P&L no realizado es de 200 €.</Ejemplo>
        </>
      )
    case 'rentabilidad':
      return (
        <>
          <p>El P&L de un día es lo que cambia el valor de la cartera menos lo que entra o sale (depósitos y retiradas): mover dinero no cuenta como ganancia.</p>
          <p><span className="font-semibold text-fg">% sobre lo aportado:</span> P&L acumulado entre el máximo capital neto que has llegado a aportar. Se usa el máximo, y no lo que queda, para que retirar casi todo no dispare el porcentaje.</p>
          <p><span className="font-semibold text-fg">TWR</span> (rentabilidad ponderada en el tiempo): encadena la rentabilidad de cada día sin tener en cuenta cuánto dinero había. Mide cómo se comportó la cartera, no cuánto ganaste.</p>
          <Ejemplo>Aportas 1.000 €, ganas 100 € y retiras 900 €. El % sobre lo aportado es del 10 %, aunque en la cartera solo queden 200 €.</Ejemplo>
        </>
      )
    case 'compensacion':
      return (
        <>
          <p>Si las ganancias y pérdidas del año dan saldo negativo, esa pérdida compensa primero hasta el 25 % de los rendimientos del capital mobiliario del mismo año (staking e intereses).</p>
          <p>Lo que quede pendiente se compensa en los cuatro ejercicios siguientes, empezando por la pérdida más antigua: contra las ganancias sin límite y, con lo que sobre, contra los rendimientos con el mismo 25 %, que es un límite conjunto con la pérdida de ese año. Lo que no se use caduca el 31 de diciembre del cuarto año.</p>
          <p>Airdrops, minería y cashback son ganancias no derivadas de transmisión: van a la base general, no se compensan con estas pérdidas y la app solo los informa.</p>
          <p>La pérdida del año en curso es provisional: hasta el 31 de diciembre aún puede compensar ganancias de ese mismo año.</p>
          <Ejemplo>Pierdes 1.000 € en 2024 y ganas 600 € en 2025. En 2025 compensas 600 € y quedan 400 € para 2026, 2027 y 2028.</Ejemplo>
          <Fuente>arts. 48 y 49 de la Ley del IRPF (integración y compensación en la base del ahorro).</Fuente>
        </>
      )
    case 'modelo721':
      return (
        <>
          <p>Declaración informativa de las criptomonedas que custodian por ti entidades en el extranjero a 31 de diciembre. Solo cuenta lo que está en exchanges; lo que tienes en autocustodia no computa.</p>
          <p>Hay que presentarlo si ese valor supera el umbral, 50.000 € por defecto, configurable en Ajustes. Si ya lo presentaste, los años siguientes solo es obligatorio cuando el valor sube más de 20.000 € sobre el último presentado.</p>
          <p>Cada activo se valora con su precio a 31 de diciembre; si falta algún precio, el total es un mínimo. El plazo va del 1 de enero al 31 de marzo del año siguiente.</p>
          <Ejemplo>Presentas el 721 con 60.000 €. Al año siguiente tienes 75.000 € en exchanges: sube 15.000 €, así que no hace falta volver a presentarlo.</Ejemplo>
        </>
      )
  }
}
