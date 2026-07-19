const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SECRET_KEY = getSupabaseSecretKey();
const AGENDA_ROLE_ID = '1517264270063177789';

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

type RensFiche = {
  id: string;
  nom: string | null;
  type: string | null;
  statut: string | null;
  urgente: boolean | null;
  notes: string | null;
  created_at: string | null;
};

type RensReport = {
  id: string;
  fiche_id: string | null;
  titre: string | null;
  fiabilite: string | null;
  contenu: string | null;
  action_recommandee: string | null;
  created_at: string | null;
  created_by_name: string | null;
  created_by_grade: string | null;
};

type RensAttachment = {
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
};

type Caller = {
  userId: string;
  profile: Profile;
  garde: Garde | null;
};

type AuthUser = {
  id: string;
};

type DiscordPayload = {
  content?: string;
  embeds?: Record<string, unknown>[];
  allowed_mentions?: Record<string, unknown>;
  files?: DiscordFile[];
};

type DiscordFile = {
  name: string;
  content: string;
  type: string;
};

function getSupabaseSecretKey() {
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (legacyKey) return legacyKey;

  const rawKeys = Deno.env.get('SUPABASE_SECRET_KEYS') || '';
  if (!rawKeys) return '';

  try {
    const keys = JSON.parse(rawKeys) as Record<string, unknown>;
    const defaultKey = keys.default;
    if (typeof defaultKey === 'string' && defaultKey) return defaultKey;

    const firstKey = Object.values(keys).find((value) => typeof value === 'string' && value);
    return typeof firstKey === 'string' ? firstKey : '';
  } catch (_error) {
    return '';
  }
}

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

