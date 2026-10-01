// La borne doit travailler au rythme de la CAMÉRA, pas de l'écran.
// On compte les images réellement traitées en dix secondes, dans les deux
// modes : abonnement caméra, et repli sur l'écran (le cas iPad).
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm',
 '.glb':'model/gltf-binary','.task':'application/octet-stream','.tflite':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.bin':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const HOOK=`window.__t={vues:()=>_imagesVues, qualite:()=>_qualite, ms:()=>_frameMs};`;
(async()=>{await new Promise(r=>srv.listen(8153,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--allow-file-access-from-files','--enable-unsafe-swiftshader']});
 const bilan={};
 for(const muet of [false]){
   const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
   const pg=await ctx.newPage();
   await pg.route('**/index.html',async r=>{
     const rep=await r.fetch(); let t=await rep.text();
     const i=t.lastIndexOf('</script>');
     await r.fulfill({body:t.slice(0,i)+HOOK+t.slice(i),headers:{'content-type':'text/html'}});
   });
   if(muet) await pg.addInitScript(()=>{
     HTMLVideoElement.prototype.requestVideoFrameCallback=function(){return 1;};
     HTMLVideoElement.prototype.cancelVideoFrameCallback=function(){};
   });
   const journal=[];
   pg.on('console',m=>{const t=m.text(); if(/Charge|Boucle/.test(t)) journal.push(t.slice(0,110));});
   await pg.goto('http://127.0.0.1:8153/index.html');
   await pg.waitForSelector('#startBtn'); await pg.click('#startBtn');
   await pause(6000);
   const a=await pg.evaluate(()=>window.__t.vues());
   await pause(10000);
   const z=await pg.evaluate(()=>({v:window.__t.vues(), q:window.__t.qualite(), ms:window.__t.ms()}));
   bilan[muet?'repli_ecran':'abonnement_camera']={
     images_par_seconde:+((z.v-a)/10).toFixed(1),
     qualite_finale:z.q, ms_par_image:+z.ms.toFixed(0),
     journal:[...new Set(journal)].slice(0,3)};
   await ctx.close();
 }
 const ec=[];
 const A=bilan.abonnement_camera && bilan.abonnement_camera.images_par_seconde;
 const B=bilan.repli_ecran && bilan.repli_ecran.images_par_seconde;
 if(A!=null && B!=null){
   if(B > A*1.6) ec.push(`le repli tourne ${(B/A).toFixed(1)} fois plus vite que la caméra : le garde-fou ne tient pas`);
   if(A<1||B<1) ec.push('une des deux boucles ne tourne pas');
 } else if(A!=null && A<1) ec.push('la boucle ne tourne pas');
 console.log(JSON.stringify({...bilan, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
