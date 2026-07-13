import { contextBridge, ipcRenderer } from 'electron'

/**
 * API segura expuesta al frontend como `window.api`.
 * El renderer nunca accede directamente a Node ni a la base de datos.
 */
const api = {
  // Version de la app
  appVersion: () => ipcRenderer.invoke('app:version'),

  // Licencia
  licenciaEstado: () => ipcRenderer.invoke('licencia:estado'),
  licenciaActivar: (codigo: string) => ipcRenderer.invoke('licencia:activar', codigo),
  licenciaCambiar: () => ipcRenderer.invoke('licencia:cambiar'),
  nubeSubir: () => ipcRenderer.invoke('nube:subir'),
  nubeUltimo: () => ipcRenderer.invoke('nube:ultimo'),
  nubeRestaurar: (licencia?: string) => ipcRenderer.invoke('nube:restaurar', licencia),

  // Autenticacion
  login: (usuario: string, password: string) => ipcRenderer.invoke('auth:login', usuario, password),

  // Usuarios
  usuariosList: () => ipcRenderer.invoke('usuarios:list'),
  usuariosSave: (data: unknown) => ipcRenderer.invoke('usuarios:save', data),
  usuariosToggle: (id: number, activo: boolean) => ipcRenderer.invoke('usuarios:toggle', id, activo),
  usuariosEliminar: (id: number) => ipcRenderer.invoke('usuarios:eliminar', id),
  cambiarPassword: (id: number, actual: string, nueva: string) =>
    ipcRenderer.invoke('usuarios:cambiarPassword', id, actual, nueva),

  // Configuracion
  configGetAll: () => ipcRenderer.invoke('config:getAll'),
  configSet: (clave: string, valor: string) => ipcRenderer.invoke('config:set', clave, valor),

  // Categorias
  categoriasList: () => ipcRenderer.invoke('categorias:list'),
  categoriasCreate: (nombre: string) => ipcRenderer.invoke('categorias:create', nombre),

  // Productos
  productosList: (filtro?: string) => ipcRenderer.invoke('productos:list', filtro),
  productosGet: (id: number) => ipcRenderer.invoke('productos:get', id),
  productosSave: (data: unknown) => ipcRenderer.invoke('productos:save', data),
  productosDelete: (id: number) => ipcRenderer.invoke('productos:delete', id),
  buscarPorCodigo: (codigo: string) => ipcRenderer.invoke('variantes:buscarPorCodigo', codigo),
  inventarioKardex: (varianteId: number) => ipcRenderer.invoke('inventario:kardex', varianteId),
  inventarioAjustar: (varianteId: number, nuevoStock: number, motivo: string) =>
    ipcRenderer.invoke('inventario:ajustar', varianteId, nuevoStock, motivo),

  // Clientes
  clientesList: (filtro?: string) => ipcRenderer.invoke('clientes:list', filtro),
  clientesSave: (data: unknown) => ipcRenderer.invoke('clientes:save', data),
  clientesDelete: (id: number) => ipcRenderer.invoke('clientes:delete', id),

  // Ventas
  ventasCrear: (venta: unknown) => ipcRenderer.invoke('ventas:crear', venta),
  ventasGet: (id: number) => ipcRenderer.invoke('ventas:get', id),
  ventasList: (limit?: number) => ipcRenderer.invoke('ventas:list', limit),
  facturarDian: (ventaId: number) => ipcRenderer.invoke('ventas:facturarDian', ventaId),
  dianProbar: () => ipcRenderer.invoke('dian:probar'),

  // Caja
  cajaActual: () => ipcRenderer.invoke('caja:actual'),
  cajaAbrir: (montoInicial: number, usuarioId: number) =>
    ipcRenderer.invoke('caja:abrir', montoInicial, usuarioId),
  cajaResumen: (sesionId?: number) => ipcRenderer.invoke('caja:resumen', sesionId),
  cajaCerrar: (sesionId: number, montoContado: number, usuarioId: number, notas: string) =>
    ipcRenderer.invoke('caja:cerrar', sesionId, montoContado, usuarioId, notas),
  cajaHistorial: (limit?: number) => ipcRenderer.invoke('caja:historial', limit),
  cajaImprimirCierre: (sesionId: number) => ipcRenderer.invoke('caja:imprimirCierre', sesionId),

  // Devoluciones
  devolucionesPorVenta: (ventaId: number) => ipcRenderer.invoke('devoluciones:porVenta', ventaId),
  devolucionesCrear: (data: unknown) => ipcRenderer.invoke('devoluciones:crear', data),

  // Mesas / comandas
  mesasList: () => ipcRenderer.invoke('mesas:list'),
  mesasCrear: (nombre: string, zona?: string) => ipcRenderer.invoke('mesas:crear', nombre, zona),
  mesasEliminar: (id: number) => ipcRenderer.invoke('mesas:eliminar', id),
  mesasRenombrar: (id: number, nombre: string) => ipcRenderer.invoke('mesas:renombrar', id, nombre),
  mesasLiberar: (mesaId: number, motivo?: string) => ipcRenderer.invoke('mesas:liberar', mesaId, motivo),
  comandaAbrir: (mesaId: number, usuarioId: number) =>
    ipcRenderer.invoke('comanda:abrir', mesaId, usuarioId),
  comandaAgregarItem: (comandaId: number, item: unknown) =>
    ipcRenderer.invoke('comanda:agregarItem', comandaId, item),
  comandaCambiarCantidad: (itemId: number, cantidad: number) =>
    ipcRenderer.invoke('comanda:cambiarCantidad', itemId, cantidad),
  comandaCobrar: (comandaId: number, pago: unknown) =>
    ipcRenderer.invoke('comanda:cobrar', comandaId, pago),
  comandaPrecuenta: (comandaId: number, itemIds?: number[], parte?: { n: number; de: number }) =>
    ipcRenderer.invoke('comanda:precuenta', comandaId, itemIds, parte),
  comandaCobrarParcial: (comandaId: number, itemIds: number[], pago: unknown) =>
    ipcRenderer.invoke('comanda:cobrarParcial', comandaId, itemIds, pago),

  // Impresion
  imprimirTicket: (ventaId: number) => ipcRenderer.invoke('imprimir:ticket', ventaId),
  listarImpresoras: () => ipcRenderer.invoke('imprimir:listar'),
  imprimirEtiquetas: (html: string) => ipcRenderer.invoke('imprimir:etiquetas', html),
  etiquetasPdf: (html: string) => ipcRenderer.invoke('imprimir:etiquetasPdf', html),
  cartaPublicar: () => ipcRenderer.invoke('carta:publicar'),
  productosImportarLeer: () => ipcRenderer.invoke('productos:importarLeer'),
  productosImportarGuardar: (productos: unknown[]) => ipcRenderer.invoke('productos:importarGuardar', productos),
  productosPlantilla: () => ipcRenderer.invoke('productos:plantilla'),
  fiadoCuentas: () => ipcRenderer.invoke('fiado:cuentas'),
  fiadoDetalle: (clienteId: number) => ipcRenderer.invoke('fiado:detalle', clienteId),
  fiadoAbonar: (data: unknown) => ipcRenderer.invoke('fiado:abonar', data),

  // Respaldos
  backupCrear: () => ipcRenderer.invoke('backup:crear'),
  backupListar: () => ipcRenderer.invoke('backup:listar'),
  backupExportar: () => ipcRenderer.invoke('backup:exportar'),
  backupImportar: () => ipcRenderer.invoke('backup:importar'),

  // Proveedores
  proveedoresList: (filtro?: string) => ipcRenderer.invoke('proveedores:list', filtro),
  proveedoresSave: (data: unknown) => ipcRenderer.invoke('proveedores:save', data),

  // Compras
  comprasCrear: (data: unknown) => ipcRenderer.invoke('compras:crear', data),
  comprasList: (limit?: number) => ipcRenderer.invoke('compras:list', limit),
  comprasGet: (id: number) => ipcRenderer.invoke('compras:get', id),

  // Gastos
  gastosCrear: (data: unknown) => ipcRenderer.invoke('gastos:crear', data),
  gastosList: (sesionId?: number) => ipcRenderer.invoke('gastos:list', sesionId),

  // Reportes
  reportesResumen: (desde: string, hasta: string) =>
    ipcRenderer.invoke('reportes:resumen', desde, hasta),
  reportesStockBajo: () => ipcRenderer.invoke('reportes:stockBajo'),
  reportesExportar: (desde: string, hasta: string, detalle: boolean) =>
    ipcRenderer.invoke('reportes:exportar', desde, hasta, detalle)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
