// Page « Paiement effectué » : la référence du paiement part avec le dossier, la voix dit merci, le suivi du SMS s'affiche.
// La borne (Electron) est simulée par un faux window.noa ; le vrai envoi du SMS est testé côté serveur (serveur/banc-sms.js).
//   NODE_PATH=... node outils/confirmation-sms.js visage.y4m dossier-captures
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT=path.join(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary',
 '.task':'application/octet-stream','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp',
 '.woff2':'font/woff2','.css':'text/css','.mp3':'audio/mpeg','.tflite':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await new Promise(r=>srv.listen(8185,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
 const pg=await ctx.newPage(); const erreurs=[]; pg.on('pageerror',e=>erreurs.push(e.message));
 await pg.addInitScript(()=>{
   window.__dossiers=[]; let n=0;
   window.noa={ saveOrder:async()=>({ok:true,fichiers:{}}), dossierFile:async d=>{window.__dossiers.push(d);return {ok:true};},
     dossierSms:async()=>({ok:true,etat:['inconnu','en_cours','envoye'][Math.min(n++,2)]}),
     paymentConfig:async()=>({configure:false}), isDev:async()=>false, dossierEtat:async()=>({ok:true}), getOrders:async()=>({ok:true,orders:[]}) };
 });
 const HOOK=`window.__t={ref:v=>{_paySessionId=v;}, confirmer:m=>confirmPaiement(m), flow:p=>showFlow(p)};`;
 await pg.route('**/index.html',async r=>{const rep=await r.fetch();let t=await rep.text();const i=t.lastIndexOf('</script>');
   await r.fulfill({body:t.slice(0,i)+HOOK+t.slice(i),headers:{'content-type':'text/html; charset=utf-8'}});});
 await pg.goto('http://127.0.0.1:8185/index.html'); await pg.waitForSelector('#startBtn');
 const ec=[];
 await pg.evaluate(()=>window.__t.flow('pagePaiement')); await pause(500);
 await pg.fill('#clientNom','Awa Diop'); await pg.fill('#clientTel','77 123 45 67');
 await pg.evaluate(()=>{document.getElementById('clientConsent').checked=true; document.querySelector('#choixVision button[data-v="loin"]').click(); document.querySelector('#choixTraitement [data-v="bluecut"]').click(); window.__t.ref('WAVE-REF-TEST-1'); window.__t.confirmer('Wave');});
 await pause(1500);
 const s1=await pg.evaluate(()=>({page:document.getElementById('pageConfirmation').classList.contains('on'),
   titre:document.querySelector('#pageConfirmation .flow-title').textContent, sms:document.getElementById('confSms').textContent, smsVisible:!document.getElementById('confSms').hidden,
   etape:NOAVoix.etat().etape, dossier:(window.__dossiers[0]||{}).dossier||null}));
 if(!s1.page) ec.push('la page de confirmation n\'est pas affichee');
 if(!/Paiement effectué/.test(s1.titre)) ec.push('titre : '+s1.titre);
 if(s1.etape!=='merci') ec.push('la voix « merci » n\'est pas declenchee ('+s1.etape+')');
 if(!s1.dossier||s1.dossier.paiementRef!=='WAVE-REF-TEST-1') ec.push('la reference du paiement ne part pas avec le dossier : '+JSON.stringify(s1.dossier&&s1.dossier.paiementRef));
 if(!s1.smsVisible||!/Envoi du SMS/.test(s1.sms)) ec.push('le suivi du SMS ne s\'affiche pas : '+s1.sms);
 await pause(5000);
 const s2=await pg.evaluate(()=>document.getElementById('confSms').textContent);
 if(!/SMS de confirmation envoyé au 77 123 45 67/.test(s2)) ec.push('le SMS envoye n\'est pas confirme a l\'ecran : '+s2);
 await pg.screenshot({path:process.argv[3]+'/confirmation.png'});
 if(erreurs.length) ec.push('erreurs de page : '+erreurs.slice(0,3).join(' | '));
 console.log(JSON.stringify({s1:{...s1,dossier:undefined},s2,resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
