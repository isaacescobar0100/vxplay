-- ============================================================
--  Carta digital (QR por mesa) — ejecutar en Supabase (SQL Editor)
--  Guarda los productos de cada tienda y los sirve al celular del cliente.
--  Usa la anon key (pública). Nada sensible: solo nombre, precio y categoría.
-- ============================================================

-- 1) Tabla: un registro por producto y por tienda (licencia)
create table if not exists public.carta_productos (
  licencia    text    not null,
  producto_id int     not null,
  nombre      text    not null,
  precio      int     not null default 0,
  categoria   text,
  disponible  boolean not null default true,
  orden       int     not null default 0,
  primary key (licencia, producto_id)
);

alter table public.carta_productos enable row level security;
-- Sin políticas de acceso directo: sólo se entra por las funciones de abajo.

-- 2) El POS sube/reemplaza la carta de su tienda
create or replace function public.sync_carta(p_licencia text, p_productos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.carta_productos where licencia = p_licencia;
  insert into public.carta_productos (licencia, producto_id, nombre, precio, categoria, disponible, orden)
  select p_licencia,
         (x->>'id')::int,
         x->>'nombre',
         coalesce((x->>'precio')::int, 0),
         nullif(x->>'categoria', ''),
         coalesce((x->>'disponible')::boolean, true),
         coalesce((x->>'orden')::int, 0)
  from jsonb_array_elements(p_productos) as x;
end;
$$;
grant execute on function public.sync_carta(text, jsonb) to anon;

-- 3) El celular del cliente pide la carta pública (nombre de tienda + productos)
create or replace function public.obtener_carta(p_licencia text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t     record;
  prods jsonb;
begin
  select nombre, coalesce(tipo_negocio, 'general') as tipo, estado
    into t
    from public.tiendas
   where licencia = p_licencia;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('nombre', nombre, 'precio', precio, 'categoria', categoria)
             order by orden, nombre
           ), '[]'::jsonb)
    into prods
    from public.carta_productos
   where licencia = p_licencia and disponible = true;

  return jsonb_build_object(
    'ok', true,
    'tienda', t.nombre,
    'tipo', t.tipo,
    'estado', t.estado,
    'productos', prods
  );
end;
$$;
grant execute on function public.obtener_carta(text) to anon;
