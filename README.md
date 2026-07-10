# POS Tienda de Ropa 🛒👕

Sistema de punto de venta (POS) de escritorio para una tienda de ropa en Colombia.
Funciona **100% offline** (excepto la facturación electrónica DIAN, que requiere internet).

## Características

- **Punto de venta**: búsqueda por nombre, lectura de código de barras, carrito, cobro en
  efectivo / tarjeta / transferencia, cálculo de cambio.
- **Inventario**: productos con variantes de **talla y color**, stock por variante, precios,
  IVA (0% / 5% / 19%), categorías, alertas de stock bajo.
- **Clientes**: registro con tipo y número de documento (CC, NIT, CE, PP).
- **Facturación electrónica DIAN**: integración con proveedor tecnológico autorizado
  (Factus, Alegra, Siigo…). Modo **simulación** para pruebas sin credenciales.
- **Impresión de tickets** en impresora térmica (58/80 mm) o normal.
- **Reportes**: ventas por día, productos más vendidos, ventas por método de pago, stock bajo.
- **Historial** de ventas con reimpresión y emisión posterior de factura DIAN.

## Tecnología

| Capa | Tecnología |
|------|-----------|
| Escritorio | Electron 33 |
| UI | React 18 + TypeScript + Vite |
| Base de datos | SQLite vía **sql.js** (WebAssembly, sin compilación nativa) |
| Empaquetado | electron-builder (instalador NSIS `.exe`) |

La base de datos se guarda como un único archivo en:
`%APPDATA%\pos-ropa\pos-ropa.sqlite` (respáldalo periódicamente).

## Requisitos

- Windows 10/11
- Node.js 20 o superior (solo para desarrollo/compilación)

## Puesta en marcha (desarrollo)

```bash
npm install
npm run dev
```

> Si al instalar Electron no descarga su binario, ejecuta `node node_modules/electron/install.js`.

## Generar el instalador .exe

```bash
npm run dist
```

El instalador queda en la carpeta `release/`. Se instala con doble clic y crea accesos
directos en el escritorio y menú inicio.

Para una prueba rápida sin instalador (carpeta ejecutable):

```bash
npm run dist:dir
```

> **Nota (Windows sin admin):** si el empaquetado falla con
> `Cannot create symbolic link ... winCodeSign`, es un problema conocido al extraer
> la herramienta de firma (que no usamos). Solución: activa el **Modo desarrollador**
> de Windows (Configuración → Privacidad y seguridad → Para programadores), o extrae
> manualmente `winCodeSign-2.6.0.7z` de la caché
> `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` a una carpeta llamada
> `winCodeSign-2.6.0` (ignora los 2 errores de enlaces `.dylib` de macOS).

## Acceso inicial

- Usuario: **admin**
- Contraseña: **admin123**

(Cámbialo creando usuarios reales; la tabla `usuarios` ya lo soporta.)

## Configurar la facturación electrónica DIAN

1. Contrata un **proveedor tecnológico autorizado por la DIAN** (ej. [Factus](https://factus.com.co),
   Alegra, Siigo). Ellos te dan credenciales y un ambiente de **pruebas/habilitación**.
2. En la app, ve a **Configuración → Facturación electrónica DIAN** y completa:
   - URL de la API del proveedor
   - Token / API Key
   - ID de rango de numeración (lo asigna la DIAN/proveedor)
3. Cambia **Facturación electrónica** a *Habilitada*.

Mientras esté deshabilitada, las facturas se generan en modo **simulación** (con un CUFE
ficticio) para que puedas probar todo el flujo sin credenciales reales.

> ⚠️ El mapeo de campos en `src/main/dian.ts` está basado en un esquema tipo Factus.
> Ajústalo según la documentación oficial de tu proveedor.

## Estructura del proyecto

```
src/
  main/            Proceso principal de Electron (Node)
    index.ts       Arranque, ventana
    db.ts          SQLite (sql.js) + esquema
    handlers.ts    Canales IPC (lógica de negocio)
    dian.ts        Facturación electrónica DIAN
    printer.ts     Impresión de tickets
  preload/
    index.ts       API segura expuesta como window.api
  renderer/        Frontend React
    src/pages/     Login, Ventas, Inventario, Clientes, Reportes, Configuración, Historial
```

## Próximos pasos sugeridos

- Contraseñas con hash (bcrypt) en vez de texto plano.
- Gestión de usuarios/roles desde la interfaz.
- Copia de seguridad automática de la base de datos.
- Devoluciones / notas crédito.
- Reporte de cierre de caja diario (arqueo).
