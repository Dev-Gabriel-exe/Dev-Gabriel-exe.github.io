'use strict';
/* PIT Game Jam IA — biblioteca local no navegador, sem APIs pagas */
const assets=[
{id:'explorador',cat:'personagem',name:'Explorador futurista',desc:'Sprite geométrico 2D com fundo transparente.',file:'explorador.png',shape:'hero',tint:'#53dfff'},
{id:'heroina',cat:'personagem',name:'Heroína da floresta',desc:'Personagem 2D em tons verdes.',file:'heroina.png',shape:'hero',tint:'#79ed91'},
{id:'robo',cat:'personagem',name:'Robô amigável',desc:'NPC robótico para conversa ou missão.',file:'robo.png',shape:'robot',tint:'#a988ff'},
{id:'monstro',cat:'personagem',name:'Monstro da estação',desc:'Inimigo simples, para terror ou aventura.',file:'monstro.png',shape:'monster',tint:'#f887b4'},
{id:'piloto',cat:'personagem',name:'Piloto de corrida',desc:'Avatar para carros e corridas.',file:'piloto.png',shape:'hero',tint:'#ffce72'},
{id:'fantasma',cat:'personagem',name:'Fantasma da mansão',desc:'Inimigo para puzzle ou terror 2D.',file:'fantasma.png',shape:'ghost',tint:'#cad9ff'},
{id:'mapa-floresta',cat:'mapa',name:'Mapa — Floresta top-down',desc:'Fundo 2D 1024×576. Adicione colisores no GDevelop.',file:'mapa_floresta.png',shape:'forest',tint:'#79ed91'},
{id:'mapa-cidade',cat:'mapa',name:'Mapa — Cidade neon',desc:'Cenário visto de cima para RPG ou perseguição.',file:'mapa_cidade.png',shape:'city',tint:'#66e0fa'},
{id:'mapa-plataforma',cat:'mapa',name:'Mapa — Plataforma espacial',desc:'Imagem de cenário; o chão jogável requer Platform behavior.',file:'mapa_plataforma.png',shape:'platform',tint:'#9d96ff'},
{id:'mapa-caverna',cat:'mapa',name:'Mapa — Caverna e labirinto',desc:'Cenário escuro para exploração/puzzle.',file:'mapa_caverna.png',shape:'cave',tint:'#c7abff'},
{id:'mapa-corrida',cat:'mapa',name:'Mapa — Pista futurista',desc:'Arte 2D de pista; física/controles usam starter.',file:'mapa_corrida.png',shape:'track',tint:'#ffe58a'},
{id:'chave',cat:'item',name:'Chave dourada',desc:'Item para liberar porta através de variável.',file:'chave.png',shape:'key',tint:'#ffd56b'},
{id:'moeda',cat:'item',name:'Moeda XP',desc:'Coletável para Score e feedback.',file:'moeda.png',shape:'coin',tint:'#ffd56b'},
{id:'cristal',cat:'item',name:'Cristal de energia',desc:'Recurso para puzzle, coleta ou missão.',file:'cristal.png',shape:'crystal',tint:'#6bfbf2'},
{id:'porta',cat:'item',name:'Porta de saída',desc:'Objeto de objetivo para encontro de condição.',file:'porta.png',shape:'door',tint:'#89d7ff'},
{id:'coracao',cat:'item',name:'Coração / vida',desc:'Ícone para HUD da vida.',file:'coracao.png',shape:'heart',tint:'#ff6c99'},
{id:'pocao',cat:'item',name:'Poção de vida',desc:'Item coletável de recuperação.',file:'pocao.png',shape:'potion',tint:'#8cf3b6'},
{id:'checkpoint',cat:'item',name:'Bandeira checkpoint',desc:'Ponto para salvar estágio da missão.',file:'checkpoint.png',shape:'flag',tint:'#e5dc76'},
{id:'glb-cristal',cat:'modelo',name:'Cristal 3D low-poly',desc:'GLB leve de contingência. GDevelop → 3D Model.',file:'cristal_3d.glb',shape:'crystal',tint:'#58f6df'},
{id:'glb-totem',cat:'modelo',name:'Totem 3D low-poly',desc:'Prop para puzzle, monumento ou objetivo.',file:'totem_3d.glb',shape:'totem',tint:'#98d8ff'},
{id:'glb-bau',cat:'modelo',name:'Baú 3D low-poly',desc:'Prop de recompensa, loot ou missão.',file:'bau_3d.glb',shape:'box',tint:'#dca66f'},
{id:'glb-obstaculo',cat:'modelo',name:'Obstáculo 3D',desc:'Objeto para pista ou plataforma 3D.',file:'obstaculo_3d.glb',shape:'box',tint:'#8b93fe'},
{id:'glb-portal',cat:'modelo',name:'Portal 3D low-poly',desc:'Marco visual para chegada ou teleporte.',file:'portal_3d.glb',shape:'totem',tint:'#cd92ff'},
{id:'wav-coleta',cat:'som',name:'Coleta de item',desc:'WAV curto gerado matematicamente.',file:'coleta.wav',shape:'coin',tint:'#ffd56b'},
{id:'wav-vitoria',cat:'som',name:'Vitória / conquista',desc:'WAV original para fim da fase.',file:'vitoria.wav',shape:'flag',tint:'#abf88a'},
{id:'wav-dano',cat:'som',name:'Dano / perigo',desc:'WAV original para colisão com inimigo.',file:'dano.wav',shape:'monster',tint:'#f88a9d'},
{id:'wav-portal',cat:'som',name:'Portal / energia',desc:'WAV original para evento 3D.',file:'portal.wav',shape:'crystal',tint:'#a68bff'},
{id:'wav-menu',cat:'som',name:'Menu / escolha',desc:'WAV original de interface.',file:'menu.wav',shape:'robot',tint:'#82e6ff'}
];
function svgAsset(a){
 const t=a.tint, id=a.id.replace(/[^a-z0-9]/g,'');
 const map=a.cat==='mapa', w=map?1024:160,h=map?576:160;
 const style='<defs><linearGradient id="g" x2="0.8" y2="1"><stop stop-color="'+t+'"/><stop offset="1" stop-color="#30427c"/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="5"/></filter></defs>';
 let art='';
 if(map){
   let p=''; for(let y=0;y<h;y+=64)for(let x=0;x<w;x+=64){const n=(x/64*13+y/64*17)%11;p+='<rect x="'+x+'" y="'+y+'" width="64" height="64" fill="'+(n%2?'#1b3451':'#203c55')+'" stroke="#395e66" stroke-opacity=".18"/>';}
   if(a.shape==='forest'){for(let i=0;i<48;i++){let x=70+(i*163)%920,y=60+(i*117)%470;p+='<circle cx="'+x+'" cy="'+y+'" r="'+(16+i%4*3)+'" fill="#246857" stroke="#6fe0a2" stroke-width="4"/>';}}
   if(a.shape==='city'){p+='<rect x="110" y="0" width="120" height="576" fill="#314355"/><rect x="0" y="170" width="1024" height="120" fill="#314355"/>';for(let i=0;i<30;i++){let x=(i*173)%1000,y=(i*83)%550;p+='<rect x="'+x+'" y="'+y+'" width="50" height="34" rx="4" fill="#33466a" stroke="#42ddfa" stroke-opacity=".6"/>';}}
   if(a.shape==='platform'){p='<rect width="1024" height="576" fill="#142044"/><circle cx="820" cy="100" r="65" fill="#a5afff" opacity=".65"/>';for(let i=0;i<13;i++){let x=i*82,y=480-(i%5)*74;p+='<rect x="'+x+'" y="'+y+'" width="125" height="34" rx="4" fill="#4b5e9b" stroke="#8de4ff" stroke-width="3"/>';}}
   if(a.shape==='cave'){p='<rect width="1024" height="576" fill="#12152a"/>';for(let i=0;i<20;i++){let x=(i*157)%1000,y=(i*103)%530;p+='<path d="M'+x+' '+(y+60)+'l40 -90 90 110Z" fill="#3b3a5c" stroke="#816eaf" stroke-width="5"/>';}}
   if(a.shape==='track'){p='<rect width="1024" height="576" fill="#13263c"/><path d="M150 100 H790 Q950 130 890 310 Q880 470 620 445 H220 Q90 390 150 100" stroke="#424958" stroke-width="115" fill="none"/><path d="M150 100 H790 Q950 130 890 310 Q880 470 620 445 H220 Q90 390 150 100" stroke="#e2cf88" stroke-width="4" stroke-dasharray="16 17" fill="none"/>';}
   art=p+'<rect x="15" y="15" width="994" height="546" fill="none" rx="18" stroke="'+t+'" stroke-opacity=".45" stroke-width="4"/>';
 }else{
  let core='';
  if(a.shape==='hero'){core='<rect x="56" y="57" width="48" height="57" rx="15" fill="url(#g)"/><rect x="39" y="67" width="18" height="49" rx="8" fill="'+t+'"/><rect x="103" y="67" width="18" height="49" rx="8" fill="'+t+'"/><rect x="61" y="107" width="14" height="34" rx="5" fill="#657cc6"/><rect x="86" y="107" width="14" height="34" rx="5" fill="#657cc6"/><circle cx="80" cy="39" r="26" fill="#a5a9d6" stroke="'+t+'" stroke-width="5"/><rect x="57" y="34" width="46" height="13" rx="7" fill="#173459"/><circle cx="69" cy="40" r="4" fill="'+t+'"/><circle cx="91" cy="40" r="4" fill="'+t+'"/>';}
  if(a.shape==='robot'){core='<rect x="38" y="24" width="84" height="75" rx="20" fill="#7586be" stroke="'+t+'" stroke-width="6"/><rect x="49" y="43" width="62" height="30" rx="9" fill="#162a50"/><circle cx="67" cy="58" r="7" fill="'+t+'"/><circle cx="94" cy="58" r="7" fill="'+t+'"/><rect x="55" y="102" width="50" height="42" rx="13" fill="url(#g)"/><path d="M80 24V12" stroke="'+t+'" stroke-width="5"/><circle cx="80" cy="8" r="6" fill="'+t+'"/>';}
  if(a.shape==='monster'){core='<path d="M35 133 V62Q42 15 80 21Q120 18 127 62V133L109 115 94 136 79 115 65 136 48 113Z" fill="url(#g)" stroke="#3e2460" stroke-width="7"/><ellipse cx="62" cy="68" rx="12" ry="14" fill="#10142a"/><ellipse cx="100" cy="68" rx="12" ry="14" fill="#10142a"/><path d="M56 99L68 111L80 99L93 111L105 99" fill="none" stroke="#fce0ff" stroke-width="6"/>';}
  if(a.shape==='ghost'){core='<path d="M39 131V69Q42 20 80 20Q124 25 122 76V133L107 121L94 138L81 124L65 138L52 121Z" fill="url(#g)" stroke="#a5c4ff" stroke-width="5"/><ellipse cx="61" cy="74" rx="9" ry="15" fill="#1a245a"/><ellipse cx="99" cy="74" rx="9" ry="15" fill="#1a245a"/>';}
  if(a.shape==='key'){core='<circle cx="55" cy="60" r="25" fill="none" stroke="url(#g)" stroke-width="15"/><path d="M75 79L128 133M103 108L116 95M113 121L127 108" stroke="'+t+'" stroke-width="13" stroke-linecap="round"/>';}
  if(a.shape==='coin'){core='<circle cx="80" cy="80" r="55" fill="#886a23" stroke="'+t+'" stroke-width="10"/><circle cx="80" cy="80" r="42" fill="#f9c755" stroke="#fff0a2" stroke-width="5"/><text x="80" y="99" font-size="56" text-anchor="middle" font-weight="900" fill="#8c6918">★</text>';}
  if(a.shape==='crystal'){core='<path d="M80 10L132 65L80 148L28 65Z" fill="url(#g)" stroke="#d4faff" stroke-width="6"/><path d="M80 10V148M28 65H132" fill="none" stroke="#e8ffff" stroke-width="5" opacity=".6"/>';}
  if(a.shape==='door'){core='<rect x="34" y="11" width="92" height="140" rx="8" fill="#38405f" stroke="'+t+'" stroke-width="10"/><rect x="46" y="23" width="68" height="112" fill="url(#g)" opacity=".75"/><circle cx="100" cy="85" r="6" fill="#ffe7a0"/>';}
  if(a.shape==='heart'){core='<path d="M80 139L21 78Q5 37 40 25Q64 17 80 44Q104 9 132 28Q162 68 125 100Z" fill="url(#g)" stroke="#ffb8dd" stroke-width="7"/>';}
  if(a.shape==='potion'){core='<rect x="65" y="18" width="30" height="38" rx="5" fill="#abdef1"/><rect x="50" y="48" width="60" height="91" rx="22" fill="url(#g)" stroke="#d2fff1" stroke-width="7"/><path d="M56 100Q82 74 105 94" stroke="#efffff" stroke-width="7" fill="none"/>';}
  if(a.shape==='flag'){core='<path d="M55 143V24" stroke="#d2f5ff" stroke-width="9"/><path d="M61 23L130 42L66 79Z" fill="url(#g)" stroke="#f4fdff" stroke-width="5"/>';}
  if(a.shape==='box' || a.shape==='totem'){core='<rect x="30" y="30" width="100" height="100" fill="url(#g)" stroke="#c4f3ff" stroke-width="8"/><path d="M30 30L80 8L130 30M130 130L80 153L30 130" fill="none" stroke="'+t+'" stroke-width="7"/>';}
  art='<circle cx="80" cy="80" r="70" fill="'+t+'" opacity=".10" filter="url(#gl)"/>'+core;
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+style+art+'</svg>';
}
function downloadBlob(blob,file){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=file;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},3000);}
function pngDownload(a){return new Promise(function(resolve,reject){const svg=svgAsset(a);const img=new Image();img.onload=function(){try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);c.toBlob(function(blob){if(blob){downloadBlob(blob,a.file);resolve(true)}else reject(Error('PNG indisponível'))},'image/png');}catch(e){reject(e)}};img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);})}
function modelDownload(a){
 const crystal=a.shape==='crystal';let verts=crystal?[0,1.55,0,-.9,0,0,0,0,-.9,.9,0,0,0,0,.9,0,-1.35,0]:[-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1];
 let faces=crystal?[0,1,2,0,2,3,0,3,4,0,4,1,5,2,1,5,3,2,5,4,3,5,1,4]:[0,1,2,0,2,3,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
 if(a.shape==='totem'){for(let i=0;i<verts.length;i+=3){verts[i]*=.55;verts[i+1]*=1.85;verts[i+2]*=.55;}}
 const pos=new Float32Array(verts),idx=new Uint16Array(faces);
 const indicesByte=idx.byteLength,pad=(4-indicesByte%4)%4,buf=new Uint8Array(pos.byteLength+indicesByte+pad);
 buf.set(new Uint8Array(pos.buffer),0);buf.set(new Uint8Array(idx.buffer),pos.byteLength);
 const color=a.tint.replace('#',''),rgba=[0,2,4].map(i=>parseInt(color.slice(i,i+2),16)/255).concat([1]);
 const xs=[],ys=[],zs=[];for(let i=0;i<verts.length;i+=3){xs.push(verts[i]);ys.push(verts[i+1]);zs.push(verts[i+2]);}
 const gltf={asset:{version:'2.0',generator:'PIT Creator Mode procedural lowpoly'},extensionsUsed:['KHR_materials_unlit'],buffers:[{byteLength:buf.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:pos.byteLength,target:34962},{buffer:0,byteOffset:pos.byteLength,byteLength:indicesByte,target:34963}],accessors:[{bufferView:0,componentType:5126,count:pos.length/3,type:'VEC3',min:[Math.min(...xs),Math.min(...ys),Math.min(...zs)],max:[Math.max(...xs),Math.max(...ys),Math.max(...zs)]},{bufferView:1,componentType:5123,count:idx.length,type:'SCALAR'}],materials:[{name:'PIT material',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:rgba,metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}}}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],nodes:[{mesh:0,name:a.name}],scenes:[{nodes:[0]}],scene:0};
 const json=new TextEncoder().encode(JSON.stringify(gltf));const jsonPad=(4-json.length%4)%4;const all=12+8+json.length+jsonPad+8+buf.length;const buffer=new ArrayBuffer(all),v=new DataView(buffer),u=new Uint8Array(buffer);
 v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,all,true);v.setUint32(12,json.length+jsonPad,true);v.setUint32(16,0x4e4f534a,true);u.set(json,20);u.fill(32,20+json.length,20+json.length+jsonPad);
 let start=20+json.length+jsonPad;v.setUint32(start,buf.length,true);v.setUint32(start+4,0x004e4942,true);u.set(buf,start+8);downloadBlob(new Blob([buffer],{type:'model/gltf-binary'}),a.file);
}
function audioDownload(a){
 const sr=22050,seconds=a.id==='wav-vitoria'?1.3:.7,n=Math.floor(sr*seconds);const buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);
 function label(p,s){for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));}
 label(0,'RIFF');v.setUint32(4,36+n*2,true);label(8,'WAVE');label(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);label(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const t=i/sr,u=i/n;let hz=260;
 if(a.id==='wav-vitoria')hz=392+u*400+Math.sin(u*30)*50;
 if(a.id==='wav-coleta')hz=570+u*700;
 if(a.id==='wav-dano')hz=240-u*130;
 if(a.id==='wav-portal')hz=160+u*600;
 if(a.id==='wav-menu')hz=490+u*120;
 const env=Math.pow(1-u,2.3)*Math.min(1,u*45);const sample=(Math.sin(2*Math.PI*hz*t)+.18*Math.sin(2*Math.PI*hz*2.01*t))*env*.30;v.setInt16(44+i*2,Math.max(-32767,Math.min(32767,Math.round(sample*32767))),true);}
 downloadBlob(new Blob([buffer],{type:'audio/wav'}),a.file);
}
function assetIcon(a){return ({personagem:'🎮',mapa:'🗺️',item:'🗝️',modelo:'🧊',som:'🔊'})[a.cat]}
function renderAssets(){
 const cat=document.querySelector('[data-filter].active')?.dataset.filter||'todos';
 const search=(document.getElementById('assetSearch')?.value||'').toLowerCase();
 const filtered=assets.filter(a=>(cat==='todos'||a.cat===cat) && (a.name.toLowerCase().includes(search)||a.desc.toLowerCase().includes(search)));
 const box=document.getElementById('assetGrid');if(!box)return;
 box.innerHTML=filtered.map(function(a){
 const image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgAsset(a));
 const tag={personagem:'PNG · SPRITE',mapa:'PNG · CENÁRIO',item:'PNG · OBJETO',modelo:'GLB · MODELO 3D',som:'WAV · ÁUDIO'}[a.cat];
 return '<article class="resource-card"><div class="asset-picture"><img src="'+image+'" loading="lazy" alt="Prévia de '+a.name+'"></div><div class="res-inner"><small>'+tag+'</small><h3>'+a.name+'</h3><p>'+a.desc+'</p><button type="button" class="download" data-asset="'+a.id+'">↓ Baixar '+a.file+'</button></div></article>';
 }).join('')||'<p>Sem resultados. Experimente outra categoria.</p>';
 box.querySelectorAll('[data-asset]').forEach(b=>b.addEventListener('click',async function(){const a=assets.find(x=>x.id===b.dataset.asset);b.disabled=true;const old=b.textContent;b.textContent='Preparando arquivo…';try{if(a.cat==='modelo')modelDownload(a);else if(a.cat==='som')audioDownload(a);else await pngDownload(a);}catch(e){alert('Não foi possível baixar. Tente Chrome/Edge atualizado. '+e.message)}finally{b.disabled=false;b.textContent=old}}));
 const n=document.getElementById('resultCount');if(n)n.textContent=filtered.length+' recursos nesta seleção';
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',function(){document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.remove('active')});b.classList.add('active');renderAssets();}));
document.getElementById('assetSearch')?.addEventListener('input',renderAssets);
function refreshStatus(){try{const x=JSON.parse(localStorage.getItem('pit_creator_mode_v08')||'{}');let done=Array.isArray(x.done)?x.done:[];const meter=document.getElementById('myProgress');if(meter)meter.textContent=done.length+'/6 missões • '+done.reduce((s,n)=>s+[100,120,150,150,200,280][n-1],0)+' XP';}catch(e){}}
renderAssets();refreshStatus();window.addEventListener('pageshow',refreshStatus);
