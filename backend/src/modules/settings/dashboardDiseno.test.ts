import { describe, expect, it } from 'vitest';
import { dashboardDisenoSchema, PANELES_DASHBOARD } from './dashboardDiseno';

// Validación del diseño del Dashboard (#521).
const ok = (v: unknown) => dashboardDisenoSchema.safeParse(JSON.stringify(v)).success;

describe('dashboardDisenoSchema', () => {
  it('acepta el orden completo, uno parcial y las listas vacías', () => {
    expect(ok({ orden: [...PANELES_DASHBOARD], ocultos: [], contraidos: [] })).toBe(true);
    expect(ok({ orden: ['fiscal', 'metas'], ocultos: ['ingresos'], contraidos: ['evolucion'] })).toBe(true);
    expect(ok({ orden: [], ocultos: [], contraidos: [] })).toBe(true);
  });

  it('rechaza paneles desconocidos, repetidos, campos de más o de menos y JSON roto', () => {
    expect(ok({ orden: ['otro'], ocultos: [], contraidos: [] })).toBe(false);
    expect(ok({ orden: ['fiscal', 'fiscal'], ocultos: [], contraidos: [] })).toBe(false);
    expect(ok({ orden: [], ocultos: ['metas', 'metas'], contraidos: [] })).toBe(false);
    expect(ok({ orden: [], ocultos: [] })).toBe(false);
    expect(ok({ orden: [], ocultos: [], contraidos: [], extra: 1 })).toBe(false);
    expect(ok([])).toBe(false);
    expect(dashboardDisenoSchema.safeParse('{roto').success).toBe(false);
  });
});
