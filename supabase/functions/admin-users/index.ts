import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SECTION_KEYS = [
  'citoyens',
  'biblio',
  'garde',
  'commerces',
  'diplomatie',
  'cour',
  'inventaire',
  'lois',
  'renseignements',
];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const AUTH_EMAIL_DOMAIN = Deno.env.get('AUTH_EMAIL_DOMAIN') || 'grimoire.invalid';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function badRequest(message: string) {
  return json({ error: message }, 400);
}

function normalizeUsername(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function usernameToEmail(username: string) {
  return `${username}@${AUTH_EMAIL_DOMAIN}`;
}

function assertUsername(username: string) {
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    throw new Error('Identifiant invalide.');
  }
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  const set = new Set<string>();
  value.forEach((item) => {
    const section = String(item || '').trim();
    if (SECTION_KEYS.includes(section)) set.add(section);
  });
  return [...set];
}

function normalizeGarde(value: Record<string, unknown> | null) {
  const garde = value || {};
  const prenom = String(garde.prenom || '').trim();
  if (!prenom) throw new Error('Prénom du garde requis.');

  return {
    id: String(garde.id || '').trim() || null,
    prenom,
    nom: String(garde.nom || '').trim(),
    race: String(garde.race || '').trim() || null,
    grade: String(garde.grade || '').trim() || null,
    specialite: String(garde.specialite || '').trim() || 'Soldat',
    date_recrutement: String(garde.date_recrutement || '').trim() || null,
    recruteur: String(garde.recruteur || '').trim() || null,
  };
}

async function requireSuperadmin(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Session manquante.');

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Session invalide.');

  const { data: profile, error: profileError } = await admin
    .from('mk_profiles')
    .select('is_superadmin')
    .eq('user_id', userData.user.id)
    .single();

  if (profileError || profile?.is_superadmin !== true) {
    throw new Error('Accès superadmin requis.');
  }

  return userData.user;
}

async function createAccount(payload: Record<string, unknown>) {
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || '');
  const displayName = String(payload.displayName || username).trim() || username;
  const isSuperadmin = payload.isSuperadmin === true;
  const sections = normalizeSections(payload.sections);
  const sectionsEdit = normalizeSections(payload.sectionsEdit).filter((section) =>
    sections.includes(section)
  );
  const garde = normalizeGarde((payload.garde || null) as Record<string, unknown> | null);

  assertUsername(username);
  if (password.length < 6) throw new Error('Mot de passe trop court.');

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName,
    },
  });

  if (createError || !created.user) throw createError || new Error('Compte non créé.');

  try {
    const { error: profileError } = await admin.from('mk_profiles').insert({
      user_id: created.user.id,
      username,
      display_name: displayName,
      is_superadmin: isSuperadmin,
      sections,
      sections_edit: sectionsEdit,
    });
    if (profileError) throw profileError;

    if (garde.id) {
      const { error: gardeError } = await admin
        .from('mk_gardes')
        .update({
          user_id: created.user.id,
          prenom: garde.prenom,
          nom: garde.nom,
          race: garde.race,
          grade: garde.grade,
          specialite: garde.specialite,
          date_recrutement: garde.date_recrutement,
          recruteur: garde.recruteur,
        })
        .eq('id', garde.id);
      if (gardeError) throw gardeError;
    } else {
      const { error: gardeError } = await admin.from('mk_gardes').insert({
        user_id: created.user.id,
        prenom: garde.prenom,
        nom: garde.nom,
        race: garde.race,
        grade: garde.grade,
        specialite: garde.specialite,
        date_recrutement: garde.date_recrutement,
        recruteur: garde.recruteur,
      });
      if (gardeError) throw gardeError;
    }

    return {
      user_id: created.user.id,
      username,
    };
  } catch (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw error;
  }
}

async function deleteAccount(payload: Record<string, unknown>, callerUserId: string) {
  const userId = String(payload.userId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Identifiant utilisateur invalide.');
  if (userId === callerUserId) throw new Error('Impossible de supprimer ton propre compte.');

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;

  await admin.from('mk_profiles').delete().eq('user_id', userId);
  await admin.from('mk_gardes').delete().eq('user_id', userId);

  return { user_id: userId };
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
    const caller = await requireSuperadmin(req);
    const payload = await req.json();
    const action = String(payload.action || '');

    if (action === 'createAccount') {
      const result = await createAccount(payload);
      return json({ ok: true, result });
    }

    if (action === 'deleteAccount') {
      const result = await deleteAccount(payload, caller.id);
      return json({ ok: true, result });
    }

    return badRequest('Action inconnue.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur.';
    const status = message.includes('requis') || message.includes('Session') ? 403 : 400;
    return json({ error: message }, status);
  }
});
