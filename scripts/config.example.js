window.GrimoireConfig = Object.freeze({
  supabaseUrl: 'https://PROJECT_REF.supabase.co',
  supabaseKey: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authEmailDomain: 'grimoire.invalid',
  sections: Object.freeze([
    'citoyens',
    'biblio',
    'garde',
    'commerces',
    'diplomatie',
    'cour',
    'inventaire',
    'lois',
    'presences',
    'patrouilles',
    'missives',
    'renseignements',
  ]),
  features: Object.freeze({
    missives: false,
  }),
});
