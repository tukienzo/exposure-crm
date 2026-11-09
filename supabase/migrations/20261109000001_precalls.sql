-- Pre-calls (09/11/2026). Los mensajes de los grupos y chats de precall entran por 2chat
-- (/api/webhooks/2chat-precall) a crm_whatsapp_messages, que ya existe. Acá se suman:
--   · precall_chats: un chat por fila, vinculado (o no) a su agenda. Lo mantiene el cron /api/precalls-sync.
--   · precall_resumenes: los resúmenes diarios, semanales y mensuales, generados una sola vez y guardados.

create table if not exists public.precall_chats (
  chat_id text primary key,
  agenda_id uuid references public.agendas(id) on delete set null,
  chat_name text,
  tipo text not null default 'grupo' check (tipo in ('grupo', '1a1')),
  matcheo text check (matcheo in ('telefono', 'nombre')),   -- null = todavía sin vincular
  mensajes integer not null default 0,
  primer_msg_at timestamptz,
  ultimo_msg_at timestamptz,
  ultimo_texto text,
  ultimo_autor text,
  telefonos text[] not null default '{}',                   -- últimos 10 dígitos de quienes escribieron (sin el número de la empresa)
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists precall_chats_agenda_idx on public.precall_chats (agenda_id);
create index if not exists precall_chats_ultimo_idx on public.precall_chats (ultimo_msg_at desc);
alter table public.precall_chats enable row level security;
revoke all on public.precall_chats from anon, authenticated;

create table if not exists public.precall_resumenes (
  id uuid primary key default gen_random_uuid(),
  periodo text not null check (periodo in ('diario', 'semanal', 'mensual')),
  alcance text not null,              -- 'global' o 'chat:<chat_id>'
  fecha_inicio date not null,         -- día, lunes de la semana o primer día del mes (hora argentina)
  fecha_fin date not null,
  texto text not null,
  modelo text,
  mensajes_usados integer not null default 0,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  generado_at timestamptz not null default now(),
  unique (periodo, alcance, fecha_inicio)
);
create index if not exists precall_resumenes_periodo_idx on public.precall_resumenes (periodo, fecha_inicio desc);
alter table public.precall_resumenes enable row level security;
revoke all on public.precall_resumenes from anon, authenticated;

-- Para que el cron lea solo lo nuevo (cursor por created_at).
create index if not exists crm_whatsapp_messages_created_idx on public.crm_whatsapp_messages (created_at);
