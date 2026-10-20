// Le choix des verres (lumière bleue ou photochromique) est OBLIGATOIRE à la dernière étape (paiement) :
// rien à la 1re étape ; sans choix on ne paie pas ; avec un choix la vitrine s'anime.
//   NODE_PATH=... node outils/verres-paiement.js visage.y4m dossier-captures
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
(async()=>{await new Promise(r=>srv.listen(8176,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
 const pg=await ctx.newPage(); const erreurs=[]; pg.on('pageerror',e=>erreurs.push(e.message));
 await pg.goto('http://127.0.0.1:8176/index.html');
 await pg.waitForSelector('#startBtn'); await pg.evaluate(()=>document.getElementById('startBtn').click()); await pause(11000);
 const ec=[];
 const etape1=await pg.evaluate(()=>({vitrineIci:!!document.querySelector('#app #vitrine, #app #choixTraitement'),
   chips:[...document.querySelectorAll('#frameFilters .filter-chip')].map(c=>c.textContent)}));
 if(etape1.vitrineIci) ec.push('le choix des verres est encore a la 1re etape');
 // 1re etape -> ordonnance -> paiement
 await pg.click('#confirmBtn'); await pause(2500);
 await pg.click('#btnCapture'); await pause(8000);
 await pg.click('#btnOrdNext'); await pause(1500);
 const surPaiement=await pg.evaluate(()=>document.getElementById('pagePaiement').classList.contains('on'));
 if(!surPaiement) ec.push('on n\'arrive pas a la page de paiement');
 const avant=await pg.evaluate(()=>({t:document.getElementById('vitrine').dataset.t,
   nom:document.getElementById('vitrineNom').textContent,
   cartes:[...document.querySelectorAll('#choixTraitement button')].map(x=>x.querySelector('b').textContent+(x.classList.contains('on')?' [choisi]':''))}));
 if(avant.t!=='aucun') ec.push('un traitement est preselectionne ('+avant.t+')');
 if(avant.cartes.length!==2) ec.push('il doit y avoir exactement deux choix : '+avant.cartes.join(' / '));
 // sans choix de verre : on ne paie pas
 await pg.fill('#clientNom','Test Client'); await pg.fill('#clientTel','+221770000000');
 await pg.evaluate(()=>{document.getElementById('clientConsent').checked=true;document.querySelector('#choixVision button[data-v="loin"]').click();
   document.getElementById('btnWave').click();});
 await pause(1200);
 const sans=await pg.evaluate(()=>({manquant:document.getElementById('verresSection').classList.contains('manquant'),
   attente:document.getElementById('pagePayWait').className, paiement:document.getElementById('pagePaiement').classList.contains('on')}));
 if(!sans.manquant||!sans.paiement) ec.push('sans choix de verres, le paiement n\'est pas bloque ('+JSON.stringify(sans)+')');
 await pg.screenshot({path:process.argv[3]+'/pay-sans-choix.png'});
 const etat=()=>pg.evaluate(()=>({t:document.getElementById('vitrine').dataset.t,nom:document.getElementById('vitrineNom').textContent,
   cadre:document.getElementById('vitrineCadre').classList.contains('pret'),
   masque:(document.getElementById('vitrineVerres').style.maskImage||document.getElementById('vitrineVerres').style.webkitMaskImage||'').length>20,
   anim:getComputedStyle(document.getElementById('vitrineVerres')).animationName,
   manquant:document.getElementById('verresSection').classList.contains('manquant')}));
 const attendre=()=>pg.waitForFunction(()=>document.getElementById('vitrineCadre').classList.contains('pret'),null,{timeout:25000}).catch(()=>{});
 await pg.evaluate(()=>document.querySelector('#choixTraitement button[data-v="bluecut"]').click()); await attendre(); await pause(500);
 const bleu=await etat(); await pg.screenshot({path:process.argv[3]+'/pay-bleu.png'});
 if(bleu.t!=='bluecut'||bleu.anim!=='reflet'||!bleu.cadre||!bleu.masque||bleu.manquant) ec.push('vitrine lumiere bleue incorrecte '+JSON.stringify(bleu));
 await pg.evaluate(()=>document.querySelector('#choixTraitement button[data-v="photogray"]').click()); await pause(1500);
 const photo=await etat(); await pg.screenshot({path:process.argv[3]+'/pay-photochromique.png'});
 if(photo.t!=='photogray'||photo.anim!=='verreFonce') ec.push('vitrine photochromique incorrecte '+JSON.stringify(photo));
 // avec un choix : le paiement demarre
 await pg.evaluate(()=>document.getElementById('btnWave').click()); await pause(1200);
 const apres=await pg.evaluate(()=>({manquant:document.getElementById('verresSection').classList.contains('manquant')}));
 if(apres.manquant) ec.push('le choix fait, la section reste signalee');
 if(erreurs.length) ec.push('erreurs de page : '+erreurs.slice(0,3).join(' | '));
 console.log(JSON.stringify({etape1,avant,sans,bleu,photo,resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
