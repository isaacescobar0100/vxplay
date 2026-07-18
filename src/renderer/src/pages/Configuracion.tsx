import { useEffect, useState } from 'react'
import { avisar, confirmar } from '../dialogo'
import Icon from '../components/Icon'

export default function Configuracion(): JSX.Element {
  const [cfg, setCfg] = useState<Record<string, string>>({})
  const [guardado, setGuardado] = useState(false)
  const [impresoras, setImpresoras] = useState<{ name: string; isDefault: boolean }[]>([])
  const [backups, setBackups] = useState<{ nombre: string; fecha: string; kb: number }[]>([])
  const [nubeUltimo, setNubeUltimo] = useState<string | null>(null)
  const [nubeCargando, setNubeCargando] = useState(false)
  const [cartaCargando, setCartaCargando] = useState(false)
  const [dianPrueba, setDianPrueba] = useState<{ ok: boolean; simulacion?: boolean; mensaje: string } | null>(null)
  const [dianProbando, setDianProbando] = useState(false)
  const [reiniciar, setReiniciar] = useState(false)
  const [portalClave, setPortalClave] = useState('')
  const [portalMsg, setPortalMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [portalGuardando, setPortalGuardando] = useState(false)

  async function probarDian(): Promise<void> {
    // guardamos primero para que la prueba use los valores actuales
    for (const [k, v] of Object.entries(cfg)) await window.api.configSet(k, v ?? '')
    setDianProbando(true)
    const r: any = await window.api.dianProbar()
    setDianProbando(false)
    setDianPrueba(r)
  }

  async function cargarBackups(): Promise<void> {
    setBackups((await window.api.backupListar()) as any[])
  }
  async function cargarNube(): Promise<void> {
    const r: any = await window.api.nubeUltimo()
    setNubeUltimo(r.fecha)
  }

  useEffect(() => {
    window.api.configGetAll().then(setCfg)
    window.api.listarImpresoras().then(setImpresoras)
    cargarBackups()
    cargarNube()
  }, [])

  async function respaldarNube(): Promise<void> {
    setNubeCargando(true)
    const r: any = await window.api.nubeSubir()
    setNubeCargando(false)
    if (r.ok) {
      await cargarNube()
      avisar('Respaldo subido a la nube correctamente. ✔')
    } else {
      avisar('No se pudo respaldar: ' + (r.error ?? ''))
    }
  }
  async function restaurarNube(): Promise<void> {
    if (
      !(await confirmar(
        '⚠️ RESTAURAR DESDE LA NUBE\n\n' +
          'Esto REEMPLAZA los datos actuales de este equipo por la última copia en la nube. ' +
          'Si aquí hay ventas más nuevas que la copia, se perderían.\n\n' +
          'Úsalo solo para RECUPERAR (equipo dañado o datos perdidos), no a diario.\n\n' +
          'Tranquilo: antes de reemplazar, se guarda automáticamente una copia del estado actual ' +
          '(queda en "Respaldo local"), por si necesitas volver atrás.\n\n' +
          '¿Continuar? La app se reiniciará.'
      ))
    ) {
      return
    }
    const r: any = await window.api.nubeRestaurar()
    if (!r.ok) avisar('No se pudo restaurar: ' + (r.error ?? ''))
    // si ok, la app se reinicia sola
  }

  async function publicarCarta(): Promise<void> {
    setCartaCargando(true)
    const r: any = await window.api.cartaPublicar()
    setCartaCargando(false)
    if (r.ok) {
      avisar(
        'Carta publicada con ' + r.count + ' producto(s).\n\nLos clientes ya la ven al escanear el QR de la mesa.'
      )
    } else {
      avisar('No se pudo publicar la carta: ' + (r.error ?? ''))
    }
  }

  async function guardarPortalClave(desactivar = false): Promise<void> {
    const clave = desactivar ? '' : portalClave.trim()
    if (!desactivar && clave.length < 4) {
      setPortalMsg({ ok: false, texto: 'La clave debe tener al menos 4 caracteres.' })
      return
    }
    setPortalGuardando(true)
    const r: any = await window.api.portalGuardarClave(clave)
    setPortalGuardando(false)
    if (r.ok) {
      setCfg((c) => ({ ...c, portal_clave_set: clave ? '1' : '0' }))
      setPortalClave('')
      setPortalMsg({
        ok: true,
        texto: clave ? 'Clave guardada. El dueño ya puede entrar al portal. ✔' : 'Portal desactivado.'
      })
    } else {
      setPortalMsg({ ok: false, texto: r.error ?? 'No se pudo guardar.' })
    }
  }

  async function exportar(): Promise<void> {
    const r: any = await window.api.backupExportar()
    if (r.ok) avisar('Copia exportada en:\n' + r.ruta)
  }
  async function crearRespaldo(): Promise<void> {
    await window.api.backupCrear()
    await cargarBackups()
    avisar('Respaldo creado correctamente.')
  }
  async function importar(): Promise<void> {
    await window.api.backupImportar() // si el usuario confirma, la app se reinicia sola
  }

  function subirLogo(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      avisar('La imagen es muy grande (máx. 500 KB). Usa una más pequeña.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('tienda_logo', reader.result as string)
    reader.readAsDataURL(file)
  }

  function set(k: string, v: string): void {
    setCfg((c) => ({ ...c, [k]: v }))
  }

  async function guardar(): Promise<void> {
    for (const [k, v] of Object.entries(cfg)) {
      await window.api.configSet(k, v ?? '')
    }
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const central = cfg.config_central === '1'

  return (
    <div>
      <div className="page-title">Configuración</div>

      {central && (
        <div
          className="card"
          style={{ marginBottom: 16, background: 'rgba(99,102,241,.12)', border: '1px solid var(--primary)', fontSize: 13 }}
        >
          <Icon name="lock" size={15} /> Los <b>datos fiscales, DIAN y tipo de negocio</b> los gestiona el
          proveedor (VxPlay) desde el panel central. Aquí solo puedes ajustar lo operativo de tu tienda
          (logo, impresión, respaldos).
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 14 }}>
          <Icon name="store" size={18} /> Datos de la tienda
        </h3>
        <div className="field">
          <label>Tipo de negocio</label>
          <select value={cfg.tipo_negocio ?? 'ropa'} onChange={(e) => set('tipo_negocio', e.target.value)} disabled={central}>
            <option value="ropa">Tienda de ropa (con tallas y colores)</option>
            <option value="general">Tienda general (productos simples)</option>
            <option value="bar">Bar / Club (con mesas y comandas)</option>
            <option value="restaurante">Restaurante (con mesas y comandas)</option>
          </select>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Cambia qué funciones aparecen. Guarda y reinicia la app para aplicarlo.
          </p>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Nombre del negocio</label>
            <input value={cfg.tienda_nombre ?? ''} onChange={(e) => set('tienda_nombre', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>NIT</label>
            <input value={cfg.tienda_nit ?? ''} onChange={(e) => set('tienda_nit', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>Dirección</label>
            <input value={cfg.tienda_direccion ?? ''} onChange={(e) => set('tienda_direccion', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>Ciudad</label>
            <input value={cfg.tienda_ciudad ?? ''} onChange={(e) => set('tienda_ciudad', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input value={cfg.tienda_telefono ?? ''} onChange={(e) => set('tienda_telefono', e.target.value)} disabled={central} />
          </div>
          <div className="field">
            <label>IVA por defecto (%)</label>
            <input value={cfg.iva_defecto ?? '19'} onChange={(e) => set('iva_defecto', e.target.value)} />
          </div>
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label>Logo de la tienda (aparece en el tiquete)</label>
          <div className="row" style={{ alignItems: 'center', gap: 14 }}>
            {cfg.tienda_logo ? (
              <img
                src={cfg.tienda_logo}
                alt="logo"
                style={{ maxHeight: 60, maxWidth: 120, background: '#fff', borderRadius: 6, padding: 4 }}
              />
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>
                Sin logo
              </span>
            )}
            <label
              style={{
                cursor: 'pointer',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Icon name="image" size={15} /> Subir logo
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={subirLogo} />
            </label>
            {cfg.tienda_logo && (
              <button className="btn-sm btn-danger" onClick={() => set('tienda_logo', '')}>
                Quitar
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Recomendado: imagen pequeña (logo en blanco/negro se ve mejor en impresora térmica). Recuerda dar <b>Guardar</b>.
          </p>
        </div>
      </div>

      {cfg.tipo_negocio !== 'ropa' && (
      <>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="users" size={18} /> Fiado / crédito (cuentas por cobrar)
        </h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Actívalo para poder vender <b>fiado</b> (a crédito). Aparecerá el método de pago <b>Fiado</b> al cobrar
          (exige elegir un cliente) y el módulo <b>Cuentas por cobrar</b> para registrar abonos y ver quién debe.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={cfg.fiado_habilitado === '1'}
            onChange={(e) => set('fiado_habilitado', e.target.checked ? '1' : '0')}
            style={{ width: 18, height: 18 }}
          />
          Habilitar ventas fiado en esta tienda
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Recuerda dar <b>Guardar</b>. Si lo activas, reinicia la app para ver el módulo en el menú.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="cash" size={18} /> Propina
        </h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Al cobrar podrás registrar la propina (por mesero). Elige cómo la maneja tu negocio.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={cfg.propina_habilitada === '1'}
            onChange={(e) => set('propina_habilitada', e.target.checked ? '1' : '0')}
            style={{ width: 18, height: 18 }}
          />
          Habilitar propina en esta tienda
        </label>
        {cfg.propina_habilitada === '1' && (
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Modo</label>
              <select value={cfg.propina_modo ?? 'efectivo'} onChange={(e) => set('propina_modo', e.target.value)}>
                <option value="efectivo">Voluntaria en efectivo (el mesero se la queda)</option>
                <option value="factura">Obligatoria en la factura (se suma al total)</option>
              </select>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {cfg.propina_modo === 'factura'
                  ? 'Se agrega el % al total de cada cuenta.'
                  : 'Se registra la propina en efectivo; NO entra a la caja (la tiene el mesero).'}
              </p>
            </div>
            <div className="field">
              <label>% sugerido</label>
              <input
                type="number"
                value={cfg.propina_pct ?? '10'}
                onChange={(e) => set('propina_pct', e.target.value)}
                placeholder="10"
              />
            </div>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Recuerda dar <b>Guardar</b> y reiniciar la app para aplicarlo.
        </p>
      </div>
      </>
      )}

      {cfg.tipo_negocio !== 'ropa' && (
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="qr" size={18} /> Carta digital (QR por mesa)
        </h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Sube tu menú a la nube para que los clientes lo vean en su celular al escanear el QR de la mesa.
          Presiona <b>Publicar carta</b> cada vez que cambies precios o productos. El enlace de la carta ya viene
          configurado (no hay que escribir nada).
        </p>
        <div className="row">
          <button className="btn-primary btn-icon" onClick={publicarCarta} disabled={cartaCargando}>
            <Icon name="check" size={15} /> {cartaCargando ? 'Publicando...' : 'Publicar carta ahora'}
          </button>
        </div>
      </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="chart" size={18} /> Portal del Dueño (ver desde el celular)
        </h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Deja que el dueño vea las ventas del día, la utilidad, la caja y el stock bajo desde su
          <b> celular o computador</b>, sin instalar nada y <b>sin poder modificar</b>. Define una clave; el
          dueño entra en la página con la <b>licencia</b> de la tienda y esa clave.
        </p>

        <div
          style={{
            background: 'var(--panel-2)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 14,
            lineHeight: 1.7
          }}
        >
          <div>
            Página del dueño:{' '}
            <b style={{ color: 'var(--primary)' }}>https://vxplay.vercel.app/panel.html</b>
          </div>
          <div>
            Licencia de esta tienda: <b>{cfg.licencia_codigo ?? '—'}</b>
          </div>
          <div>
            Estado:{' '}
            <b style={{ color: cfg.portal_clave_set === '1' ? 'var(--green)' : 'var(--amber)' }}>
              {cfg.portal_clave_set === '1' ? 'Activado (clave configurada)' : 'Sin activar'}
            </b>
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: 'end' }}>
          <div className="field">
            <label>{cfg.portal_clave_set === '1' ? 'Cambiar clave del dueño' : 'Clave del dueño'}</label>
            <input
              type="password"
              value={portalClave}
              onChange={(e) => setPortalClave(e.target.value)}
              placeholder="Mínimo 4 caracteres"
            />
          </div>
          <div className="field">
            <button
              className="btn-primary btn-icon"
              onClick={() => guardarPortalClave(false)}
              disabled={portalGuardando}
              style={{ width: '100%' }}
            >
              <Icon name="check" size={15} /> {portalGuardando ? 'Guardando...' : 'Guardar clave'}
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 6, alignItems: 'center', gap: 12 }}>
          {cfg.portal_clave_set === '1' && (
            <button className="btn-sm btn-danger" onClick={() => guardarPortalClave(true)} disabled={portalGuardando}>
              Desactivar portal
            </button>
          )}
          {portalMsg && (
            <span style={{ fontSize: 13, color: portalMsg.ok ? 'var(--green)' : 'var(--red)' }}>{portalMsg.texto}</span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          La clave se guarda <b>encriptada</b> en la nube (no se ve en texto). La página se actualiza sola con las
          ventas del día. Este apartado <b>no</b> necesita el botón Guardar de abajo.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="cash" size={18} /> Respaldo en la nube
        </h3>
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Tus datos se suben a la nube <b>automáticamente cada 24 horas y al cerrar caja</b>. Si el
          computador se daña, instala la app en otro, activa la misma licencia y restaura desde la nube.
        </p>
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          Último respaldo en la nube:{' '}
          <b style={{ color: nubeUltimo ? 'var(--green)' : 'var(--amber)' }}>
            {nubeUltimo ?? 'aún no se ha subido'}
          </b>
        </div>
        <div className="row">
          <button className="btn-green btn-icon" onClick={respaldarNube} disabled={nubeCargando}>
            <Icon name="check" size={15} /> {nubeCargando ? 'Subiendo...' : 'Respaldar en la nube ahora'}
          </button>
          <button className="btn-danger btn-icon" onClick={restaurarNube}>
            <Icon name="undo" size={15} /> Restaurar desde la nube
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="lock" size={18} /> Respaldo local (en este equipo)
        </h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          La app hace una copia de seguridad <b>automática cada vez que inicia</b> (guarda las
          últimas 15). También puedes exportar una copia a una USB o restaurar desde un archivo.
        </p>
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn-primary btn-icon" onClick={exportar}>
            <Icon name="print" size={15} /> Exportar copia
          </button>
          <button className="btn-icon" onClick={crearRespaldo}>
            <Icon name="check" size={15} /> Crear respaldo ahora
          </button>
          <button className="btn-danger btn-icon" onClick={importar}>
            <Icon name="undo" size={15} /> Restaurar desde archivo
          </button>
        </div>
        {backups.length > 0 && (
          <div style={{ maxHeight: 160, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Respaldo automático</th>
                  <th>Fecha</th>
                  <th className="text-right">Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.nombre}>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {b.nombre}
                    </td>
                    <td className="muted">{b.fecha}</td>
                    <td className="text-right muted">{b.kb} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="print" size={18} /> Impresión de tiquetes
        </h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Modo <b>previsualizar</b>: muestra el tiquete en pantalla (puedes imprimir o guardar PDF).
          Modo <b>automático</b>: imprime solo, sin preguntar, en la impresora elegida (ideal en tienda).
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Modo de impresión</label>
            <select
              value={cfg.impresion_modo ?? 'previsualizar'}
              onChange={(e) => set('impresion_modo', e.target.value)}
            >
              <option value="previsualizar">Previsualizar en pantalla</option>
              <option value="auto">Automático (imprime solo)</option>
              <option value="dialogo">Mostrar diálogo de Windows</option>
            </select>
          </div>
          <div className="field">
            <label>Impresora</label>
            <select
              value={cfg.impresora_nombre ?? ''}
              onChange={(e) => set('impresora_nombre', e.target.value)}
            >
              <option value="">Impresora por defecto de Windows</option>
              {impresoras.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isDefault ? '(por defecto)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ancho del papel</label>
            <select value={cfg.ancho_papel ?? '58'} onChange={(e) => set('ancho_papel', e.target.value)}>
              <option value="58">58 mm (rollo pequeño)</option>
              <option value="80">80 mm (rollo grande)</option>
            </select>
          </div>
        </div>
        {impresoras.length === 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            No se detectaron impresoras instaladas. Cuando conectes la impresora térmica,
            aparecerá aquí y podrás cambiar a modo automático.
          </p>
        )}
      </div>

      {(!central || cfg.dian_habilitado === '1') && (
      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 6 }}>
          <Icon name="receipt" size={18} /> Facturación electrónica DIAN
        </h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Se conecta con un proveedor tecnológico autorizado por la DIAN (ej. Factus, Alegra,
          Siigo). Mientras esté deshabilitada, el sistema genera facturas <b>simuladas</b> para
          pruebas.
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Proveedor</label>
            <select value={cfg.dian_proveedor ?? 'factus'} onChange={(e) => set('dian_proveedor', e.target.value)} disabled={central}>
              <option value="factus">Factus</option>
              <option value="alegra">Alegra</option>
              <option value="siigo">Siigo</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="field">
            <label>Ambiente</label>
            <select value={cfg.dian_ambiente ?? 'pruebas'} onChange={(e) => set('dian_ambiente', e.target.value)} disabled={central}>
              <option value="pruebas">Pruebas / Habilitación</option>
              <option value="produccion">Producción</option>
            </select>
          </div>
          <div className="field">
            <label>URL API del proveedor</label>
            <input
              value={cfg.dian_api_url ?? ''}
              onChange={(e) => set('dian_api_url', e.target.value)}
              placeholder="https://api.factus.com.co"
              disabled={central}
            />
          </div>
          <div className="field">
            <label>Token / API Key</label>
            <input
              type="password"
              value={cfg.dian_api_token ?? ''}
              onChange={(e) => set('dian_api_token', e.target.value)}
              placeholder="Bearer token del proveedor"
              disabled={central}
            />
          </div>
          <div className="field">
            <label>ID rango de numeración (opcional)</label>
            <input
              value={cfg.dian_rango_numeracion ?? ''}
              onChange={(e) => set('dian_rango_numeracion', e.target.value)}
              disabled={central}
            />
          </div>
          <div className="field">
            <label>Facturación electrónica</label>
            <select value={cfg.dian_habilitado ?? '0'} onChange={(e) => set('dian_habilitado', e.target.value)} disabled={central}>
              <option value="0">Deshabilitada (modo simulación)</option>
              <option value="1">Habilitada (emite facturas reales)</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, alignItems: 'center', gap: 10 }}>
          <button className="btn-icon" onClick={probarDian} disabled={dianProbando}>
            <Icon name="check" size={15} /> {dianProbando ? 'Probando...' : 'Probar conexión DIAN'}
          </button>
          {dianPrueba && (
            <span
              style={{
                fontSize: 13,
                color: dianPrueba.ok ? (dianPrueba.simulacion ? 'var(--amber)' : 'var(--green)') : 'var(--red)'
              }}
            >
              {dianPrueba.mensaje}
            </span>
          )}
        </div>
      </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn-primary" onClick={guardar}>
          Guardar configuración
        </button>
        {guardado && (
          <span style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={16} /> Guardado
          </span>
        )}
      </div>

      {/* Zona de peligro: reiniciar datos (pasar de pruebas a operación real) */}
      <div className="card" style={{ marginTop: 28, border: '1px solid var(--red)' }}>
        <h3 className="section-title" style={{ marginBottom: 6, color: 'var(--red)' }}>
          <Icon name="alert" size={18} /> Zona de peligro — Reiniciar datos
        </h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Borra las <b>ventas, movimientos, caja, compras, gastos y mesas</b> para dejar la tienda lista para operar
          de verdad (después de las pruebas). <b>Conserva usuarios y configuración.</b> Esta acción <b>no se puede
          deshacer</b>.
        </p>
        <button className="btn-danger btn-icon" onClick={() => setReiniciar(true)}>
          <Icon name="trash" size={15} /> Reiniciar datos de la tienda
        </button>
      </div>

      {reiniciar && <ReiniciarModal onClose={() => setReiniciar(false)} />}
    </div>
  )
}

function ReiniciarModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [borrarCatalogo, setBorrarCatalogo] = useState(false)
  const [texto, setTexto] = useState('')
  const [procesando, setProcesando] = useState(false)
  const confirmado = texto.trim().toUpperCase() === 'REINICIAR'

  async function ejecutar(): Promise<void> {
    if (!confirmado) return
    setProcesando(true)
    await window.api.tiendaReiniciarDatos(borrarCatalogo)
    // recargar para reflejar la base limpia
    window.location.reload()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <h3 style={{ marginTop: 0, color: 'var(--red)' }}>Reiniciar datos de la tienda</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Se borrarán <b>ventas, devoluciones, movimientos de inventario, caja, compras, gastos, mesas, abonos y
          propinas</b>. Se conservan <b>usuarios y configuración</b>. <b>No se puede deshacer.</b>
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, margin: '12px 0' }}>
          <input
            type="checkbox"
            checked={borrarCatalogo}
            onChange={(e) => setBorrarCatalogo(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          También borrar <b>productos y clientes</b> (empezar 100% de cero)
        </label>
        <div className="field">
          <label>
            Para confirmar, escribe <b>REINICIAR</b>:
          </label>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="REINICIAR" autoFocus />
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={procesando}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={ejecutar} disabled={!confirmado || procesando}>
            {procesando ? 'Borrando...' : 'Sí, reiniciar'}
          </button>
        </div>
      </div>
    </div>
  )
}
