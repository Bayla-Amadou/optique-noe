// Un bouton desactive doit SE VOIR et DIRE ce qui manque. On verifie aussi
// qu'aucun autre bouton desactive de l'application ne passe pour actif.
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
(async()=>{await new Promise(r=>srv.listen(8175,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
 const pg=await ctx.newPage();
 await pg.goto('http://127.0.0.1:8175/index.html');
 await pg.waitForSelector('#startBtn'); await pg.click('#startBtn'); await pause(11000);
 await pg.click('#confirmBtn'); await pause(1500);

 const avant=await pg.evaluate(()=>{
   const b=document.getElementById('btnOrdNext'), m=document.getElementById('ordManque');
   const s=getComputedStyle(b);
   return { desactive:b.disabled, opacite:+s.opacity, curseur:s.cursor,
            message_visible: m && getComputedStyle(m).display!=='none',
            message: m ? m.textContent.trim() : null };});
 await pg.screenshot({path:process.argv[3]+'/bouton-desactive.png'});

 // on prend la photo : le bouton doit s'activer et le message disparaitre
 await pg.click('#btnCapture'); await pause(7000);   // la photo a un compte a rebours
 const apres=await pg.evaluate(()=>{
   const b=document.getElementById('btnOrdNext'), m=document.getElementById('ordManque');
   return { desactive:b.disabled, opacite:+getComputedStyle(b).opacity,
            message_visible: m && getComputedStyle(m).display!=='none' };});
 // et il doit reellement faire avancer le parcours
 await pg.click('#btnOrdNext'); await pause(1200);
 const suite=await pg.evaluate(()=>document.getElementById('pagePaiement').classList.contains('on'));

 const ec=[];
 if(!avant.desactive) ec.push('le bouton n\'est pas desactive avant la photo');
 if(avant.opacite>0.6) ec.push(`desactive mais opacite ${avant.opacite} : il parait actif`);
 if(avant.curseur!=='not-allowed') ec.push('le curseur ne signale pas que le bouton est inactif');
 if(!avant.message_visible) ec.push('rien ne dit au client ce qui manque');
 if(apres.desactive) ec.push('le bouton reste desactive apres la photo');
 if(apres.message_visible) ec.push('le message reste alors que la photo est prise');
 if(!suite) ec.push('le bouton ne fait pas avancer le parcours');
 console.log(JSON.stringify({avant, apres, avance_au_paiement:suite,
   resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
