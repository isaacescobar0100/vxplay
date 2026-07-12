import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'

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

/** Devuelve las medidas del ticket según el ancho de papel configurado (58 u 80 mm). */
function medidasPapel(cfg: Record<string, string>): {
  ancho: string
  pad: string
  fs: string
  big: string
  logo: string
  papel: string
} {
  const ochenta = cfg.ancho_papel === '80'
  return ochenta
    ? { ancho: '68mm', pad: '2mm', fs: '13px', big: '16px', logo: '60mm', papel: '80mm' }
    : { ancho: '42mm', pad: '1mm', fs: '12px', big: '14px', logo: '38mm', papel: '58mm' }
}

/** HTML del ticket. Si `preview` es true, agrega una barra de acciones arriba. */
function generarHtml(venta: any, cfg: Record<string, string>, preview: boolean): string {
  const m = medidasPapel(cfg)
  const items = (venta.items ?? [])
    .map(
      (it: any) => `
      <tr><td class="l b" colspan="2">${it.producto_nombre}${it.talla ? ' T:' + it.talla : ''}${
        it.color ? ' ' + it.color : ''
      }</td></tr>
      <tr>
        <td class="l">${it.cantidad} x ${pesos(it.precio_unitario)}</td>
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
  @page { size: ${m.papel} auto; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background: ${preview ? '#334155' : '#fff'}; margin:0; padding:0; }
  .ticket {
    font-family: 'Courier New', monospace; font-size: ${m.fs}; color:#000; background:#fff;
    font-weight: bold; -webkit-font-smoothing: none;
    width: ${m.ancho}; padding: ${m.pad}; ${preview ? 'margin: 78px auto 24px; box-shadow: 0 8px 30px rgba(0,0,0,.4);' : 'margin:0;'}
  }
  .center { text-align:center; }
  .b { font-weight:bold; }
  .big { font-size:${m.big}; }
  hr { border:none; border-top:1px dashed #000; margin:6px 0; }
  table { width:100%; border-collapse:collapse; }
  td.l { text-align:left; }
  td.r { text-align:right; }
  .tot td { padding-top:2px; }
  .dian { margin-top:8px; font-size:10px; word-break:break-all; text-align:center; }
  .cufe { font-size:9px; }
  .foot { margin-top:8px; text-align:center; }
  .deco { overflow:hidden; white-space:nowrap; text-align:center; letter-spacing:1px; line-height:1; margin:4px 0; }
  .stars { letter-spacing:3px; }
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
    ${cfg.tienda_logo ? `<img src="${cfg.tienda_logo}" style="max-width:${m.logo};max-height:70px;display:block;margin:0 auto 6px;background:#fff;filter:grayscale(1) contrast(2.6) brightness(1.05)"/>` : ''}
    <div class="center b big">${cfg.tienda_nombre ?? 'Mi Tienda'}</div>
    <div class="center">NIT: ${cfg.tienda_nit ?? ''}</div>
    <div class="center">${cfg.tienda_direccion ?? ''}</div>
    <div class="center">${cfg.tienda_ciudad ?? ''} - Tel: ${cfg.tienda_telefono ?? ''}</div>
    <div class="deco">========================================</div>
    <div>Venta: ${venta.numero}</div>
    <div>Fecha: ${venta.fecha}</div>
    <div>Cliente: ${venta.cliente_nombre ?? 'Consumidor Final'}</div>
    ${venta.cliente_documento ? `<div>Doc: ${venta.cliente_documento}</div>` : ''}
    <div class="deco">----------------------------------------</div>
    <table>${items}</table>
    <div class="deco">----------------------------------------</div>
    <table class="tot">
      <tr><td class="l">Subtotal</td><td class="r">${pesos(venta.subtotal)}</td></tr>
      ${venta.descuento ? `<tr><td class="l">Descuento</td><td class="r">-${pesos(venta.descuento)}</td></tr>` : ''}
      <tr><td class="l">IVA</td><td class="r">${pesos(venta.iva)}</td></tr>
      <tr class="b big"><td class="l">TOTAL</td><td class="r">${pesos(venta.total)}</td></tr>
      <tr><td class="l">Pago (${venta.metodo_pago})</td><td class="r">${pesos(venta.pago_recibido)}</td></tr>
      <tr><td class="l">Cambio</td><td class="r">${pesos(venta.cambio)}</td></tr>
    </table>
    ${dianInfo}
    <div class="deco">========================================</div>
    <div class="foot b">GRACIAS POR SU COMPRA!</div>
    <div class="deco stars">* * * * * * * * * * * * * * * *</div>
    <div class="foot">Vuelva pronto</div>
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
  const m = medidasPapel(cfg)
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
  @page{size:${m.papel} auto;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:${preview ? '#334155' : '#fff'};margin:0;padding:0}
  .ticket{font-family:'Courier New',monospace;font-size:${m.fs};color:#000;background:#fff;font-weight:bold;-webkit-font-smoothing:none;width:${m.ancho};padding:${m.pad};${
    preview ? 'margin:78px auto 24px;box-shadow:0 8px 30px rgba(0,0,0,.4)' : 'margin:0'
  }}
  .center{text-align:center}.b{font-weight:bold}.big{font-size:${m.big}}
  hr{border:none;border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}td.l{text-align:left}td.r{text-align:right}
  .toolbar{position:fixed;top:0;left:0;right:0;height:54px;background:#1e293b;color:#e2e8f0;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-family:'Segoe UI',sans-serif;font-size:14px}
  .toolbar button{font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:9px 14px;margin-left:8px;cursor:pointer;background:#6366f1;color:#fff}
  .toolbar button.close{background:#334155}
  @media print{.no-print{display:none!important}html,body{background:#fff}.ticket{margin:0;box-shadow:none}}
</style></head><body>
  ${barra}
  <div class="ticket">
    ${cfg.tienda_logo ? `<img src="${cfg.tienda_logo}" style="max-width:${m.logo};max-height:70px;display:block;margin:0 auto 6px;background:#fff;filter:grayscale(1) contrast(2.6) brightness(1.05)"/>` : ''}
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

function envolverEtiquetas(cuerpoHtml: string, conBarra: boolean): string {
  const barra = conBarra
    ? `<div class="toolbar no-print">
         <span>Etiquetas de código de barras</span>
         <div>
           <button onclick="window.print()">Imprimir / elegir impresora</button>
           <button class="close" onclick="window.close()">Cerrar</button>
         </div>
       </div>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;background:#334155;padding:0}
  .toolbar{position:sticky;top:0;background:#1e293b;color:#e2e8f0;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;font-size:14px}
  .toolbar button{font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:9px 14px;margin-left:8px;cursor:pointer;background:#6366f1;color:#fff}
  .toolbar button.close{background:#334155}
  .hoja{background:#fff;color:#000;margin:16px auto;padding:6mm;width:210mm;max-width:96%;display:flex;flex-wrap:wrap;gap:3mm;align-content:flex-start}
  .etq{border:1px dashed #bbb;width:48mm;padding:3mm 2mm;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .etq .nom{font-size:10px;font-weight:700;line-height:1.1;margin-bottom:1mm;max-height:24px;overflow:hidden}
  .etq .precio{font-size:13px;font-weight:800;margin-bottom:1mm}
  .etq svg{max-width:44mm}
  .etq .cod{font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;margin-top:1px}
  @media print{ body{background:#fff} .no-print{display:none!important} .hoja{margin:0;width:auto} .etq{border:none} }
</style></head><body>
  ${barra}
  <div class="hoja">${cuerpoHtml}</div>
</body></html>`
}

/** Abre una ventana con las etiquetas para imprimir (permite elegir impresora). */
export async function imprimirEtiquetas(cuerpoHtml: string): Promise<{ ok: boolean }> {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Etiquetas',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true }
  })
  await win.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(envolverEtiquetas(cuerpoHtml, true))
  )
  return { ok: true }
}

/** Genera un PDF con las etiquetas y lo guarda donde el usuario elija. */
export async function etiquetasPdf(cuerpoHtml: string): Promise<{ ok: boolean; ruta?: string }> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(envolverEtiquetas(cuerpoHtml, false))
  )
  const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  win.close()
  const ts = new Date().toISOString().slice(0, 10)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Descargar etiquetas',
    defaultPath: `etiquetas-${ts}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return { ok: false }
  writeFileSync(filePath, pdf)
  return { ok: true, ruta: filePath }
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
