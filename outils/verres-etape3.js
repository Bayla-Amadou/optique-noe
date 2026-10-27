// Le choix des verres (blancs ou photochromiques) est OBLIGATOIRE à l'etape 3, avec le type de vision et les
// coordonnees ; le consentement est tout en bas. Sans tout cela, on n'atteint pas l'etape 4 (le paiement).
//   NODE_PATH=... node outils/verres-etape3.js ordonnance-nette.y4m dossier-captures   (une feuille nette devant la camera)
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
 const etape1=await pg.evaluate(()=>({vitrineIci:!!document.querySelector('#app #choixTraitement, #app #choixVision'),
   chips:[...document.querySelectorAll('#frameFilters .filter-chip')].map(c=>c.textContent),
   cartes:[...document.querySelectorAll('.g-tile')].map(t=>({nom:t.querySelector('.g-name').textContent}))}));
 await pg.screenshot({path:process.argv[3]+'/catalogue.png'});
 if(etape1.vitrineIci) ec.push('le choix des verres est encore a la 1re etape');
 if(!etape1.cartes.length||etape1.cartes.some(c=>!c.nom||c.nom.length<2)) ec.push('une carte du catalogue est sans nom '+JSON.stringify(etape1.cartes));
 // 1re etape -> ordonnance -> paiement
 await pg.click('#confirmBtn'); await pause(2500);
 await pg.evaluate(()=>document.getElementById('btnCapture').click()); await pg.waitForFunction(()=>!document.getElementById('btnOrdNext').disabled,null,{timeout:40000}).catch(()=>{});   // la feuille nette declenche aussi la prise automatique
 await pg.click('#btnOrdNext'); await pause(1500);
 const surPaiement=await pg.evaluate(()=>document.getElementById('pageVerres').classList.contains('on'));
 if(!surPaiement) ec.push('on n\'arrive pas a la page de paiement');
 const cat=await pg.evaluate(()=>0);   // (catalogue verifie a l'etape 1, plus haut)
 const avant=await pg.evaluate(()=>({
   vitrine:!!document.getElementById('vitrine'),
   cartes:[...document.querySelectorAll('#choixTraitement .verre-opt')].map(x=>x.querySelector('b').textContent+(x.classList.contains('on')?' [choisi]':'')),
   textes:[...document.querySelectorAll('#choixTraitement .verre-opt-txt')].map(x=>x.textContent.length),
   anims:document.querySelectorAll('#choixTraitement .vopt-anim svg').length}));
 if(avant.vitrine) ec.push('la vitrine animee est encore la');
 if(avant.cartes.length!==2) ec.push('il doit y avoir exactement deux choix : '+avant.cartes.join(' / '));
 if(avant.cartes.some(c=>c.includes('[choisi]'))) ec.push('un traitement est preselectionne');
 if(avant.textes.some(n=>n<25||n>70)) ec.push('une phrase de carte doit rester courte et non vide : '+JSON.stringify(avant.textes));
 if(avant.anims!==2) ec.push('chaque carte de traitement doit porter son dessin animé ('+avant.anims+')');
 // sans choix de verre : on ne paie pas
 await pg.fill('#clientNom','Test Client'); await pg.fill('#clientTel','+221770000000');
 await pg.evaluate(()=>{document.getElementById('clientConsent').checked=true;document.querySelector('#choixVision button[data-v="loin"]').click();
   document.getElementById('btnVerresNext').click();});
 await pause(1200);
 const sans=await pg.evaluate(()=>({manquant:document.getElementById('verresSection').classList.contains('manquant'),
   paiement:document.getElementById('pageVerres').classList.contains('on')}));
 if(!sans.manquant||!sans.paiement) ec.push('sans choix de verres, on passe quand meme a l\'etape 4 ('+JSON.stringify(sans)+')');
 await pg.evaluate(()=>window.scrollTo(0,0));
 await pg.screenshot({path:process.argv[3]+'/pay-sans-choix.png'});
 const etat=()=>pg.evaluate(()=>({
   choisis:[...document.querySelectorAll('#choixTraitement .verre-opt.on')].map(x=>x.dataset.v),
   aria:[...document.querySelectorAll('#choixTraitement .verre-opt')].map(x=>x.getAttribute('aria-checked')),
   manquant:document.getElementById('verresSection').classList.contains('manquant')}));
 await pg.evaluate(()=>document.querySelector('#choixTraitement [data-v="blanc"]').click()); await pause(300);
 const blanc=await etat();
 if(blanc.choisis.join()!=='blanc'||blanc.manquant||blanc.aria.join()!=='true,false') ec.push('choix verres blancs incorrect '+JSON.stringify(blanc));
 await pg.evaluate(()=>document.querySelector('#choixTraitement [data-v="photogray"]').click()); await pause(300);
 const photo=await etat(); await pg.evaluate(()=>window.scrollTo(0,0)); await pg.screenshot({path:process.argv[3]+'/pay-photochromique.png'});
 if(photo.choisis.join()!=='photogray'||photo.aria.join()!=='false,true') ec.push('un seul choix possible : '+JSON.stringify(photo));
 await pg.evaluate(()=>document.getElementById('btnVerresNext').click()); await pause(1200);
 const apres=await etat();
 if(apres.manquant) ec.push('le choix fait, la section reste signalee');
 if(erreurs.length) ec.push('erreurs de page : '+erreurs.slice(0,3).join(' | '));
 console.log(JSON.stringify({etape1,avant,sans,blanc,photo,resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
