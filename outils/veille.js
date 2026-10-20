// La borne doit se rendre toute seule. Quatre situations :
//   1. abandon sur une etape  -> bandeau, compte a rebours, retour accueil
//   2. le client repond       -> le bandeau disparait, rien ne se perd
//   3. essayage en cours      -> un visage detecte vaut presence
//   4. attente de paiement    -> aucune remise a zero possible
// Les delais sont raccourcis par l'adresse pour que le banc tienne en une
// minute au lieu de deux minutes et demie.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript',
 '.wasm':'application/wasm','.glb':'model/gltf-binary','.task':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.tflite':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const URL0='http://127.0.0.1:8173/index.html?veille=6000&compte=5';
(async()=>{await new Promise(r=>srv.listen(8173,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const res={}, ec=[];
 const etat=pg=>pg.evaluate(()=>({
   bandeau: document.getElementById('veille').classList.contains('on'),
   accueil: getComputedStyle(document.getElementById('welcome')).display!=='none',
   ordonnance: document.getElementById('pageOrdonnance').classList.contains('on'),
   nom: (document.getElementById('clientNom')||{}).value || '' }));
 const ouvrir=async()=>{const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
   const pg=await ctx.newPage(); await pg.goto(URL0);
   await pg.waitForSelector('#startBtn'); await pg.click('#startBtn'); await pause(11000);
   return {ctx,pg};};

 // 1. abandon sur l'ecran ordonnance : le visage ne doit plus retenir la borne
 {const {ctx,pg}=await ouvrir();
  await pg.click('#confirmBtn'); await pause(500);
  await pg.evaluate(()=>{const n=document.getElementById('clientNom'); if(n) n.value='Client Test';});
  await pause(8000);  const a=await etat(pg);          // bandeau attendu
  await pause(7000);  const z=await etat(pg);          // remise a zero attendue
  res.abandon={bandeau_apparu:a.bandeau, retour_accueil:z.accueil, nom_efface:z.nom===''};
  if(!a.bandeau) ec.push("abandon : le bandeau n'apparait pas");
  if(!z.accueil) ec.push("abandon : la borne ne revient pas a l'accueil");
  if(z.nom!=='') ec.push('abandon : les donnees du client restent a l\'ecran');
  await ctx.close();}

 // 2. le client repond : tout doit reprendre ou il en etait
 {const {ctx,pg}=await ouvrir();
  await pg.click('#confirmBtn'); await pause(8000);
  const a=await etat(pg);
  await pg.click('#veilleBtn'); await pause(1200);
  const z=await etat(pg);
  res.reponse={bandeau_apparu:a.bandeau, bandeau_parti:!z.bandeau, reste_sur_l_etape:z.ordonnance};
  if(!z.ordonnance) ec.push('reponse : la borne est repartie alors que le client a repondu');
  if(z.bandeau) ec.push('reponse : le bandeau ne disparait pas');
  await ctx.close();}

 // 3. essayage : un visage devant la camera vaut presence
 {const {ctx,pg}=await ouvrir();
  await pause(14000);                                  // bien au-dela du delai
  const z=await etat(pg);
  res.essayage={bandeau:z.bandeau, toujours_en_essayage:!z.accueil};
  if(z.bandeau) ec.push("essayage : la borne reclame alors qu'un visage est devant elle");
  if(z.accueil) ec.push("essayage : la borne est repartie pendant une seance");
  await ctx.close();}

 // 4. attente de paiement : intouchable
 {const {ctx,pg}=await ouvrir();
  await pg.evaluate(()=>{const e=document.getElementById('pagePayWait'); e.style.display='flex';});
  await pause(14000);
  const z=await pg.evaluate(()=>document.getElementById('veille').classList.contains('on'));
  res.attente_paiement={bandeau:z};
  if(z) ec.push('attente de paiement : une remise a zero perdrait une commande payee');
  await ctx.close();}

 console.log(JSON.stringify({...res, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
