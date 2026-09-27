// Le cadreur automatique, éprouvé sur des séquences fabriquées : on ne peut
// pas mettre un vrai visage devant la caméra du banc, mais on peut vérifier
// que la loi d'amortissement se comporte comme un cameraman et non comme un
// ressort.
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
const HOOK=`window.__c={
  cadrer:(lm)=>cadrerSurVisage(lm),
  etat:()=>({zoom:_zoom,panX:_panX,panY:_panY}),
  raz:()=>{_zoom=1;_panX=0;_panY=0;_zoomVise=1;_panXVise=0;_panYVise=0;},
  transform:()=>document.getElementById('camZoom').style.transform
};`;
// un visage synthétique : hauteur h, centré en (cx,cy)
const visage = (h, cx=0.5, cy=0.5) => {
  const lm=[]; lm[10]={x:cx,y:cy-h/2}; lm[152]={x:cx,y:cy+h/2};
  lm[234]={x:cx-h*0.35,y:cy}; lm[454]={x:cx+h*0.35,y:cy};
  return lm;
};
(async()=>{await new Promise(r=>srv.listen(8155,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const pg=await b.newPage();
 pg.on('pageerror',e=>console.log('ERREUR PAGE',String(e).slice(0,200)));
 await pg.route('**/index.html',async r=>{const rep=await r.fetch();let t=await rep.text();
   const i=t.lastIndexOf('</script>');
   await r.fulfill({body:t.slice(0,i)+HOOK+t.slice(i),headers:{'content-type':'text/html'}});});
 await pg.goto('http://127.0.0.1:8155/index.html');
 await pg.waitForFunction(()=>!!window.__c);

 const jouer = (lms) => pg.evaluate(({lms})=>{
    const suite=[];
    for(const lm of lms){ window.__c.cadrer(lm); suite.push(window.__c.etat().zoom); }
    return {suite, fin:window.__c.etat(), transform:window.__c.transform()};
  },{lms});
 const raz = () => pg.evaluate(()=>window.__c.raz());
 const rep = (v,n) => Array.from({length:n},()=>v);

 const ec=[]; const res={};

 // 1. LOIN : cadre large, on se voit en entier
 await raz();
 let r = await jouer(rep(visage(0.18), 150));
 res.loin = { zoom:+r.fin.zoom.toFixed(3) };
 if(r.fin.zoom > 1.06) ec.push('de loin le cadre devrait rester large, zoom '+r.fin.zoom.toFixed(2));

 // 2. PRES : le cadre se resserre, l'approche est amplifiee
 await raz();
 r = await jouer(rep(visage(0.40), 220));
 res.pres = { zoom:+r.fin.zoom.toFixed(3),
              images_pour_90pc: r.suite.findIndex(z=>z>=1+0.9*(r.fin.zoom-1)) };
 if(r.fin.zoom < 1.5) ec.push('en approchant, le resserrement ne se sent pas : zoom '+r.fin.zoom.toFixed(2));
 if(res.pres.images_pour_90pc < 30) ec.push('le resserrement est brutal : moins d\'une seconde');

 // 3. L'approche doit AMPLIFIER : le visage occupe plus que sa croissance seule
 await raz(); await jouer(rep(visage(0.18), 150));
 const partLoin = 0.18 * (await pg.evaluate(()=>window.__c.etat())).zoom;
 await jouer(rep(visage(0.40), 260));
 const partPres = 0.40 * (await pg.evaluate(()=>window.__c.etat())).zoom;
 res.amplification = { part_loin:+partLoin.toFixed(3), part_pres:+partPres.toFixed(3),
                       facteur:+(partPres/partLoin).toFixed(2) };
 if(partPres/partLoin < 2.6)
   ec.push(`l'approche n'est pas amplifiee : x${(partPres/partLoin).toFixed(2)} pour x2.2 de croissance naturelle`);
 if(partPres > 0.82) ec.push('le visage deborde du cadre en approchant : '+partPres.toFixed(2));

 // 3. Frémissement : le cadre doit rester immobile
 await raz();
 await jouer(rep(visage(0.30), 200));               // stabilisé
 const avant = (await pg.evaluate(()=>window.__c.etat())).zoom;
 const bruit = Array.from({length:200},(_,i)=>visage(0.30*(1+0.02*Math.sin(i/3)),
                                                     0.5+0.01*Math.sin(i/5), 0.5));
 r = await jouer(bruit);
 const amplitude = Math.max(...r.suite) - Math.min(...r.suite);
 res.fremissement = { zoom_avant:+avant.toFixed(3), zoom_apres:+r.fin.zoom.toFixed(3),
                      amplitude:+amplitude.toFixed(4) };
 if(amplitude > 0.02) ec.push(`le cadre frémit avec le visage (amplitude ${amplitude.toFixed(3)})`);

 // 5. Perte du visage : retour au large, et lentement
 r = await jouer(rep(null, 400));
 res.visage_perdu = { zoom_final:+r.fin.zoom.toFixed(3),
                      images_pour_moitie: r.suite.findIndex(z=>z<=avant-(avant-1)/2) };
 if(r.fin.zoom > 1.2) ec.push('le cadre ne revient pas au large quand le visage disparaît');
 if(res.visage_perdu.images_pour_moitie < 40) ec.push('le retour au large est trop sec');

 // 6. Jamais de bord noir : le déplacement reste dans la marge dégagée
 await raz();
 r = await jouer(rep(visage(0.40, 0.95, 0.95), 300));
 const m = r.transform.match(/scale\(([\d.]+)\).*translate\(([-\d.]+)%, *([-\d.]+)%\)/);
 const z=+m[1], tx=Math.abs(+m[2]), ty=Math.abs(+m[3]);
 const margePc = (z-1)/2/z*100;
 res.visage_au_bord = { zoom:+z.toFixed(3), deplacement:[+tx.toFixed(2),+ty.toFixed(2)],
                        marge_disponible:+margePc.toFixed(2) };
 if(tx > margePc+0.01 || ty > margePc+0.01) ec.push('le déplacement dépasse la marge : bords noirs visibles');

 console.log(JSON.stringify({...res, resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
