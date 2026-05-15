import { readFileSync } from 'fs';
import { parseBinanceCsv } from './parser';
import { preprocess } from './preprocessor';
import { parse } from 'csv-parse/sync';
import { createHash } from 'crypto';

// Test directo contra el CSV real
const CSV_PATH = process.env.TEST_CSV_PATH || '';

function rawRowsFromCsv(content: Buffer) {
  const records = parse(content, { columns: true, skip_empty_lines: true, bom: true, trim: true });
  return records.map((r: Record<string, string>) => ({
    userId: r['User ID'] ?? '',
    time: new Date('20' + r['Time'].trim().replace(' ', 'T') + 'Z'),
    account: r['Account'] ?? '',
    operation: r['Operation'] ?? '',
    coin: r['Coin'] ?? '',
    change: parseFloat(r['Change'] ?? '0'),
    remark: r['Remark'] ?? '',
    rowHash: createHash('sha256').update(Object.values(r).join('|')).digest('hex'),
  }));
}

if (!CSV_PATH) {
  console.log('TEST_CSV_PATH no definido, saltando tests de CSV real.');
  process.exit(0);
}

const content = readFileSync(CSV_PATH);
const result = parseBinanceCsv(content);

console.log('\n=== RESULTADO DEL PARSER ===\n');
console.log(`Total filas CSV:       ${result.stats.totalRows}`);
console.log(`Filas procesadas:      ${result.stats.parsedRows}`);
console.log(`Filas ignoradas:       ${result.stats.ignoredRows}`);
console.log(`Errores:               ${result.stats.errorRows}`);
console.log(`Transacciones salida:  ${result.stats.transactionCount}`);

if (result.errors.length > 0) {
  console.log('\n=== ERRORES ===');
  for (const e of result.errors) {
    console.log(`  ✗ ${e.message}`);
    for (const r of e.rows) {
      console.log(`    ${r.time.toISOString()} | ${r.operation} | ${r.coin} | ${r.change}`);
    }
  }
}

console.log('\n=== TRANSACCIONES PARSEADAS ===');
const byType = new Map<string, number>();
for (const tx of result.transactions) {
  byType.set(tx.operationType, (byType.get(tx.operationType) ?? 0) + 1);
}
for (const [type, count] of [...byType.entries()].sort()) {
  console.log(`  ${type.padEnd(20)} ${count}`);
}

console.log('\n=== MUESTRA (primeras 10 transacciones) ===');
for (const tx of result.transactions.slice(0, 10)) {
  console.log(
    `  ${tx.timestamp.toISOString().slice(0, 16)} | ${tx.operationType.padEnd(20)} | ${tx.asset.padEnd(6)} ${String(tx.amountNet.toFixed(4)).padStart(12)} | cost: ${tx.costAsset ?? '-'} ${String((tx.costAmount ?? 0).toFixed(4)).padStart(10)}`
  );
}

console.log('\n=== COMPROBACIÓN DE TOTALES (XRP) ===');
const xrpBuys = result.transactions.filter(
  (tx) => tx.operationType === 'BUY' && tx.asset === 'XRP'
);
const totalXrp = xrpBuys.reduce((s, tx) => s + tx.amountNet, 0);
const totalXrpCost = xrpBuys.reduce((s, tx) => s + (tx.costAmount ?? 0), 0);
console.log(`  Compras XRP: ${xrpBuys.length} operaciones`);
console.log(`  Total XRP neto: ${totalXrp.toFixed(4)}`);
console.log(`  Total coste: ${totalXrpCost.toFixed(4)} USDC/EUR`);

console.log('\n=== WITHDRAWS (→ Tangem) ===');
const withdraws = result.transactions.filter((tx) => tx.operationType === 'WITHDRAW');
for (const w of withdraws) {
  console.log(`  ${w.timestamp.toISOString().slice(0, 16)} | ${w.asset.padEnd(6)} | ${w.amountNet.toFixed(6)}`);
}

if (result.errors.length === 0) {
  console.log('\n✓ Parser completado sin errores.');
} else {
  console.log(`\n✗ ${result.errors.length} errores encontrados. Revisar antes de continuar.`);
  process.exit(1);
}
