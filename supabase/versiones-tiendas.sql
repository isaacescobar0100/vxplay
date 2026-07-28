-- Versión del POS instalada en cada tienda, para el panel superadmin.
--
-- portal_tienda tiene RLS y nadie la lee directo (ahí van las ventas de cada
-- tienda). Esta función expone SOLO licencia, versión y fecha del último
-- reporte: ni un dato de ventas. Se ejecuta con permisos del servidor
-- (security definer) y se habilita únicamente para usuarios autenticados,
-- que es como entra el superadmin.
--
-- Correr una sola vez en el SQL Editor de Supabase.

create or replace function versiones_tiendas()
returns table (
  licencia    text,
  version     text,
  actualizado timestamptz
)
language sql
security definer
set search_path = public
as $$
  select licencia,
         snapshot->>'version' as version,
         actualizado
    from portal_tienda;
$$;

revoke all on function versiones_tiendas() from public, anon;
grant execute on function versiones_tiendas() to authenticated;
