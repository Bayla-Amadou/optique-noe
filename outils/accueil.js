// L'ecran d'accueil : une seule marque a l'ecran, et tout tient dans la
// dalle de la borne sans qu'on ait a faire defiler.
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
(async()=>{await new Promise(r=>srv.listen(8165,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const bilan={}, ec=[];
 for(const [nom,vp] of [['borne',{width:1080,height:1920}],['paysage',{width:1440,height:900}]]){
   const ctx=await b.newContext({permissions:['camera'],viewport:vp});
   const pg=await ctx.newPage();
   await pg.goto('http://127.0.0.1:8165/index.html');
   await pg.waitForSelector('#startBtn'); await pause(1800);
   const m=await pg.evaluate(()=>{
     const vu=(s)=>{const e=document.querySelector(s); if(!e) return false;
       const r=e.getBoundingClientRect();
       return r.width>0 && r.height>0 && getComputedStyle(e).display!=='none';};
     const bas=(s)=>{const e=document.querySelector(s); return e?Math.round(e.getBoundingClientRect().bottom):null;};
     return { entete_visible:vu('header'), logo_accueil_visible:vu('.w-logo-img'),
              marques_a_l_ecran:[vu('header'),vu('.w-logo-img')].filter(Boolean).length,
              appel:(document.querySelector('.w-appel')||{}).textContent,
              phrase:(document.querySelector('.w-desc')||{}).textContent,
              bas_bouton:bas('.btn-start'), fenetre:window.innerHeight,
              page:Math.round(document.body.scrollHeight) };
   });
   await pg.screenshot({path:process.argv[3]+'/accueil-'+nom+'.png'});
   // apres demarrage, l'entete doit revenir
   await pg.click('#startBtn'); await pause(6000);
   m.entete_apres_demarrage = await pg.evaluate(()=>getComputedStyle(document.querySelector('header')).display!=='none');
   bilan[nom]=m;
   if(m.marques_a_l_ecran!==1) ec.push(`${nom} : ${m.marques_a_l_ecran} logos a l'ecran d'accueil, il en faut un`);
   if(/augment/i.test(m.phrase||'')) ec.push(nom+' : le jargon est toujours la');
   if(m.bas_bouton>m.fenetre) ec.push(`${nom} : le bouton finit a ${m.bas_bouton} pour ${m.fenetre} de fenetre`);
   if(!m.entete_apres_demarrage) ec.push(nom+" : l'en-tete ne revient pas apres le demarrage");
   await ctx.close();
 }
 console.log(JSON.stringify({...bilan, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
