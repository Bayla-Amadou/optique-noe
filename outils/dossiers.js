// La file de transmission des dossiers, eprouvee sans Electron ni borne.
// Ce qui compte : un dossier ne se perd JAMAIS, meme si le reseau tombe au
// mauvais moment, et les photos du client quittent la borne des que le
// serveur les a.
const fs=require('fs'), path=require('path'), os=require('os'), http=require('http');
const ROOT='/home/user/optique-noe';

// Electron n'existe pas ici : on lui substitue le strict necessaire.
let tmp=fs.mkdtempSync(path.join(os.tmpdir(),'noa-'));
const idElectron=require.resolve('electron',{paths:[ROOT]});
require.cache[idElectron]={ id:idElectron, filename:idElectron, loaded:true,
  exports:{ app:{ getPath:()=>tmp } } };
const Module=require('module'); const vrai=Module._resolveFilename;
Module._resolveFilename=function(r,...a){
  if(r==='electron') return idElectron;
  return vrai.call(this,r,...a); };

const cfg=path.join(ROOT,'serveur.config.json');
const cfgExistait=fs.existsSync(cfg);
const sauvegarde=cfgExistait?fs.readFileSync(cfg):null;

let recus=[], reponse=200;
const srv=http.createServer((q,s)=>{
  let b=''; q.on('data',d=>b+=d);
  q.on('end',()=>{
    if(q.headers['x-noa-cle']!=='cle-de-test'){ s.writeHead(401); return s.end(); }
    if(reponse!==200){ s.writeHead(reponse); return s.end('refus'); }
    recus.push(JSON.parse(b)); s.writeHead(200,{'Content-Type':'application/json'}); s.end('{}');
  });
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 await new Promise(r=>srv.listen(8177,r));
 fs.writeFileSync(cfg, JSON.stringify({url:'http://127.0.0.1:8177',cle:'cle-de-test',boutique:'banc'}));
 const dossier=require(path.join(ROOT,'dossier.js'));

 // deux fausses photos, comme celles qu'ecrit la borne
 const photos=()=>{
   const d=path.join(tmp,'p'+Math.random().toString(36).slice(2)); fs.mkdirSync(d);
   const a=path.join(d,'ord.jpg'), b=path.join(d,'essai.jpg');
   fs.writeFileSync(a,'ORDONNANCE'); fs.writeFileSync(b,'PORTRAIT');
   return {ordonnance:a, essai:b};
 };
 const res={}, ec=[];

 // 1. RESEAU COUPE — rien ne doit se perdre, les photos restent
 srv.close();
 const f1=photos();
 dossier.enfiler({id:'D1', nom:'Test Un', tel:'770000001', pd_mm:63.5}, f1);
 await dossier.vider(); await pause(300);
 res.reseau_coupe={ en_attente:dossier.etat().en_attente,
                    photos_conservees: fs.existsSync(f1.ordonnance) && fs.existsSync(f1.essai) };
 if(dossier.etat().en_attente<1) ec.push('reseau coupe : le dossier a disparu de la file');
 if(!res.reseau_coupe.photos_conservees) ec.push('reseau coupe : les photos ont ete effacees avant transmission');

 // 2. LE RESEAU REVIENT — le dossier part, les photos quittent la borne
 await new Promise(r=>srv.listen(8177,r));
 await dossier.vider(); await pause(400);
 const d1=recus.find(x=>x.id==='D1');
 res.reseau_revenu={ recu: !!d1,
   photos_jointes: d1 ? Object.keys(d1.photos||{}).sort().join(',') : '',
   ordonnance_lisible: d1 ? Buffer.from(d1.photos.ordonnance,'base64').toString()==='ORDONNANCE' : false,
   boutique: d1 ? d1.boutique : null,
   photos_effacees_de_la_borne: !fs.existsSync(f1.ordonnance) && !fs.existsSync(f1.essai),
   en_attente: dossier.etat().en_attente };
 if(!d1) ec.push("le dossier n'est jamais arrive");
 if(d1 && !res.reseau_revenu.ordonnance_lisible) ec.push('la photo est arrivee abimee');
 if(!res.reseau_revenu.photos_effacees_de_la_borne) ec.push('les photos restent sur la borne apres transmission');
 if(dossier.etat().en_attente!==0) ec.push('la file ne se vide pas');

 // 3. DOSSIER REFUSE — il ne doit pas bloquer les suivants
 reponse=400;
 const f2=photos(); dossier.enfiler({id:'D2', nom:'Refuse'}, f2);
 await dossier.vider(); await pause(300);
 reponse=200;
 const f3=photos(); dossier.enfiler({id:'D3', nom:'Suivant'}, f3);
 await dossier.vider(); await pause(400);
 res.dossier_refuse={ refuses:dossier.etat().refuse,
                      suivant_passe: recus.some(x=>x.id==='D3'),
                      en_attente:dossier.etat().en_attente };
 if(dossier.etat().refuse!==1) ec.push('un refus du serveur devrait etre marque comme tel');
 if(!recus.some(x=>x.id==='D3')) ec.push('un dossier refuse bloque toute la file derriere lui');

 // 4. SANS CONFIGURATION — la borne accumule au lieu de perdre
 fs.unlinkSync(cfg);
 await pause(1200);            // laisser retomber les minuteurs de la 1re instance
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'noa2-'));   // base isolee
 delete require.cache[require.resolve(path.join(ROOT,'dossier.js'))];
 delete require.cache[require.resolve(path.join(ROOT,'database.js'))];
 const d2=require(path.join(ROOT,'dossier.js'));
 const f4=photos(); d2.enfiler({id:'D4', nom:'Sans serveur'}, f4);
 await d2.vider(); await pause(200);
 res.sans_configuration={ configure:d2.etat().configure, en_attente:d2.etat().en_attente,
                          photos_conservees: fs.existsSync(f4.ordonnance) };
 if(d2.etat().configure) ec.push('la borne se croit configuree sans fichier');
 if(d2.etat().en_attente<1) ec.push('sans serveur, le dossier est perdu au lieu d\'attendre');

 if(cfgExistait) fs.writeFileSync(cfg,sauvegarde);
 console.log(JSON.stringify({...res, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 srv.close(); process.exit(ec.length?1:0);
})().catch(e=>{ if(cfgExistait) fs.writeFileSync(cfg,sauvegarde);
  console.error('FATAL',e.message); process.exit(1); });