function fileSafeName(value: unknown, fallback = 'rapport') {
  return text(value, fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
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
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
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

async function fetchMany<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const response = await fetch(restUrl(table, params), {
    headers: serviceHeaders({ Accept: 'application/json' }),
  });
  if (!response.ok) {
    throw new Error(`Lecture ${table} refusée (${response.status}).`);
  }
  return await response.json() as T[];
}

async function fetchOptionalMany<T>(table: string, params: Record<string, string>): Promise<T[]> {
  try {
    return await fetchMany<T>(table, params);
  } catch (_error) {
    return [];
  }
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

function discordTimestamp(value: unknown, style = 'F') {
  const raw = text(value);
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function rensCategoryLabel(category: string) {
  const categoryMap: Record<string, string> = {
    lieu: '📍 Lieu',
    lieux: '📍 Lieu',
    individu: '👤 Individu',
    individus: '👤 Individu',
    groupe: '👥 Groupe',
    groupes: '👥 Groupe',
  };
  return categoryMap[category.toLowerCase()] || category || '—';
}

function rensStatusLabel(value: unknown) {
  const status = text(value, 'neutre');
  const statusMap: Record<string, string> = {
    surveillance: 'Surveillance active',
    recherche: 'Recherché',
    neutralise: 'Neutralisé',
    neutre: 'Neutre',
  };
  return statusMap[status] || status;
}

function rensReliabilityLabel(value: unknown) {
  const reliability = text(value, 'nonverif');
  const reliabilityMap: Record<string, string> = {
    confirme: 'Confirmée',
    nonverif: 'Non vérifiée',
    urgente: 'Urgente',
    fausse: 'Invalidée',
  };
  return reliabilityMap[reliability] || reliability;
}

function discordFileSize(bytes: unknown) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} Ko`;
  return `${Math.round(size / 1024 / 102.4) / 10} Mo`;
}

function reportAuthor(report: RensReport, caller: Caller) {
  const name = text(report.created_by_name) || callerName(caller);
  const grade = text(report.created_by_grade) || callerGrade(caller);
  return grade && grade !== '—' ? `${name} (${grade})` : name;
}

function buildRenseignementTextFile(reportTitle: string, fields: Record<string, unknown>[], reportContent: string, reportAction: string) {
  const fieldLines = fields
    .map((field) => `${text(field.name)}\n${text(field.value)}`)
    .join('\n\n');
  return [
    reportTitle,
    ''.padEnd(Math.min(reportTitle.length, 80), '='),
    '',
    fieldLines,
    '',
    'Contenu du rapport',
    '------------------',
    reportContent || 'Aucun contenu renseigné.',
    reportAction ? ['', 'Action recommandée', '-------------------', reportAction].join('\n') : '',
  ].filter(Boolean).join('\n');
}

async function requireCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Session manquante.');

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SECRET_KEY,
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

async function buildRenseignementMessage(action: string, payload: Record<string, unknown>, caller: Caller): Promise<DiscordPayload> {
  if (!hasSection(caller, 'renseignements')) throw new Error('Accès renseignements requis.');
  const isFiche = action === 'renseignement_fiche';
  if (!isFiche && action !== 'renseignement_rapport') throw new Error('Action renseignement inconnue.');

  const detail = truncate(payload.detail, 180);
  const category = text(payload.category || payload.ficheType, '');
  const ficheName = text(payload.ficheName, '');

  const categoryMap: Record<string, string> = {
    'lieu': '📍 Lieu',
    'lieux': '📍 Lieu',
    'individu': '👤 Individu',
    'individus': '👤 Individu',
    'groupe': '👥 Groupe',
    'groupes': '👥 Groupe',
  };
  const categoryLabel = categoryMap[category.toLowerCase()] || category || null;

  if (isFiche) {
    const lines = [
      '<:corbeau:1517815921258008697> **Nouvelle fiche versée aux archives**',
      '',
      detail ? `> ### ${detail}` : '',
      categoryLabel ? `> ${categoryLabel}` : '',
      `> *par ${authorLine(caller)}*`,
      '',
      '-# Consultez les archives et transmettez tout élément complémentaire à votre supérieur.',
    ];
    return { content: lines.filter(l => l !== '').join('\n') };
  }

  const reportId = text(payload.reportId);
  let report: RensReport | null = null;
  let fiche: RensFiche | null = null;
  let attachments: RensAttachment[] = [];
  let linkedFiches: RensFiche[] = [];
  let linkedReports: RensReport[] = [];

  if (/^[0-9a-f-]{36}$/i.test(reportId)) {
    report = await fetchSingle<RensReport>('mk_rens_rapports', {
      select: 'id,fiche_id,titre,fiabilite,contenu,action_recommandee,created_at,created_by_name,created_by_grade',
      id: `eq.${reportId}`,
      limit: '1',
    });

    if (report?.fiche_id) {
      fiche = await fetchSingle<RensFiche>('mk_rens_fiches', {
        select: 'id,nom,type,statut,urgente,notes,created_at',
        id: `eq.${report.fiche_id}`,
        limit: '1',
      });
    }

    attachments = await fetchOptionalMany<RensAttachment>('mk_rens_attachments', {
      select: 'file_name,file_size,mime_type',
      rapport_id: `eq.${reportId}`,
      order: 'created_at.asc',
    });

    const ficheLinks = await fetchOptionalMany<{ fiche_id: string }>('mk_rens_rapport_liens', {
      select: 'fiche_id',
      rapport_id: `eq.${reportId}`,
    });
    const linkedFicheIds = ficheLinks.map((link) => link.fiche_id).filter(Boolean);
    if (linkedFicheIds.length) {
      linkedFiches = await fetchOptionalMany<RensFiche>('mk_rens_fiches', {
        select: 'id,nom,type,statut,urgente,notes,created_at',
        id: `in.(${linkedFicheIds.join(',')})`,
      });
    }

    const reportLinks = await fetchOptionalMany<{ rapport_a: string; rapport_b: string }>('mk_rens_rapport_rapport', {
      select: 'rapport_a,rapport_b',
      or: `(rapport_a.eq.${reportId},rapport_b.eq.${reportId})`,
    });
    const linkedReportIds = reportLinks
      .map((link) => link.rapport_a === reportId ? link.rapport_b : link.rapport_a)
      .filter(Boolean);
    if (linkedReportIds.length) {
      linkedReports = await fetchOptionalMany<RensReport>('mk_rens_rapports', {
        select: 'id,fiche_id,titre,fiabilite,contenu,action_recommandee,created_at,created_by_name,created_by_grade',
        id: `in.(${linkedReportIds.join(',')})`,
      });
    }
  }

  const reportTitle = text(report?.titre) || detail || text(payload.titre) || 'Rapport sans titre';
  const reportReliability = rensReliabilityLabel(report?.fiabilite || payload.fiabilite);
  const payloadContent = text(payload.contenu || payload.content || payload.reportContent || payload.description);
  const reportContent = text(report?.contenu) || payloadContent || 'Aucun contenu renseigné.';
  const reportAction = text(report?.action_recommandee) || text(payload.action_recommandee || payload.action || payload.recommendedAction);
  const reportDate = report?.created_at ? discordTimestamp(report.created_at, 'F') : discordTimestamp(new Date().toISOString(), 'F');
  const ficheTitle = text(fiche?.nom) || ficheName || 'Fiche inconnue';
  const ficheType = rensCategoryLabel(text(fiche?.type || category));
  const ficheStatus = rensStatusLabel(fiche?.statut);
  const urgent = fiche?.urgente ? ' · Urgente' : '';
  const author = report ? reportAuthor(report, caller) : authorLine(caller).replace(/\*/g, '');

  const fields: Record<string, unknown>[] = [
    { name: 'Fiche', value: `${ficheTitle}\n${ficheType} · ${ficheStatus}${urgent}`, inline: true },
    { name: 'Fiabilité', value: reportReliability, inline: true },
    { name: 'Auteur', value: author, inline: true },
    { name: 'Date', value: reportDate, inline: false },
  ];

  if (reportAction) {
    fields.push({ name: 'Action recommandée', value: truncate(reportAction, 700), inline: false });
  }
  if (linkedFiches.length) {
    fields.push({
      name: 'Fiches liées',
      value: truncate(linkedFiches.map((item) => `${text(item.nom, 'Fiche')} (${rensCategoryLabel(text(item.type))})`).join('\n'), 700),
      inline: false,
    });
  }
  if (linkedReports.length) {
    fields.push({
      name: 'Rapports liés',
      value: truncate(linkedReports.map((item) => `${text(item.titre, 'Rapport sans titre')} · ${discordDate(item.created_at)}`).join('\n'), 700),
      inline: false,
    });
  }
  if (attachments.length) {
    fields.push({
      name: 'Pièces jointes',
      value: truncate(attachments.map((att) => `${text(att.file_name, 'Image')} (${discordFileSize(att.file_size)})`).join('\n'), 700),
      inline: false,
    });
  }

  const files: DiscordFile[] = [];
  const shouldAttachFullReport = reportContent.length > 2500 || reportAction.length > 700;
  if (shouldAttachFullReport) {
    files.push({
      name: `${fileSafeName(reportTitle)}.txt`,
      content: buildRenseignementTextFile(reportTitle, fields, reportContent, reportAction),
      type: 'text/plain;charset=utf-8',
    });
    fields.push({
      name: 'Rapport complet',
      value: 'Le contenu complet est joint en fichier texte, car il dépasse la limite confortable d’un message Discord.',
      inline: false,
    });
  }

  return {
    content: '<:corbeau:1517815921258008697> **Nouveau rapport déposé**',
    embeds: [{
      title: truncate(reportTitle, 240),
      description: truncate(reportContent, 2500),
      color: report?.fiabilite === 'urgente' ? 0x8a1010 : 0xb5922e,
      fields,
      footer: { text: 'Consultez le grimoire pour les relations, archives et pièces jointes complètes.' },
    }],
    ...(files.length ? { files } : {}),
  };
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

  const title = text(event.title, 'Sans titre');
  const eventType = text(event.type, 'Événement');
  const status = text(event.status, 'Prévu');
  const location = text(event.location, 'Non renseigné');
  const description = truncate(event.description, 400);

  const lines = [
    `<@&${AGENDA_ROLE_ID}>`,
    '',
    '<:aube:1516926588359540856> **Nouvel événement ajouté à l\u2019agenda**',
    '',
    `> ### ${title}`,
    `> 📌 ${location}`,
    `> 📅 ${discordTimestamp(event.starts_at, 'F')}`,
    `> 🏁 ${discordTimestamp(event.ends_at, 't')}`,
    `> `,
    `> ${eventType} · ${status} · *par ${organizer}*`,
  ];
  if (description) lines.push('', description);
  lines.push('', '-# Consultez l\u2019agenda du grimoire pour les détails et les changements éventuels.');
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée.' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
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
    let discordPayload: DiscordPayload | null = null;
    if (action.startsWith('presence_')) content = await buildPresenceMessage(action, payload, caller);
    else if (action.startsWith('renseignement_')) discordPayload = await buildRenseignementMessage(action, payload, caller);
    else if (action === 'agenda_created') content = await buildAgendaMessage(payload, caller);
    else throw new Error('Action inconnue.');

    if (!discordPayload) discordPayload = { content };
    if (action === 'agenda_created') {
      discordPayload.allowed_mentions = {
        parse: [],
        roles: [AGENDA_ROLE_ID],
      };
    }

    let response: Response;
    if (discordPayload.files?.length) {
      const { files, ...payloadWithoutFiles } = discordPayload;
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payloadWithoutFiles));
      files.forEach((file, index) => {
        form.append(`files[${index}]`, new Blob([file.content], { type: file.type }), file.name);
      });

      response = await fetch(webhook, {
        method: 'POST',
        body: form,
      });
    } else {
      response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
      });
    }

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
