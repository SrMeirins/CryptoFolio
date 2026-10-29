// Tests del script de auditoría (#384). Ejecutar con: node --test scripts/audit.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advisoryId, evaluate } from './audit.mjs'

const report = {
  vulnerabilities: {
    zod: { via: [{ severity: 'high', title: 'Memoria', url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5' }] },
    multer: { via: [{ severity: 'high', title: 'DoS', url: 'https://github.com/advisories/GHSA-q7qp-rjg7-q26m' }] },
    vitest: { via: [{ severity: 'moderate', title: 'Mock', url: 'https://github.com/advisories/GHSA-qxg6-89mg-rqv8' }, '@vitest/mocker'] },
  },
}
const zodException = { id: 'GHSA-mrhx-c7xc-m3w5', paquete: 'zod', motivo: 'm', caduca: '2026-11-30', issue: '#385' }

test('extrae el id del aviso de su URL', () => {
  assert.equal(advisoryId('https://github.com/advisories/GHSA-MRHX-c7xc-m3w5'), 'ghsa-mrhx-c7xc-m3w5')
  assert.equal(advisoryId('sin id'), null)
})

test('un aviso alto sin excepción bloquea; uno moderado no', () => {
  const r = evaluate(report, [], '2026-10-26')
  assert.deepEqual(r.blocking.map(b => b.paquete).sort(), ['multer', 'zod'])
})

test('un aviso alto con excepción vigente se acepta', () => {
  const r = evaluate(report, [zodException], '2026-10-26')
  assert.deepEqual(r.blocking.map(b => b.paquete), ['multer'])
  assert.deepEqual(r.accepted.map(a => a.paquete), ['zod'])
})

test('una excepción caducada deja de aceptar el aviso y se informa', () => {
  const r = evaluate(report, [zodException], '2026-12-01')
  assert.deepEqual(r.blocking.map(b => b.paquete).sort(), ['multer', 'zod'])
  assert.equal(r.expired.length, 1)
})

test('el último día de vigencia aún cuenta', () => {
  assert.equal(evaluate(report, [zodException], '2026-11-30').expired.length, 0)
})

test('sin avisos no bloquea nada', () => {
  assert.deepEqual(evaluate({ vulnerabilities: {} }, [zodException], '2026-10-26'), { blocking: [], accepted: [], expired: [] })
})
