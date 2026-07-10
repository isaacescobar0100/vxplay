import { query } from './db'

/**
 * Integracion con facturacion electronica DIAN (Colombia).
 *
 * La factura electronica NO se genera desde cero: se envian los datos a un
 * PROVEEDOR TECNOLOGICO autorizado por la DIAN, que la valida, firma y devuelve
 * el CUFE (codigo unico) + QR + numero legal.
 *
 * Este modulo esta preparado para el proveedor "Factus" (https://factus.com.co),
 * que ofrece API REST y ambiente de pruebas gratuito. Se puede adaptar a otros
 * proveedores (Alegra, Siigo, etc.) cambiando `enviarAProveedor`.
 *
 * Mientras `dian_habilitado` = 0 en config, funciona en modo SIMULACION:
 * genera un CUFE ficticio para poder probar el flujo completo sin credenciales.
 */

export interface ResultadoDian {
  estado: 'aceptada' | 'rechazada' | 'pendiente' | 'simulada' | 'error'
  cufe?: string
  numero?: string
  qr?: string
  mensaje?: string
}

function getConfig(): Record<string, string> {
  const rows = query<{ clave: string; valor: string }>('SELECT clave, valor FROM config')
  const cfg: Record<string, string> = {}
  for (const r of rows) cfg[r.clave] = r.valor
  return cfg
}

export async function facturarVenta(venta: any): Promise<ResultadoDian> {
  const cfg = getConfig()

  if (cfg.dian_habilitado !== '1') {
    // Modo simulacion: permite probar el flujo sin credenciales reales.
    return {
      estado: 'simulada',
      cufe: 'SIM-' + venta.numero + '-' + Date.now().toString(36).toUpperCase(),
      numero: 'SETP' + venta.numero,
      qr: 'https://catalogo-vpfe.dian.gov.co/document/simulado',
      mensaje: 'Factura simulada (modo pruebas). Configure el proveedor DIAN para emitir facturas reales.'
    }
  }

  try {
    return await enviarAProveedor(venta, cfg)
  } catch (err: any) {
    return { estado: 'error', mensaje: err?.message ?? 'Error desconocido al facturar' }
  }
}

/**
 * Envia la factura al proveedor tecnologico (ejemplo con estructura tipo Factus).
 * Ajusta el mapeo de campos segun la documentacion de tu proveedor.
 */
async function enviarAProveedor(venta: any, cfg: Record<string, string>): Promise<ResultadoDian> {
  const apiUrl = cfg.dian_api_url
  const token = cfg.dian_api_token
  if (!apiUrl || !token) {
    return { estado: 'error', mensaje: 'Faltan credenciales del proveedor DIAN en Configuracion.' }
  }

  // Mapeo de la venta al formato del proveedor. Este es un ejemplo representativo;
  // cada proveedor tiene su propio esquema (revisar su documentacion oficial).
  const payload = {
    numbering_range_id: Number(cfg.dian_rango_numeracion ?? 0) || undefined,
    reference_code: venta.numero,
    payment_method_code: metodoPagoDian(venta.metodo_pago),
    customer: {
      identification: venta.cliente_documento ?? '222222222222',
      names: venta.cliente_nombre ?? 'Consumidor Final',
      email: venta.cliente_email ?? undefined,
      address: venta.cliente_direccion ?? undefined,
      phone: venta.cliente_telefono ?? undefined,
      legal_organization_id: 2, // 2 = persona natural (ejemplo)
      identification_document_id: tipoDocDian(venta.cliente_tipo_doc)
    },
    items: (venta.items ?? []).map((it: any) => ({
      code_reference: String(it.variante_id ?? it.id ?? ''),
      name: it.producto_nombre + (it.talla ? ` Talla ${it.talla}` : '') + (it.color ? ` ${it.color}` : ''),
      quantity: it.cantidad,
      price: it.precio_unitario,
      tax_rate: String(it.iva_porcentaje ?? 0),
      unit_measure_id: 70, // unidad (ejemplo)
      standard_code_id: 1,
      is_excluded: it.iva_porcentaje ? 0 : 1
    }))
  }

  const resp = await fetch(apiUrl.replace(/\/$/, '') + '/v1/bills/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  })

  const data: any = await resp.json().catch(() => ({}))

  if (!resp.ok) {
    return {
      estado: 'rechazada',
      mensaje: data?.message ?? `El proveedor rechazo la factura (HTTP ${resp.status})`
    }
  }

  // Extraccion tolerante de campos (varia segun proveedor)
  const bill = data?.data?.bill ?? data?.bill ?? data?.data ?? data
  return {
    estado: 'aceptada',
    cufe: bill?.cufe ?? bill?.cude,
    numero: bill?.number ?? bill?.prefix + bill?.number,
    qr: bill?.qr ?? bill?.qr_image ?? bill?.public_url,
    mensaje: 'Factura emitida y validada por la DIAN.'
  }
}

function metodoPagoDian(metodo: string): number {
  // Codigos DIAN de medio de pago (ejemplo)
  switch (metodo) {
    case 'efectivo':
      return 10
    case 'tarjeta':
      return 48
    case 'transferencia':
      return 42
    default:
      return 10
  }
}

function tipoDocDian(tipo?: string): number {
  // Codigos DIAN de tipo de documento de identidad (ejemplo)
  switch (tipo) {
    case 'CC':
      return 3
    case 'NIT':
      return 6
    case 'CE':
      return 5
    case 'PP':
      return 7
    default:
      return 3
  }
}
