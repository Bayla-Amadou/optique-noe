// La page doit tenir dans l'ecran, et RIEN ne doit etre hors d'atteinte.
// On verifie a plusieurs gabarits, dont celui de la borne.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm',
 '.glb':'model/gltf-binary','.task':'application/octet-stream','.tflite':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.bin':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const GABARITS=[
  ['borne_1080x1920',{width:1080,height:1920}],
  ['borne_reduite',  {width:562, height:998}],
  ['portrait_etroit',{width:768, height:1024}],
  ['paysage_mac',    {width:1440,height:900}],
];
(async()=>{await new Promise(r=>srv.listen(8163,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+process.argv[2],
        '--allow-file-access-from-files','--enable-unsafe-swiftshader']});
 const bilan={}, ec=[];
 for(const [nom,vp] of GABARITS){
   const ctx=await b.newContext({permissions:['camera'],viewport:vp});
   const pg=await ctx.newPage();
   await pg.goto('http://127.0.0.1:8163/index.html');
   await pg.waitForSelector('#startBtn'); await pg.click('#startBtn');
   await pause(9000);
   const m=await pg.evaluate(()=>{
     const bas=(sel)=>{const e=document.querySelector(sel);
       return e?Math.round(e.getBoundingClientRect().bottom):null;};
     return { fenetre:window.innerHeight,
              page:Math.round(document.body.scrollHeight),
              bas_boutons:bas('.actions'), bas_pied:bas('footer'),
              cadre:[Math.round(document.querySelector('.cam-wrap').getBoundingClientRect().width),
                     Math.round(document.querySelector('.cam-wrap').getBoundingClientRect().height)],
              coupe:getComputedStyle(document.body).overflowY };
   });
   m.debordement = Math.max(0, m.page - m.fenetre);
   bilan[nom]=m;
   if(m.bas_boutons===null) ec.push(nom+' : les boutons ne sont pas dans la page');
   else if(m.bas_boutons > m.fenetre) ec.push(`${nom} : les boutons finissent a ${m.bas_boutons} px pour une fenetre de ${m.fenetre}`);
   if(m.coupe==='hidden' && m.debordement>0) ec.push(nom+' : la page deborde ET elle est coupee — contenu inatteignable');
   if(m.cadre[0]<200) ec.push(nom+' : cadre camera trop petit ('+m.cadre.join('x')+')');
   await pg.screenshot({path:process.argv[3]+'/tenue-'+nom+'.png'});
   await ctx.close();
 }
 console.log(JSON.stringify({...bilan, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
