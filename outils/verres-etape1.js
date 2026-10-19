// Le choix des verres (lumière bleue ou photochromique) est OBLIGATOIRE dès la 1re étape :
// sans choix on ne passe pas, avec un choix la vitrine s'anime, et la page de paiement ne le redemande pas.
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
 const pg=await ctx.newPage(); const erreurs=[];
 pg.on('pageerror',e=>erreurs.push(e.message));
 await pg.goto('http://127.0.0.1:8176/index.html');
 await pg.waitForSelector('#startBtn'); await pg.evaluate(()=>document.getElementById('startBtn').click()); await pause(11000);
 const etat=()=>pg.evaluate(()=>({
   app:document.getElementById('app').classList.contains('on'),
   ordonnance:document.getElementById('pageOrdonnance').classList.contains('on'),
   manquant:document.getElementById('traitSection').classList.contains('manquant'),
   t:document.getElementById('vitrine').dataset.t,
   nom:document.getElementById('vitrineNom').textContent,
   cadre:document.getElementById('vitrineCadre').classList.contains('pret'),
   masque:(document.getElementById('vitrineVerres').style.maskImage||document.getElementById('vitrineVerres').style.webkitMaskImage||'').length>20,
   anim:getComputedStyle(document.getElementById('vitrineVerres')).animationName,
   cartes:[...document.querySelectorAll('#choixTraitement button')].map(x=>x.textContent.trim())}));
 const ec=[];
 await pg.click('#confirmBtn'); await pause(600);
 const sans=await etat();
 if(!sans.app||sans.ordonnance) ec.push('on passe a l\'etape suivante sans avoir choisi les verres');
 if(!sans.manquant) ec.push('rien ne signale que le choix des verres manque');
 await pg.screenshot({path:process.argv[3]+'/verres-sans-choix.png'});
 await pg.click('#choixTraitement button[data-v="bluecut"]');
 await pg.waitForFunction(()=>document.getElementById('vitrineCadre').classList.contains('pret'),null,{timeout:20000}).catch(()=>{}); await pause(500);
 const bleu=await etat();
 if(bleu.t!=='bluecut') ec.push('la vitrine ne passe pas en lumiere bleue');
 if(!bleu.cadre||!bleu.masque) ec.push('la vitrine n\'affiche pas la monture et les verres');
 if(bleu.anim!=='reflet') ec.push('pas d\'animation lumiere bleue ('+bleu.anim+')');
 if(bleu.manquant) ec.push('le signalement reste apres le choix');
 await pg.screenshot({path:process.argv[3]+'/verres-bleu.png'});
 await pg.click('#choixTraitement button[data-v="photogray"]'); await pause(1500);
 const photo=await etat();
 if(photo.t!=='photogray'||photo.anim!=='verreFonce') ec.push('pas d\'animation photochromique ('+photo.t+'/'+photo.anim+')');
 await pg.screenshot({path:process.argv[3]+'/verres-photochromique.png'});
 await pg.click('#confirmBtn'); await pause(1500);
 const suite=await etat();
 if(!suite.ordonnance) ec.push('le choix fait, on n\'avance pas');
 const paiement=await pg.evaluate(()=>!!document.querySelector('#pagePaiement #choixTraitement'));
 if(paiement) ec.push('le traitement est encore demande a la page de paiement');
 if(erreurs.length) ec.push('erreurs de page : '+erreurs.slice(0,3).join(' | '));
 console.log(JSON.stringify({sans,bleu,photo,suite:{ordonnance:suite.ordonnance},resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
