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
   legende:document.getElementById('traitLegende').textContent,
   vitrine:!!document.getElementById('vitrine'),
   cartes:[...document.querySelectorAll('#choixTraitement button')].map(x=>x.textContent.trim()),
   // l'option est sous la liste des montures, dans la meme carte
   souslesmontures:(()=>{const a=document.getElementById('frames'),b=document.getElementById('traitSection');
     return !!(a&&b&&a.parentElement===b.parentElement&&(a.compareDocumentPosition(b)&4));})()}));
 // Lumiere du verre en direct : on photographie la zone des lunettes sur 8 s et on suit sa luminosite
 // (verre qui fonce) et sa teinte bleue (reflet). Le visage de test est une image fixe : toute variation vient des verres.
 const zone=async()=>{const r=await pg.evaluate(()=>{const b=document.getElementById('glCanvas').getBoundingClientRect();
   return {x:b.left+b.width*0.12,y:b.top+b.height*0.28,width:b.width*0.76,height:b.height*0.32};});
   const buf=await pg.screenshot({clip:r});
   return pg.evaluate(async b64=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
     const c=document.createElement('canvas');c.width=im.width>>1;c.height=im.height>>1;
     const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,c.width,c.height);
     const d=g.getImageData(0,0,c.width,c.height).data;let so=0,bl=0,n=0;
     for(let k=0;k<d.length;k+=4){const l=0.3*d[k]+0.59*d[k+1]+0.11*d[k+2];if(l<45)so++;if(d[k+2]-d[k]>12)bl++;n++;}
     return {sombre:so/n,bleu:bl/n};},buf.toString('base64'));};
 const mesure=async()=>{const pts=[];
   for(let i=0;i<10;i++){pts.push(await zone());await pause(500);}
   const sp=k=>{const v=pts.map(p=>p[k]);return +(Math.max(...v)-Math.min(...v)).toFixed(4);};
   const mx=k=>+Math.max(...pts.map(p=>p[k])).toFixed(4);
   return {sombre_ecart:sp('sombre'),sombre_max:mx('sombre'),bleu_ecart:sp('bleu')};};
 const ec=[];
 let e0=await etat();
 if(e0.vitrine) ec.push('la vitrine (photos) est toujours la');
 if(!e0.souslesmontures) ec.push('l\'option n\'est pas sous la liste des montures');
 await pg.click('#confirmBtn'); await pause(600);
 const sans=await etat();
 if(!sans.app||sans.ordonnance) ec.push('on passe a l\'etape suivante sans avoir choisi les verres');
 if(!sans.manquant) ec.push('rien ne signale que le choix des verres manque');
 await pg.screenshot({path:process.argv[3]+'/verres-sans-choix.png'});
 await pg.evaluate(()=>window.scrollTo(0,0)); await pause(6000);   // le zoom de la camera se pose
 const sans0=await mesure();   // temoin : aucun verre anime, le visage est fixe
 await pg.click('#choixTraitement button[data-v="bluecut"]'); await pause(500);
 const bleu=await mesure();
 await pg.screenshot({path:process.argv[3]+'/verres-bleu.png'});
 await pg.click('#choixTraitement button[data-v="photogray"]'); await pause(500);
 const photo=await mesure();
 await pg.screenshot({path:process.argv[3]+'/verres-photochromique.png'});
 if(photo.sombre_max-sans0.sombre_max<0.03) ec.push('le verre photochromique ne s\'anime pas sur le visage ('+JSON.stringify(photo)+')');
 if(bleu.bleu_ecart<0.004||bleu.bleu_ecart<sans0.bleu_ecart*3) ec.push('pas de reflet bleu anime sur le visage ('+JSON.stringify(bleu)+')');
 await pg.click('#confirmBtn'); await pause(1500);
 const suite=await etat();
 if(!suite.ordonnance) ec.push('le choix fait, on n\'avance pas');
 const paiement=await pg.evaluate(()=>!!document.querySelector('#pagePaiement #choixTraitement'));
 if(paiement) ec.push('le traitement est encore demande a la page de paiement');
 if(erreurs.length) ec.push('erreurs de page : '+erreurs.slice(0,3).join(' | '));
 console.log(JSON.stringify({temoin_sans_choix:sans0,lumiere_bleue:bleu,photochromique:photo,option:e0.cartes,suite:{ordonnance:suite.ordonnance},resultat:ec.length?'ÉCHEC':'OK',echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
