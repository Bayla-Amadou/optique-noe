// Banc de suivi avec un VRAI visage. Chromium lit une video Y4M comme
// fausse camera, donc MediaPipe detecte, la pose se calcule, la monture se
// pose. C'est ce qui manquait depuis le debut pour tester le suivi.
//
// Deux passes :
//   1. nominal  — on regarde si la monture reste affichee ;
//   2. sabotage — on retire la matrice de pose de MediaPipe une image sur
//      cinq, en gardant les reperes. C'est exactement la panne qui faisait
//      clignoter la monture sur un visage pourtant parfaitement suivi.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe', Y4M=process.argv[2];
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm',
 '.glb':'model/gltf-binary','.task':'application/octet-stream','.tflite':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.bin':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const HOOK=`window.__s={
  affichee:()=>{const o=document.getElementById('glCanvas').style.opacity;
    return !!(typeof glassGroup!=='undefined'&&glassGroup&&glassGroup.visible)&&o!=='0';},
  visible:()=>!!(glassGroup&&glassGroup.visible),
  effacements:()=>(typeof _effacements==='number'?_effacements:-1),
  reprises:()=>(typeof _reprises==='number'?_reprises:-1),
  vues:()=>_imagesVues, suivi:()=>!!landmarks, zoom:()=>_zoom
};`;
(async()=>{await new Promise(r=>srv.listen(8157,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+Y4M,
        '--allow-file-access-from-files','--enable-unsafe-swiftshader']});
 const bilan={};
 for(const sabotage of ['aucun','sans_matrice','pertes_breves','perte_longue']){
   const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
   const pg=await ctx.newPage();
   pg.on('pageerror',e=>console.log('[ERREUR PAGE]',String(e).slice(0,220)));
   await pg.route('**/index.html',async r=>{const rep=await r.fetch();let t=await rep.text();
     if(sabotage){
       // une image sur cinq perd sa matrice de pose, les reperes restent
       t=t.replace('res = faceLandmarker.detectForVideo(_srcCv, _ts);',
         'res = faceLandmarker.detectForVideo(_srcCv, _ts); '+
         '    if(res && (window.__sab=(window.__sab|0)+1) % 5 === 0) res.facialTransformationMatrixes = [];');
     }
     const i=t.lastIndexOf('</script>');
     await r.fulfill({body:t.slice(0,i)+HOOK+t.slice(i),headers:{'content-type':'text/html; charset=utf-8'}});});
   await pg.goto('http://127.0.0.1:8157/index.html');
   await pg.waitForSelector('#startBtn'); await pg.click('#startBtn');
   await pause(8500);
   const pret=await pg.evaluate(()=>!!window.__s);
   if(!pret){console.log('[BANC] le point d\'observation n\'est pas en place'); process.exit(1);}
   // echantillonnage serre : on cherche des trous, meme d'une image
   const ech=[];
   for(let i=0;i<190;i++){ ech.push(await pg.evaluate(()=>window.__s.affichee())); await pause(60); }
   const e=await pg.evaluate(()=>({eff:window.__s.effacements(), rep:window.__s.reprises(),
                                   vues:window.__s.vues(), suivi:window.__s.suivi(), zoom:window.__s.zoom()}));
   let eteints=0, pire=0, courant=0;
   for(const o of ech){ if(o===false){eteints++;courant++;if(courant>pire)pire=courant;} else courant=0; }
   bilan[sabotage]={
     visage_suivi:e.suivi, images_traitees:e.vues, zoom:+e.zoom.toFixed(2),
     effacements:e.eff, reprises_solveur:e.rep,
     echantillons_monture_eteinte:eteints+'/190',
     plus_long_trou_ms: pire*60};
   await ctx.close();
 }
 const ec=[];
 for(const [nom,v] of Object.entries(bilan)){
   if(!v.visage_suivi) ec.push(nom+" : aucun visage suivi, le banc ne prouve rien");
   // une perte longue DOIT effacer la monture : c'est voulu.
   if(nom!=='perte_longue' && v.plus_long_trou_ms>0)
     ec.push(`${nom} : trou de ${v.plus_long_trou_ms} ms dans l'affichage de la monture`);
 }
 console.log(JSON.stringify({...bilan, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
