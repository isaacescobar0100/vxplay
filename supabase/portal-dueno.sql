-- ============================================================
-- Portal del Dueño — SQL para Supabase
-- Ejecutar UNA sola vez en:  Supabase → SQL Editor → New query → Run
-- ============================================================
-- NO toca la tabla resumen_ventas (el panel superadmin sigue igual).
-- Usa una tabla NUEVA aparte: portal_tienda.
--   - subir_snapshot        : el POS guarda la foto del día.
--   - guardar_clave_portal  : el POS define/cambia/borra la clave del dueño (bcrypt).
--   - obtener_resumen_dueno : la web entrega datos SOLO si licencia + clave coinciden.
-- ============================================================

create extension if not exists pgcrypto;

-- Tabla del portal: una fila por tienda
create table if not exists portal_tienda (
  licencia    text primary key,
  nombre      text,
  snapshot    jsonb,
  clave_hash  text,
  actualizado timestamptz default now()
);

-- Nadie accede directo: solo a través de las funciones (security definer)
alter table portal_tienda enable row level security;

-- Guardar la FOTO del día (nombre + snapshot). No toca la clave.
create or replace function subir_snapshot(
  p_licencia text,
  p_nombre   text,
  p_snapshot jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into portal_tienda (licencia, nombre, snapshot, actualizado)
  values (p_licencia, p_nombre, p_snapshot, now())
  on conflict (licencia) do update
    set nombre = excluded.nombre,
        snapshot = excluded.snapshot,
        actualizado = now();
$$;
grant execute on function subir_snapshot(text, text, jsonb) to anon;

-- Guardar / cambiar / borrar la clave del portal (bcrypt). Vacía = desactivar.
create or replace function guardar_clave_portal(
  p_licencia text,
  p_clave    text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if p_clave is null or length(p_clave) = 0 then
    v_hash := null;
  else
    v_hash := crypt(p_clave, gen_salt('bf'));
  end if;

  insert into portal_tienda (licencia, clave_hash, actualizado)
  values (p_licencia, v_hash, now())
  on conflict (licencia) do update
    set clave_hash = v_hash;
end;
$$;
grant execute on function guardar_clave_portal(text, text) to anon;

-- Entregar datos SOLO con licencia + clave correctas.
-- Incluye el gráfico de 30 días leyendo de resumen_ventas (sin exponerla directo).
create or replace function obtener_resumen_dueno(
  p_licencia text,
  p_clave    text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r       portal_tienda%rowtype;
  v_datos jsonb;
begin
  select * into r from portal_tienda where licencia = p_licencia;

  if not found or r.clave_hash is null then
    return jsonb_build_object('ok', false, 'error', 'El portal no está activado para esta tienda.');
  end if;
  if r.clave_hash <> crypt(p_clave, r.clave_hash) then
    return jsonb_build_object('ok', false, 'error', 'Clave incorrecta.');
  end if;

  -- Leemos la fila completa tal cual (to_jsonb) para no depender de los nombres
  -- exactos de columna. La web usa 'total' y 'fecha', que sí existen.
  select coalesce(jsonb_agg(to_jsonb(rv) order by rv.fecha), '[]'::jsonb)
    into v_datos
    from resumen_ventas rv
   where rv.licencia = p_licencia
     and rv.fecha::date >= (current_date - 30);

  return jsonb_build_object(
    'ok', true,
    'nombre', coalesce(r.nombre, ''),
    'snapshot', r.snapshot,
    'datos', v_datos,
    'actualizado', r.actualizado
  );
end;
$$;
grant execute on function obtener_resumen_dueno(text, text) to anon;
