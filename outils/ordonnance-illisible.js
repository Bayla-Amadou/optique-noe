// Une ordonnance illisible (floue, sombre, éblouie, vide) doit être refusée avec la raison, la voix « scan_echec »,
// et le client doit recommencer ; une nette doit passer ; au 3e échec la photo est gardée et signalée.
//   NODE_PATH=... node outils/ordonnance-illisible.js dossier-des-y4m dossier-captures
// Le dossier d'entrée contient net.y4m, flou.y4m, sombre.y4m, reflet.y4m, vide.y4m (voir la note ci-dessous).
// Note : ces y4m sont des rendus d'une ordonnance (texte réel, flou / obscurité / reflet appliqués) ; ce n'est pas une
// vraie caméra. À refaire avec la caméra et de vraies feuilles avant de livrer une borne.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT=path.join(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript',
 '.wasm':'application/wasm','.glb':'model/gltf-binary','.task':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.tflite':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const [,, dossier, sortie]=process.argv;
async function scenario(b,nom,essais){
  const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
  const pg=await ctx.newPage(); const erreurs=[]; pg.on('pageerror',e=>erreurs.push(e.message));
  await pg.goto('http://127.0.0.1:8184/index.html'); await pg.waitForSelector('#startBtn');
  await pg.evaluate(()=>document.getElementById('startBtn').click()); await pause(6000);
  await pg.click('#confirmBtn'); await pause(2500);
  const etats=[];
  for(let i=0;i<essais;i++){
    await pg.evaluate(()=>document.getElementById('btnCapture').click()); await pause(5500);
    etats.push(await pg.evaluate(()=>({echec:(document.getElementById('ordEchec').textContent||'').trim(),
      echecVisible:!document.getElementById('ordEchec').classList.contains('cache'),
      suivantInactif:document.getElementById('btnOrdNext').disabled,
      etape:NOAVoix.etat().etape})));
  }
  if(sortie) await pg.screenshot({path:path.join(sortie,'illisible-'+nom+'.png')});
  await ctx.close(); return {etats,erreurs};
}
(async()=>{await new Promise(r=>srv.listen(8184,r)); const ec=[]; const rapport={};
 for(const [nom,essais,attendu] of [['net',1,null],['flou',1,'floue'],['sombre',1,'sombre'],['reflet',1,'reflet'],['vide',1,'vide'],['flou',3,'garde']]){
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
   args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required',
         '--use-file-for-fake-video-capture='+path.join(dossier,nom+'.y4m'),'--enable-unsafe-swiftshader']});
  const {etats,erreurs}=await scenario(b,nom+(essais>1?'-x'+essais:''),essais); await b.close();
  const e=etats[etats.length-1]; rapport[nom+(essais>1?' x'+essais:'')]={dernier:e,erreurs};
  const tag=nom+(essais>1?' x'+essais:'');
  if(attendu===null){ if(e.suivantInactif||e.echecVisible) ec.push(tag+' : une ordonnance nette est refusee '+JSON.stringify(e));
    if(e.etape!=='scan') ec.push(tag+' : la consigne « le scan est reussi » n\'est pas declenchee ('+e.etape+')'); }
  else if(attendu==='garde'){ if(e.suivantInactif||!/conseiller/.test(e.echec)) ec.push(tag+' : au 3e echec la photo doit etre gardee et signalee '+JSON.stringify(e)); }
  else { if(!e.suivantInactif) ec.push(tag+' : une ordonnance '+attendu+' laisse passer le client');
         if(!e.echecVisible||!new RegExp({floue:'floue',sombre:'sombre',reflet:'reflet',vide:'texte'}[attendu],'i').test(e.echec)) ec.push(tag+' : la raison « '+attendu+' » n\'est pas affichee : '+e.echec);
         if(e.etape!=='scan_echec') ec.push(tag+' : la consigne vocale d\'echec n\'est pas declenchee ('+e.etape+')'); }
  if(erreurs.length) ec.push(tag+' : erreurs de page '+erreurs.slice(0,2).join(' | '));
 }
 console.log(JSON.stringify({rapport,resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 srv.close(); process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
