
import {neon} from '@neondatabase/serverless';
import {timingSafeEqual} from 'node:crypto';
const db=neon(process.env.DATABASE_URL),q=(sql,params=[])=>db.query(sql,params);
const txt=(x,n=130)=>String(x??'').trim().replace(/\s+/g,' ').slice(0,n);
const id=x=>/^[0-9a-f-]{36}$/i.test(String(x??''));
const key=x=>txt(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const ok=req=>{const a=Buffer.from(String(req.headers['x-teacher-pin']||'')),b=Buffer.from(process.env.TEACHER_PIN||'');return b.length>0&&a.length===b.length&&timingSafeEqual(a,b)};
function send(res,n,x){res.statusCode=n;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(x))}
function value(p,round){return [Number(p[round==='runoff'?'runoff_sum':'vote_sum']),Number(p[round==='runoff'?'runoff_count':'vote_count'])]}
function cmp(a,b,r){const [as,ac]=value(a,r),[bs,bc]=value(b,r);return ac&&bc?Math.sign(as*bc-bs*ac):ac?1:bc?-1:0}
const rank=(p,r)=>p.slice().sort((a,b)=>-cmp(a,b,r)||(a.created_at<b.created_at?-1:1));
function calc(p,s){
 const runoff=s.phase==='runoff'||(s.phase==='closed'&&s.runoff_round>1);
 const locked=runoff?s.locked_ids.map(id=>p.find(x=>x.id===id)).filter(Boolean):[];
 const candidates=runoff?s.runoff_candidates.map(id=>p.find(x=>x.id===id)).filter(Boolean):p;
 const round=runoff?'runoff':'main',list=rank(candidates,round),spots=Math.max(0,5-locked.length),edge=list[spots-1];
 const complete=candidates.length>0&&candidates.every(x=>value(x,round)[1]>0);
 let winners=locked.concat(list.slice(0,spots)),tie=false,tieIds=[],fixed=locked.map(x=>x.id),missing=0;
 if(edge&&list.length>spots){const above=list.filter(x=>cmp(x,edge,round)>0),equal=list.filter(x=>cmp(x,edge,round)===0);
 if(above.length+equal.length>spots){tie=true;winners=locked.concat(above);tieIds=equal.map(x=>x.id);fixed=winners.map(x=>x.id);missing=spots-above.length}}
 return {ranking:rank(p,'main').map(x=>x.id),winners:winners.map(x=>x.id),tie:{required:tie,complete,candidates:tieIds,locked:fixed,spots:missing,runoff}}
}
async function snap(name='',device=''){
 const [r,p,v]=await Promise.all([
 q('SELECT phase,active_project_id,active_vote_open,runoff_round,runoff_candidates,locked_ids FROM turma_settings WHERE id=1'),
 q('SELECT p.id,p.student_name,p.app_name,p.created_at,p.vote_closed,COUNT(v.id) FILTER(WHERE v.round=1)::int vote_count,COALESCE(SUM(v.score) FILTER(WHERE v.round=1),0)::int vote_sum,COUNT(v.id) FILTER(WHERE v.round>1 AND v.round=(SELECT runoff_round FROM turma_settings WHERE id=1))::int runoff_count,COALESCE(SUM(v.score) FILTER(WHERE v.round>1 AND v.round=(SELECT runoff_round FROM turma_settings WHERE id=1)),0)::int runoff_sum FROM turma_projects p LEFT JOIN turma_votes v ON v.project_id=p.id GROUP BY p.id ORDER BY p.created_at'),
 name&&device?q('SELECT project_id,round,score FROM turma_votes WHERE voter_key=$1 AND device_id=$2',[key(name),device]):Promise.resolve([])]);
 const projects=p.map(x=>({...x,vote_count:Number(x.vote_count),vote_sum:Number(x.vote_sum),runoff_count:Number(x.runoff_count),runoff_sum:Number(x.runoff_sum),average:x.vote_count?Math.round(100*x.vote_sum/x.vote_count)/100:null,runoff_average:x.runoff_count?Math.round(100*x.runoff_sum/x.runoff_count)/100:null}));
 return {settings:r[0],projects,...calc(projects,r[0]),my_votes:v.reduce((a,x)=>(a[x.round+'_'+x.project_id]=x.score,a),{}),server_time:new Date().toISOString()}
}
export default async function handler(req,res){
 const origin=req.headers.origin||'';
 if(origin&&origin!=='https://dev-gabriel-exe.github.io'&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin))return send(res,403,{error:'Origem proibida'});
 res.setHeader('Access-Control-Allow-Origin',origin||'*');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Teacher-Pin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
 try{
 if(req.method==='GET'){const u=new URL(req.url,'http://localhost');return send(res,200,await snap(txt(u.searchParams.get('name')),u.searchParams.get('device')||''))}
 if(req.method!=='POST')return send(res,405,{error:'Método inválido'});
 let d=req.body||{};if(typeof d==='string')d=JSON.parse(d);
 if(d.action==='login')return send(res,ok(req)?200:401,ok(req)?{ok:true}:{error:'Código incorreto'});
 if(d.action==='vote'){
 const name=txt(d.name),device=String(d.device||''),score=Number(d.score);
 if(name.length<2||!id(d.project_id)||!/^[a-zA-Z0-9_-]{18,100}$/.test(device)||!Number.isInteger(score)||score<0||score>10)return send(res,400,{error:'Nome ou nota inválida'});
 const s=(await q('SELECT phase,active_project_id,active_vote_open,runoff_round,runoff_candidates FROM turma_settings WHERE id=1'))[0];let round=1;
 if(s.phase==='presentation'){if(!s.active_vote_open||s.active_project_id!==d.project_id)return send(res,409,{error:'Votação desse aplicativo está fechada'})}
 else if(s.phase==='voting')round=1;
 else if(s.phase==='runoff'){round=s.runoff_round;if(!s.runoff_candidates.includes(d.project_id))return send(res,409,{error:'Não participa do desempate'})}
 else return send(res,409,{error:'Votação encerrada'});
 const added=await q('INSERT INTO turma_votes(project_id,round,voter_name,voter_key,device_id,score) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',[d.project_id,round,name,key(name),device,score]);
 return send(res,added.length?201:409,added.length?{ok:true,score}:{error:'Você já votou nesse aplicativo'});
 }
 if(!ok(req))return send(res,401,{error:'Código do professor necessário'});
 const s=(await q('SELECT * FROM turma_settings WHERE id=1'))[0],a=d.action;
 if(a==='add'){
 if(s.phase!=='presentation'||s.active_vote_open)return send(res,409,{error:'Feche a votação atual antes de cadastrar'});
 const student=txt(d.student_name),app=txt(d.app_name);
 if(student.length<2||app.length<2)return send(res,400,{error:'Informe aluno e aplicativo'});
 const r=await q('INSERT INTO turma_projects(student_name,app_name) VALUES($1,$2) RETURNING id',[student,app]);await q('UPDATE turma_settings SET active_project_id=$1,active_vote_open=false WHERE id=1',[r[0].id]);return send(res,201,{ok:true})
 }
 if(a==='active'){
 if(s.phase!=='presentation'||s.active_vote_open||!id(d.id))return send(res,409,{error:'Feche a votação antes de trocar de apresentação'});
 const p=await q('SELECT id FROM turma_projects WHERE id=$1',[d.id]);if(!p.length)return send(res,404,{error:'Projeto não encontrado'});
 await q('UPDATE turma_settings SET active_project_id=$1 WHERE id=1',[d.id]);return send(res,200,{ok:true})
 }
 if(a==='edit'){
 if(s.phase!=='presentation'||s.active_vote_open||!id(d.id))return send(res,409,{error:'Feche a votação antes de editar'});
 if(txt(d.student_name).length<2||txt(d.app_name).length<2)return send(res,400,{error:'Informe os nomes'});
 await q('UPDATE turma_projects SET student_name=$1,app_name=$2 WHERE id=$3',[txt(d.student_name),txt(d.app_name),d.id]);return send(res,200,{ok:true})
 }
 if(a==='open'||a==='open_current'){
 if(s.phase!=='presentation'||s.active_vote_open||!s.active_project_id)return send(res,409,{error:'Selecione um aplicativo'});
 await q('UPDATE turma_settings SET active_vote_open=true WHERE id=1');await q('UPDATE turma_projects SET vote_closed=false WHERE id=$1',[s.active_project_id]);return send(res,200,{ok:true})
 }
 if(a==='close_current'){
 if(s.phase!=='presentation'||!s.active_vote_open)return send(res,409,{error:'Nenhuma votação aberta'});
 await q('UPDATE turma_settings SET active_vote_open=false WHERE id=1');await q('UPDATE turma_projects SET vote_closed=true WHERE id=$1',[s.active_project_id]);return send(res,200,{ok:true})
 }
 if(a==='finish'||a==='runoff'){
 if(s.active_vote_open||!['presentation','voting','runoff'].includes(s.phase))return send(res,409,{error:'Encerre a votação do aplicativo antes de finalizar'});
 const p=await snap(),r=calc(p.projects,s);
 if(!r.tie.complete)return send(res,409,{error:'Existem projetos sem votos. Abra a votação desses projetos primeiro.'});
 if(a==='finish'){
 if(r.tie.required)return send(res,409,{error:'Há empate no Top 5. Inicie o desempate.'});
 await q("UPDATE turma_settings SET phase='closed',active_vote_open=false WHERE id=1");return send(res,200,{ok:true})
 }
 if(!r.tie.required)return send(res,409,{error:'Não há empate na quinta posição'});
 await q("UPDATE turma_settings SET phase='runoff',active_vote_open=false,runoff_round=runoff_round+1,locked_ids=$1::jsonb,runoff_candidates=$2::jsonb WHERE id=1",[JSON.stringify(r.tie.locked),JSON.stringify(r.tie.candidates)]);return send(res,200,{ok:true})
 }
 return send(res,400,{error:'Ação desconhecida'})
 }catch(e){console.error('votacao-api',e.code||e.message);return send(res,500,{error:'Erro ao processar a votação'})}
}
