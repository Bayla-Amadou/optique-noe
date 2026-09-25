/**
 * N.O.A — Borne sur iPad (route Safari)
 *
 *   npm run ipad
 *
 * Sert le dossier du projet en HTTPS sur le réseau local, pour que l'iPad
 * puisse ouvrir la borne dans Safari.
 *
 * Pourquoi du HTTPS pour une page servie à la maison : sur iOS, l'accès à la
 * caméra est réservé aux pages dites « sécurisées ». L'exception accordée à
 * localhost ne vaut QUE sur la machine elle-même, jamais pour une adresse
 * réseau. Sans certificat, Safari n'affiche même pas la demande
 * d'autorisation : la caméra reste noire, sans message, et on cherche
 * longtemps pourquoi.
 *
 * Le certificat est fabriqué ici, valable 825 jours — au-delà, iOS refuse,
 * et ce n'est pas négociable. Il porte l'adresse locale du Mac dans son
 * champ « autres noms », faute de quoi iOS le rejette même une fois
 * installé. Si l'adresse du Mac change (autre réseau, autre box), le script
 * s'en aperçoit et en refabrique un.
 *
 * Aucune dépendance : ce script n'utilise que ce que Node apporte déjà. Une
 * borne qui doit fonctionner hors ligne n'a pas à télécharger un serveur
 * web au moment où on en a besoin.
 */

import { createServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CERTS  = join(RACINE, 'certs');
const PORT   = 8443;

// ── Adresse du Mac sur le réseau local ────────────────────────────
function adresseLocale(){
  const familles = Object.values(networkInterfaces()).flat();
  // On écarte la boucle locale et les adresses auto-attribuées (169.254.x),
  // qui signalent un réseau non joint plutôt qu'une vraie adresse.
  const bonnes = familles.filter(i => i && i.family === 'IPv4' && !i.internal
                                   && !i.address.startsWith('169.254.'));
  if (!bonnes.length) return null;
  // Les réseaux domestiques et de bureau sont en adressage privé : on les
  // préfère à une éventuelle adresse publique.
  const privee = bonnes.find(i => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address));
  return (privee || bonnes[0]).address;
}

// ── Certificat, fabriqué une fois et refait si l'adresse change ────
function certificat(ip){
  mkdirSync(CERTS, { recursive: true });
  const cle    = join(CERTS, 'cle.pem');
  const cert   = join(CERTS, 'cert.crt');
  const memo   = join(CERTS, 'adresse.txt');
  const connue = existsSync(memo) ? readFileSync(memo, 'utf8').trim() : null;

  if (existsSync(cle) && existsSync(cert) && connue === ip){
    return { cle, cert, neuf: false };
  }
  if (connue && connue !== ip){
    console.log(`\n  L'adresse du Mac a changé (${connue} → ${ip}).`);
    console.log('  Nouveau certificat : il faudra le réinstaller sur l\'iPad.');
  }
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
      '-keyout', cle, '-out', cert,
      '-subj', '/CN=N.O.A borne',
      '-addext', `subjectAltName=IP:${ip}`,
    ], { stdio: 'pipe' });
  } catch (e){
    console.error('\n  Échec de la fabrication du certificat.');
    console.error('  ' + String(e.stderr || e.message).trim().split('\n').pop());
    process.exit(1);
  }
  writeFileSync(memo, ip);
  return { cle, cert, neuf: true };
}

// ── Types de fichiers ─────────────────────────────────────────────
// Deux entrées comptent vraiment. Sans application/wasm, Safari refuse de
// compiler le moteur de MediaPipe à la volée et le suivi du visage ne
// démarre pas. Sans model/gltf-binary, les montures ne se chargent pas.
const TYPES = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json', '.wasm':'application/wasm',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json',
  '.task':'application/octet-stream', '.tflite':'application/octet-stream',
  '.bin':'application/octet-stream',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf',
};

const INTERDITS = [
  join(RACINE, 'certs'),                  // clé privée du certificat
  join(RACINE, 'paiement.config.json'),   // clé partagée avec le serveur
  join(RACINE, '.git'),                   // tout l'historique du projet
  join(RACINE, '.env'),
].map(p => resolve(p));

