import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Download, History, TrendingDown } from 'lucide-react'
import { ComoCalculamos } from '../../../components/metodologia'
import { buttonClasses, Hint, Notice, panelSurface, StatStrip, type StatStripCell } from '../../../components/ui'
import { usePrivacyStore } from '../../../store/privacyStore'
import { formatEur, formatNumber } from '../../../utils/format'
import { buildRendimientosCsv } from '../../../utils/fiscalRendimientos'
import { claveDe, mesesConDatos, resumenPorTipo, type ClaveTipo } from '../../../utils/rendimientos'
import type { RendimientoEvent } from '../types'
import { GraficoRendimientos } from './GraficoRendimientos'
import { TablaBase } from './TablaBase'

// Rendimientos del ejercicio (#544): tira por tipo que filtra, gráfico mensual
// y, en dos secciones, la base del ahorro (entra en la cuota) y la general
// (solo se informa, #537), agrupadas por mes, con el estado de las unidades.

const OPERACIONES = 'STAKING_REWARD,LENDING_INTEREST,LENDING_INTEREST_LOCKED,MINING_REWARD,AIRDROP,CASHBACK'
const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

export function SeccionRendimientos({ rendimientos, year }: { rendimientos: RendimientoEvent[]; year: number }) {
  const [tipo, setTipo] = useState<ClaveTipo | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const privacy = usePrivacyStore(s => s.hidden)
  if (rendimientos.length === 0) return null

  const resumen = resumenPorTipo(rendimientos)
  const visibles = tipo ? rendimientos.filter(r => claveDe(r) === tipo) : rendimientos
  const ahorro = visibles.filter(r => r.base === 'ahorro')
  const general = visibles.filter(r => r.base === 'general')
  const tira: StatStripCell[] = resumen.map(t => ({
    key: t.clave, label: t.label, value: t.total, format: formatEur,
    sub: `${formatNumber(t.n, 0)} ${t.n === 1 ? 'rendimiento' : 'rendimientos'}${tipo === t.clave ? ' · filtrando' : ''}`,
    onSelect: () => setTipo(tipo === t.clave ? null : t.clave), destination: 'la tabla',
  }))

  function exportCsv() {
    const blob = new Blob(['﻿' + buildRendimientosCsv(visibles)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rendimientos_fiscal_${year}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    // Destino de la tarjeta Rendimientos del ejercicio (#418): recibe el foco al llegar.
    <section id="fiscal-rendimientos" tabIndex={-1} aria-labelledby="rendimientos-titulo"
      // @container: tabla o tarjetas según el ancho de la sección, no de la ventana.
      className={panelSurface('none', 'overflow-hidden scroll-mt-4 focus:outline-hidden @container')}>
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-border">
        <h2 id="rendimientos-titulo" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <TrendingDown size={15} aria-hidden="true" className="text-fg-subtle" />
          Rendimientos de {year} <span className="font-normal text-fg-subtle">· {formatNumber(rendimientos.length, 0)}</span>
        </h2>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <button type="button" onClick={() => setAyuda(true)} aria-haspopup="dialog"
            className={`inline-flex items-center gap-1.5 text-brand-ink hover:underline rounded ${FOCO}`}>
            <BookOpen size={13} aria-hidden="true" /> ¿Cómo tributan?
          </button>
          <Link to={`/history?tipo=${OPERACIONES}&desde=${year}-01-01&hasta=${year}-12-31`}
            className={`inline-flex items-center gap-1.5 text-brand-ink hover:underline rounded ${FOCO}`}>
            <History size={13} aria-hidden="true" /> Ver en Historial
          </Link>
          <Hint label={privacy ? 'Desactiva el modo privacidad para exportar' : 'Exportar a CSV los rendimientos que se ven'}>
            <button type="button" onClick={exportCsv} disabled={privacy} className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
              <Download size={11} aria-hidden="true" /> {tipo ? 'CSV de lo filtrado' : 'CSV'}
            </button>
          </Hint>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <StatStrip label="Rendimientos por tipo; cada celda filtra la tabla" cells={tira} />
        {mesesConDatos(visibles) >= 2 && <GraficoRendimientos rendimientos={visibles} presentes={resumenPorTipo(visibles)} />}
      </div>

      {ahorro.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-sm font-medium text-fg">Capital mobiliario <span className="font-normal text-fg-subtle">· entra en la cuota del ahorro</span></h3>
          </div>
          <TablaBase rendimientos={ahorro} caption={`Rendimientos del capital mobiliario de ${year}`} onAyuda={() => setAyuda(true)} />
        </div>
      )}

      {general.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 pt-4 pb-2 space-y-2">
            <h3 className="text-sm font-medium text-fg">Base general <span className="font-normal text-fg-subtle">· informativo</span></h3>
            <Notice tipo="informacion" compact>
              Ganancias no derivadas de transmisión (airdrops, minería y cashback). Tributan en la base general a tu tipo marginal,
              que depende del resto de tus ingresos: no entran en la cuota estimada ni se compensan con las pérdidas del ahorro.
            </Notice>
          </div>
          <TablaBase rendimientos={general} caption={`Rendimientos de la base general de ${year}`} onAyuda={() => setAyuda(true)} />
        </div>
      )}

      {ayuda && <ComoCalculamos inicial="rendimientos" onClose={() => setAyuda(false)} />}
    </section>
  )
}
