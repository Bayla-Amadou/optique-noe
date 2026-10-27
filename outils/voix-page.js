// L'assistance vocale dans la vraie page : barre visible, consigne dite à chaque étape, réécoute, activation, langue.
// Les enregistrements wolof installes (assets/voix/wo) doivent etre joues a chaque etape ; seule « paiement_echec » n'en a pas encore.
//   NODE_PATH=... node outils/voix-page.js ordonnance-nette.y4m dossier-captures   (une feuille nette devant la camera : voir outils/ordonnance-illisible.js)
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
function wav(){const n=4000,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i/6)*3000),44+i*2);return b;}
(async()=>{await new Promise(r=>srv.listen(8182,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
 const pg=await ctx.newPage(); const erreurs=[]; pg.on('pageerror',e=>erreurs.push(e.message));
 await pg.route('**/assets/voix/wo/essayage.wav',r=>r.fulfill({body:wav(),headers:{'content-type':'audio/wav'}}));
 await pg.goto('http://127.0.0.1:8182/index.html'); await pg.waitForSelector('#startBtn');
 const ec=[]; const E=()=>pg.evaluate(()=>NOAVoix.etat());
 // accueil : barre visible, wolof par defaut, pas de son tout seul
 const barre=await pg.evaluate(()=>{const b=document.getElementById('voixEcouter').getBoundingClientRect();
   return {visible:b.width>40&&b.height>30, texte:document.getElementById('voixEcouter').textContent.trim(),
     langues:[...document.querySelectorAll('#voixBar .voix-langue button')].map(x=>x.textContent+(x.classList.contains('on')?' [actif]':''))};});
 if(!barre.visible) ec.push('le bouton « Écouter les instructions » n\'est pas visible a l\'accueil');
 if(!/Écouter les instructions/.test(barre.texte)) ec.push('texte du bouton : '+barre.texte);
 if(barre.langues[0]!=='Wolof [actif]') ec.push('le wolof n\'est pas la langue par defaut : '+barre.langues.join('/'));
 let e=await E(); if(e.lecture) ec.push('de la voix a l\'accueil sans que personne ait touche l\'ecran');
 await pg.screenshot({path:process.argv[3]+'/voix-accueil.png'});
 // demarrage : la consigne wolof d'essayage joue (fichier present)
 await pg.evaluate(()=>document.getElementById('startBtn').click());
 const fini=()=>pg.waitForFunction(()=>{const e=NOAVoix.etat();return e.dernier===e.etape&&!e.recherche;},null,{timeout:30000}).catch(()=>{});
 await fini();
 e=await E(); if(e.etape!=='essayage'||e.source!=='fichier') ec.push('essayage : consigne wolof non jouee '+JSON.stringify(e));
 await pg.screenshot({path:process.argv[3]+'/voix-essayage.png'});
 // les autres etapes : pas de wolof enregistre -> repli francais, jamais de wolof synthetise
 await pause(9000);
 await pg.click('#confirmBtn'); await fini();
 e=await E(); if(e.etape!=='ordonnance') ec.push('etape ordonnance non declaree '+JSON.stringify(e));
 if(e.source!=='fichier') ec.push('ordonnance : l\'enregistrement wolof installe n\'est pas joue ('+e.source+')');
 // video de test = une ordonnance nette : le scan reussit, la consigne « le scan est reussi » se dit
 await pg.evaluate(()=>document.getElementById('btnCapture').click()); await pg.waitForFunction(()=>!document.getElementById('btnOrdNext').disabled,null,{timeout:40000}).catch(()=>{});   // la feuille nette declenche aussi la prise automatique await fini(); e=await E();
 await fini(); e=await E();
 if(e.etape!=='scan') ec.push('scan reussi : la consigne « scan » n\'est pas declenchee ('+e.etape+')');
 await pg.click('#btnOrdNext'); await fini(); e=await E(); if(e.etape!=='verres') ec.push('etape verres non declaree '+e.etape);
 // etape 4 : le paiement a sa propre consigne
 await pg.evaluate(()=>{document.getElementById('clientNom').value='Test'; document.getElementById('clientTel').value='770000000';
   document.getElementById('clientConsent').checked=true; document.querySelector('#choixVision [data-v="loin"]').click();
   document.querySelector('#choixTraitement [data-v="blanc"]').click(); document.getElementById('btnVerresNext').click();});
 await fini(); e=await E(); if(e.etape!=='paiement') ec.push('etape paiement non declaree '+e.etape);
 // reecoute : le bouton relance la consigne de l'etape, autant de fois que voulu
 await pg.evaluate(()=>window.scrollTo(0,0));
 await pg.screenshot({path:process.argv[3]+'/voix-verres.png'});
 // desactivation : plus de voix automatique, mais le bouton reste utilisable
 await pg.click('#voixSwitch'); e=await E(); if(e.actif) ec.push('la voix n\'est pas desactivee');
 const avant=await pg.evaluate(()=>{NOAVoix.etape('paiement_wave');return NOAVoix.etat();});
 if(avant.lecture) ec.push('la voix parle alors qu\'elle est desactivee');
 await pg.click('#voixEcouter'); await pause(500); e=await E(); if(e.dernier!=='paiement_wave') ec.push('le bouton Écouter ne relance pas la consigne de l\'etape ('+e.dernier+')');
 // langue : francais puis retour wolof
 await pg.click('#voixSwitch'); await pg.click('#voixBar .voix-langue [data-l="fr"]'); e=await E(); if(e.langue!=='fr') ec.push('le choix du francais ne marche pas');
 await pg.click('#voixBar .voix-langue [data-l="wo"]'); e=await E(); if(e.langue!=='wo') ec.push('retour au wolof impossible');
 // nouveau client : langue remise au defaut
 await pg.click('#voixBar .voix-langue [data-l="fr"]'); await pg.evaluate(()=>NOAVoix.raz()); e=await E();
 if(e.langue!=='wo'||e.etape!=='accueil') ec.push('le client suivant herite de la langue du precedent');
 if(erreurs.length) ec.push('erreurs de page : '+erreurs.slice(0,3).join(' | '));
 console.log(JSON.stringify({barre,resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
