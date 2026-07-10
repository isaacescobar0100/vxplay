import { BrowserWindow } from 'electron'

/**
 * Impresion de tickets/facturas.
 *
 * El ticket se genera como HTML y se imprime en la impresora del sistema. Esto
 * funciona con impresoras termicas (58/80 mm) y con impresoras normales.
 *
 * Modos (config `impresion_modo`):
 *  - 'previsualizar' : abre una ventana con el ticket para verlo en pantalla,
 *                      imprimir manualmente o guardarlo como PDF. (Ideal sin impresora.)
 *  - 'auto'          : imprime en silencio en la impresora por defecto (o la de
 *                      `impresora_nombre`) sin mostrar dialogos. (Ideal en tienda.)
 *  - 'dialogo'       : muestra el dialogo de impresion de Windows.
 */

function pesos(n: number): string {
  return '$' + Number(n || 0).toLocaleString('es-CO')
}

/** HTML del ticket. Si `preview` es true, agrega una barra de acciones arriba. */
function generarHtml(venta: any, cfg: Record<string, string>, preview: boolean): string {
  const items = (venta.items ?? [])
    .map(
      (it: any) => `
      <tr>
        <td class="l">${it.cantidad} x ${it.producto_nombre}${it.talla ? ' T:' + it.talla : ''}${
        it.color ? ' ' + it.color : ''
      }</td>
        <td class="r">${pesos(it.subtotal)}</td>
      </tr>`
    )
    .join('')

  const dianInfo =
    venta.dian_cufe && venta.dian_estado !== 'pendiente'
      ? `<div class="dian">
           <div>Factura Electronica DIAN</div>
           <div>No: ${venta.dian_numero ?? ''}</div>
           <div class="cufe">CUFE: ${venta.dian_cufe}</div>
         </div>`
      : ''

  const barra = preview
    ? `<div class="toolbar no-print">
         <span>Vista previa del tiquete</span>
         <div>
           <button onclick="window.print()">Imprimir / Guardar PDF</button>
           <button class="close" onclick="window.close()">Cerrar</button>
         </div>
       </div>`
    : ''

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background: ${preview ? '#334155' : '#fff'}; }
  .ticket {
    font-family: 'Courier New', monospace; font-size: 12px; color:#000; background:#fff;
    width: 76mm; padding: 4mm; ${preview ? 'margin: 78px auto 24px; box-shadow: 0 8px 30px rgba(0,0,0,.4);' : ''}
  }
  .center { text-align:center; }
  .b { font-weight:bold; }
  .big { font-size:15px; }
  hr { border:none; border-top:1px dashed #000; margin:6px 0; }
  table { width:100%; border-collapse:collapse; }
  td.l { text-align:left; }
  td.r { text-align:right; }
  .tot td { padding-top:2px; }
  .dian { margin-top:8px; font-size:10px; word-break:break-all; text-align:center; }
  .cufe { font-size:9px; }
  .foot { margin-top:10px; text-align:center; font-size:11px; }
  .toolbar {
    position: fixed; top:0; left:0; right:0; height:54px; background:#1e293b; color:#e2e8f0;
    display:flex; align-items:center; justify-content:space-between; padding:0 18px;
    font-family: 'Segoe UI', sans-serif; font-size:14px; box-shadow:0 2px 10px rgba(0,0,0,.3);
  }
  .toolbar button {
    font-family:inherit; font-size:13px; font-weight:600; border:none; border-radius:8px;
    padding:9px 14px; margin-left:8px; cursor:pointer; background:#6366f1; color:#fff;
  }
  .toolbar button.close { background:#334155; }
  @media print { .no-print { display:none !important; } html, body { background:#fff; } .ticket { margin:0; box-shadow:none; } }
</style></head>
<body>
  ${barra}
  <div class="ticket">
    ${cfg.tienda_logo ? `<img src="${cfg.tienda_logo}" style="max-width:50mm;max-height:80px;display:block;margin:0 auto 6px"/>` : ''}
    <div class="center b big">${cfg.tienda_nombre ?? 'Mi Tienda'}</div>
    <div class="center">NIT: ${cfg.tienda_nit ?? ''}</div>
    <div class="center">${cfg.tienda_direccion ?? ''}</div>
    <div class="center">${cfg.tienda_ciudad ?? ''} - Tel: ${cfg.tienda_telefono ?? ''}</div>
    <hr/>
    <div>Venta: ${venta.numero}</div>
    <div>Fecha: ${venta.fecha}</div>
    <div>Cliente: ${venta.cliente_nombre ?? 'Consumidor Final'}</div>
    ${venta.cliente_documento ? `<div>Doc: ${venta.cliente_documento}</div>` : ''}
    <hr/>
    <table>${items}</table>
    <hr/>
    <table class="tot">
      <tr><td class="l">Subtotal</td><td class="r">${pesos(venta.subtotal)}</td></tr>
      ${venta.descuento ? `<tr><td class="l">Descuento</td><td class="r">-${pesos(venta.descuento)}</td></tr>` : ''}
      <tr><td class="l">IVA</td><td class="r">${pesos(venta.iva)}</td></tr>
      <tr class="b big"><td class="l">TOTAL</td><td class="r">${pesos(venta.total)}</td></tr>
      <tr><td class="l">Pago (${venta.metodo_pago})</td><td class="r">${pesos(venta.pago_recibido)}</td></tr>
      <tr><td class="l">Cambio</td><td class="r">${pesos(venta.cambio)}</td></tr>
    </table>
    ${dianInfo}
    <div class="foot">Gracias por su compra!</div>
  </div>
</body></html>`
}

export async function imprimirTicket(
  venta: any,
  cfg: Record<string, string>
): Promise<{ ok: boolean; mensaje?: string }> {
  const modo = cfg.impresion_modo || 'previsualizar'
  const deviceName = cfg.impresora_nombre || undefined

  // ----- MODO PREVISUALIZAR: ventana visible con el ticket -----
  if (modo === 'previsualizar') {
    const win = new BrowserWindow({
      width: 380,
      height: 720,
      title: 'Tiquete - ' + venta.numero,
      autoHideMenuBar: true,
      webPreferences: { sandbox: true }
    })
    await win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(generarHtml(venta, cfg, true))
    )
    return { ok: true }
  }

  // ----- MODO AUTO / DIALOGO: imprimir en impresora -----
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(generarHtml(venta, cfg, false))
  )

  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: modo === 'auto',
        printBackground: true,
        deviceName,
        margins: { marginType: 'none' }
      },
      (success, failureReason) => {
        win.close()
        if (success) resolve({ ok: true })
        else resolve({ ok: false, mensaje: failureReason })
      }
    )
  })
}

/** HTML del reporte de cierre de caja (arqueo "Z"). */
function generarCierreHtml(d: any, cfg: Record<string, string>, preview: boolean): string {
  const linea = (l: string, v: number, neg = false) =>
    `<tr><td class="l">${l}</td><td class="r">${neg ? '-' : ''}${pesos(v)}</td></tr>`
  const barra = preview
    ? `<div class="toolbar no-print"><span>Cierre de caja</span><div>
         <button onclick="window.print()">Imprimir / Guardar PDF</button>
         <button class="close" onclick="window.close()">Cerrar</button></div></div>`
    : ''
  const difColor = d.diferencia === 0 ? '#000' : d.diferencia > 0 ? '#b45309' : '#b91c1c'
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:${preview ? '#334155' : '#fff'}}
  .ticket{font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;width:76mm;padding:4mm;${
    preview ? 'margin:78px auto 24px;box-shadow:0 8px 30px rgba(0,0,0,.4)' : ''
  }}
  .center{text-align:center}.b{font-weight:bold}.big{font-size:15px}
  hr{border:none;border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}td.l{text-align:left}td.r{text-align:right}
  .toolbar{position:fixed;top:0;left:0;right:0;height:54px;background:#1e293b;color:#e2e8f0;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-family:'Segoe UI',sans-serif;font-size:14px}
  .toolbar button{font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:9px 14px;margin-left:8px;cursor:pointer;background:#6366f1;color:#fff}
  .toolbar button.close{background:#334155}
  @media print{.no-print{display:none!important}html,body{background:#fff}.ticket{margin:0;box-shadow:none}}
</style></head><body>
  ${barra}
  <div class="ticket">
    ${cfg.tienda_logo ? `<img src="${cfg.tienda_logo}" style="max-width:50mm;max-height:80px;display:block;margin:0 auto 6px"/>` : ''}
    <div class="center b big">${cfg.tienda_nombre ?? 'Mi Tienda'}</div>
    <div class="center">CIERRE DE CAJA (Z)</div>
    <div class="center">Sesión #${d.numero}</div>
    <hr/>
    <div>Apertura: ${d.apertura}</div>
    <div>Cierre: ${d.cierre ?? '—'}</div>
    <div>Cajero: ${d.cajero_apertura ?? '—'}</div>
    <hr/>
    <table>
      ${linea('Fondo inicial', d.monto_inicial)}
      ${linea('Ventas efectivo', d.ventas_efectivo)}
      ${linea('Ventas tarjeta', d.ventas_tarjeta)}
      ${linea('Ventas transferencia', d.ventas_transferencia)}
      ${linea('Devoluciones efectivo', d.devoluciones_efectivo, true)}
      ${linea('Gastos efectivo', d.gastos_efectivo, true)}
    </table>
    <hr/>
    <table>
      <tr class="b"><td class="l">Efectivo esperado</td><td class="r">${pesos(d.efectivo_esperado)}</td></tr>
      <tr><td class="l">Efectivo contado</td><td class="r">${pesos(d.monto_contado)}</td></tr>
      <tr class="b"><td class="l">Diferencia</td><td class="r" style="color:${difColor}">${pesos(
        d.diferencia
      )}</td></tr>
    </table>
    <hr/>
    <table>
      <tr><td class="l">N° de ventas</td><td class="r">${d.num_ventas}</td></tr>
      <tr class="b big"><td class="l">Total vendido</td><td class="r">${pesos(d.total_ventas)}</td></tr>
    </table>
    <div class="center" style="margin-top:10px">${d.cierre ?? ''}</div>
  </div>
</body></html>`
}

export async function imprimirCierre(
  d: any,
  cfg: Record<string, string>
): Promise<{ ok: boolean; mensaje?: string }> {
  const modo = cfg.impresion_modo || 'previsualizar'
  const deviceName = cfg.impresora_nombre || undefined
  if (modo === 'previsualizar') {
    const win = new BrowserWindow({
      width: 380,
      height: 720,
      title: 'Cierre de caja',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true }
    })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(generarCierreHtml(d, cfg, true)))
    return { ok: true }
  }
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(generarCierreHtml(d, cfg, false)))
  return new Promise((resolve) => {
    win.webContents.print(
      { silent: modo === 'auto', printBackground: true, deviceName, margins: { marginType: 'none' } },
      (success, failureReason) => {
        win.close()
        resolve(success ? { ok: true } : { ok: false, mensaje: failureReason })
      }
    )
  })
}

/** Lista las impresoras instaladas en el sistema (para la configuracion). */
export async function listarImpresoras(): Promise<{ name: string; isDefault: boolean }[]> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({ name: p.name, isDefault: p.isDefault }))
  } finally {
    win.close()
  }
}
