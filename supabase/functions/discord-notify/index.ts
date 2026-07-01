const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

type Profile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  is_superadmin: boolean | null;
  sections: string[] | null;
  sections_edit: string[] | null;
};

type Garde = {
  user_id: string;
  prenom: string | null;
  nom: string | null;
  grade: string | null;
};

type Caller = {
  userId: string;
  profile: Profile;
  garde: Garde | null;
};

type AuthUser = {
  id: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function text(value: unknown, fallback = '') {
  return String(value ?? fallback).trim();
}

function truncate(value: unknown, max = 450) {
  const raw = text(value);
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function webhookFor(action: string) {
  if (action.startsWith('presence_')) {
    return Deno.env.get('DISCORD_WEBHOOK_PRESENCE') || Deno.env.get('DISCORD_WEBHOOK') || '';
  }
  if (action.startsWith('renseignement_')) {
    return Deno.env.get('DISCORD_WEBHOOK_RENSEIGNEMENT') || '';
  }
  if (action === 'agenda_created') {
    return Deno.env.get('DISCORD_WEBHOOK_AGENDA') || '';
  }
  return '';
}

function serviceHeaders(extra: HeadersInit = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

function restUrl(table: string, params: Record<string, string>) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function fetchSingle<T>(table: string, params: Record<string, string>): Promise<T | null> {
  const response = await fetch(restUrl(table, params), {
    headers: serviceHeaders({ Accept: 'application/json' }),
  });
  if (!response.ok) {
    throw new Error(`Lecture ${table} refusée (${response.status}).`);
  }
  const rows = await response.json() as T[];
  return rows[0] || null;
}

function hasSection(caller: Caller, section: string) {
  return caller.profile.is_superadmin === true || (caller.profile.sections || []).includes(section);
}

function canEditSection(caller: Caller, section: string) {
  return caller.profile.is_superadmin === true || (caller.profile.sections_edit || []).includes(section);
}

function callerName(caller: Caller) {
  const gardeName = [caller.garde?.prenom, caller.garde?.nom].filter(Boolean).join(' ');
  return gardeName || caller.profile.display_name || caller.profile.username || 'Garde inconnu';
}

function callerGrade(caller: Caller) {
  return caller.garde?.grade || '—';
}

function authorLine(caller: Caller) {
  const grade = callerGrade(caller);
  return grade && grade !== '—' ? `${callerName(caller)} *(${grade})*` : callerName(caller);
}

function discordDate(value: unknown) {
  const raw = text(value);
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

async function requireCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Session manquante.');

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userResponse.ok) throw new Error('Session invalide.');
  const user = await userResponse.json() as AuthUser;
  if (!user?.id) throw new Error('Session invalide.');

  const profile = await fetchSingle<Profile>('mk_profiles', {
    select: 'user_id,username,display_name,is_superadmin,sections,sections_edit',
    user_id: `eq.${user.id}`,
    limit: '1',
  });
  if (!profile) throw new Error('Profil introuvable.');

  const garde = await fetchSingle<Garde>('mk_gardes', {
    select: 'user_id,prenom,nom,grade',
    user_id: `eq.${user.id}`,
    limit: '1',
  });

  return {
    userId: user.id,
    profile,
    garde,
  };
}

async function buildPresenceMessage(action: string, payload: Record<string, unknown>, caller: Caller) {
  if (!hasSection(caller, 'presences')) throw new Error('Accès présences requis.');
  if (action === 'presence_start') {
    return `🟢 **${callerName(caller)}** *(${callerGrade(caller)})* a pris son service.`;
  }
  if (action === 'presence_stop') {
    return `🔴 **${callerName(caller)}** *(${callerGrade(caller)})* est en fin de service.`;
  }
  if (action === 'presence_force_stop') {
    if (!caller.profile.is_superadmin && !canEditSection(caller, 'garde')) {
      throw new Error('Permission insuffisante.');
    }
    const targetName = truncate(payload.targetName, 120) || 'Garde inconnu';
    const targetGrade = truncate(payload.targetGrade, 80);
    return `🔴 **${targetName}**${targetGrade ? ` *(${targetGrade})*` : ''} a été mis hors service.`;
  }
  throw new Error('Action présence inconnue.');
}

function buildRenseignementMessage(action: string, payload: Record<string, unknown>, caller: Caller) {
  if (!hasSection(caller, 'renseignements')) throw new Error('Accès renseignements requis.');
  const isFiche = action === 'renseignement_fiche';
  if (!isFiche && action !== 'renseignement_rapport') throw new Error('Action renseignement inconnue.');

  const detail = truncate(payload.detail, 180);
  const title = isFiche
    ? '<:corbeau:1517815921258008697> **Nouvelle fiche versée aux archives**'
    : '<:corbeau:1517815921258008697> **Nouveau rapport déposé**';
  const subtitle = isFiche
    ? "-# *Une nouvelle fiche vient d'être versée aux archives de Fort-Aube.*"
    : "-# *Un nouveau rapport de renseignement vient d'être déposé.*";
  const detailLine = detail ? `\n> **${isFiche ? 'Fiche' : 'Rapport'} :** ${detail}` : '';

  return `${title}\n${subtitle}${detailLine}\n> **Par :** ${authorLine(caller)}\n\n<:aube:1516926588359540856> Consultez les archives et transmettez tout élément complémentaire à votre supérieur.`;
}

async function buildAgendaMessage(payload: Record<string, unknown>, caller: Caller) {
  if (!canEditSection(caller, 'agenda')) throw new Error('Permission agenda requise.');
  const eventId = text(payload.eventId);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new Error('Événement invalide.');

  const event = await fetchSingle<Record<string, unknown>>('mk_agenda_events', {
    select: 'id,title,description,location,type,status,starts_at,ends_at,organizer_name,organizer_grade',
    id: `eq.${eventId}`,
    limit: '1',
  });
  if (!event) throw new Error('Événement introuvable.');

  const organizerName = text(event.organizer_name, 'Organisateur inconnu');
  const organizerGrade = text(event.organizer_grade);
  const organizer = organizerGrade && organizerGrade !== '—'
    ? `${organizerName} (${organizerGrade})`
    : organizerName;

  const lines = [
    '<:aube:1516926588359540856> **Nouvel événement ajouté à l’agenda**',
    '-# *Un nouveau rendez-vous vient d’être inscrit au programme de la Garde.*',
    `> **Titre :** ${text(event.title, 'Sans titre')}`,
    `> **Type :** ${text(event.type, 'Événement')} · **Statut :** ${text(event.status, 'Prévu')}`,
    `> **Début :** ${discordDate(event.starts_at)}`,
    `> **Fin :** ${discordDate(event.ends_at)}`,
    `> **Lieu :** ${text(event.location, 'Non renseigné')}`,
    `> **Organisateur :** ${organizer}`,
  ];
  const description = truncate(event.description, 450);
  if (description) lines.push(`\n${description}`);
  lines.push('\nConsultez l’agenda du grimoire pour les détails et les changements éventuels.');
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée.' }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Configuration serveur incomplète.' }, 500);
  }

  try {
    const caller = await requireCaller(req);
    const body = await req.json();
    const action = text(body.action);
    const payload = (body.payload || {}) as Record<string, unknown>;
    const webhook = webhookFor(action);
    if (!webhook) return json({ ok: true, skipped: true });

    let content = '';
    if (action.startsWith('presence_')) content = await buildPresenceMessage(action, payload, caller);
    else if (action.startsWith('renseignement_')) content = buildRenseignementMessage(action, payload, caller);
    else if (action === 'agenda_created') content = await buildAgendaMessage(payload, caller);
    else throw new Error('Action inconnue.');

    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`Discord a refusé la notification (${response.status}).`);
    }

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur.';
    const status = message.includes('Session') || message.includes('requis') || message.includes('Permission') ? 403 : 400;
    return json({ error: message }, status);
  }
});
