import { portfolioApi } from '../../../api/portfolio'

// Consulta del detalle de una transacción (#373), compartida por el panel y
// por la precarga al pasar el ratón o el foco sobre una fila.

export const detailQuery = (id: string) => ({
  queryKey: ['transactions', 'detalle', id],
  queryFn: () => portfolioApi.getTransactionDetail(id),
  staleTime: 30_000,
})