const ip = adresseLocale();
if (!ip){
  console.error('\n  Aucune adresse réseau trouvée. Le Mac est-il bien');
  console.error('  connecté au Wi-Fi ?\n');
  process.exit(1);
}
const { cle, cert, neuf } = certificat(ip);

const serveur = createServer(
  { key: readFileSync(cle), cert: readFileSync(cert) },
  async (req, rep) => {
    let chemin;
    try { chemin = decodeURIComponent(new URL(req.url, 'https://x').pathname); }
    catch { rep.writeHead(400); return rep.end(); }
    if (chemin === '/') chemin = '/index.html';
    const fichier = resolve(join(RACINE, chemin));
    // Un chemin qui remonte hors du projet est refusé : la clé privée est
    // dans ce dossier, elle n'a rien à faire sur le réseau.
    if (fichier !== RACINE && !fichier.startsWith(RACINE + sep)){
      rep.writeHead(403); return rep.end();
    }
    // Le dossier du projet contient des choses qui n'ont rien à faire sur
    // un réseau local, fût-il celui de la boutique : la clé privée du
    // certificat, la clé partagée avec le serveur de paiement, et tout
    // l'historique du code. Un serveur de fichiers sert ce qu'on lui donne ;
    // c'est à nous de lui retirer ce qu'il ne doit pas voir.
    if (INTERDITS.some(d => fichier === d || fichier.startsWith(d + sep))){
      rep.writeHead(403); return rep.end();
    }
    try {
      const info = await stat(fichier);
      if (!info.isFile()){ rep.writeHead(404); return rep.end(); }
      const corps = await readFile(fichier);
      rep.writeHead(200, {
        'Content-Type': TYPES[extname(fichier).toLowerCase()] || 'application/octet-stream',
        'Content-Length': corps.length,
        'Cache-Control': 'no-store',
      });
      rep.end(corps);
    } catch {
      rep.writeHead(404); rep.end();
    }
  });

serveur.listen(PORT, '0.0.0.0', () => {
  const url = `https://${ip}:${PORT}`;
  const t = (s) => console.log('  ' + s);
  console.log('');
  t('╭───────────────────────────────────────────────────────────╮');
  t('│  N.O.A — borne sur iPad                                   │');
  t('╰───────────────────────────────────────────────────────────╯');
  console.log('');
  t(`Adresse à ouvrir sur l'iPad :  ${url}`);
  console.log('');
  if (neuf){
    t('PREMIÈRE FOIS — le certificat vient d\'être fabriqué.');
    t('Envoie ce fichier sur l\'iPad par AirDrop :');
    t('  ' + cert);
    console.log('');
    t('Puis sur l\'iPad, DANS CET ORDRE :');
    t('  1. Réglages → Profil téléchargé → Installer');
    t('  2. Réglages → Général → Informations → tout en bas,');
    t('     « Réglages de confiance des certificats » → activer N.O.A');
    console.log('');
    t('La deuxième étape est celle que tout le monde oublie.');
    t('Sans elle, Safari refuse quand même et la caméra reste noire.');
    console.log('');
  }
  t('Ensuite, dans Safari : ouvre l\'adresse, puis Partager →');
  t('« Sur l\'écran d\'accueil ». L\'application s\'ouvre alors en plein');
  t('écran, sans barre Safari, au format portrait de la borne.');
  console.log('');
  t('Pour verrouiller l\'iPad sur la borne : Réglages → Accessibilité');
  t('→ Accès guidé. Triple-clic sur le bouton latéral une fois dans');
  t('l\'application. Plus personne n\'en sort sans ton code.');
  console.log('');
  t('Le Mac et l\'iPad doivent être sur le même Wi-Fi.');
  t('Ctrl+C pour arrêter.');
  console.log('');
});

serveur.on('error', (e) => {
  if (e.code === 'EADDRINUSE'){
    console.error(`\n  Le port ${PORT} est déjà pris. Un autre lancement tourne`);
    console.error('  peut-être déjà dans un autre onglet du Terminal.\n');
  } else {
    console.error('\n  ' + e.message + '\n');
  }
  process.exit(1);
});
