import {neon} from '@neondatabase/serverless';
import {timingSafeEqual} from 'node:crypto';
const sql=neon(process.env.DATABASE_URL);
const q=(statement,params=[])=>sql.query(statement,params);
const tidy=(s,n=130)=>String(s??'').trim().replace(/\s+/g,' ').slice(0,n);
const key=s=>tidy(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s??''));
const send=(res,n,obj)=>{res.statusCode=n;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj))};
function isTeacher(req){let a=Buffer.from(String(req.headers['x-teacher-pin']||'')),b=Buffer.from(process.env.TEACHER_PIN||'');return b.length>0&&a.length===b.length&&timingSafeEqual(a,b)}
const count=(p,r)=>Number(r==='runoff'?p.runoff_count:p.vote_count);
const sum=(p,r)=>Number(r==='runoff'?p.runoff_sum:p.vote_sum);
function compare(a,b,r){const ac=count(a,r),bc=count(b,r);if(!ac)return bc?-1:0;if(!bc)return 1;return Math.sign(sum(a,r)*bc-sum(b,r)*ac)}
const sorted=(p,r)=>p.slice().sort((a,b)=>-compare(a,b,r)||(a.created_at<b.created_at?-1:1));
function placement(p,s){
 const runoff=s.phase==='runoff'||(s.phase==='closed'&&s.runoff_round>1),round=runoff?'runoff':'main';
 const locked=runoff?(s.locked_ids||[]).map(id=>p.find(v=>v.id===id)).filter(Boolean):[];
 const candidates=runoff?(s.runoff_candidates||[]).map(id=>p.find(v=>v.id===id)).filter(Boolean):p;
 const ordered=sorted(candidates,round),slots=Math.max(0,5-locked.length);
 const complete=candidates.length>0&&candidates.every(v=>count(v,round)>0);
 const edge=ordered[slots-1];let winners=locked.concat(ordered.slice(0,slots)),ties=[],fixed=locked.map(v=>v.id),missing=0,need=false;
 if(edge&&ordered.length>slots){const higher=ordered.filter(v=>compare(v,edge,round)>0),equal=ordered.filter(v=>compare(v,edge,round)===0);if(higher.length+equal.length>slots){need=true;winners=locked.concat(higher);ties=equal.map(v=>v.id);fixed=winners.map(v=>v.id);missing=slots-higher.length}}
 return {ranking:sorted(p,'main').map(v=>v.id),winners:winners.filter(v=>count(v,round)||locked.some(x=>x.id===v.id)).map(v=>v.id),tie:{required:need,complete,locked:fixed,candidates:ties,spots:missing,runoff}}
}
async function state(classId,name='',device=''){
 const [classes,srows]=await Promise.all([q('SELECT id,name,phase,created_at FROM turma_classes ORDER BY created_at'),q('SELECT * FROM turma_classes WHERE id=$1',[classId])]);
 const s=srows[0];if(!s)throw new Error('Turma não encontrada');
 const [rows,votes]=await Promise.all([
 q('SELECT p.id,p.student_name,p.app_name,p.created_at,p.vote_closed,p.retroactive_eligible,COUNT(v.id) FILTER(WHERE v.round=1)::int vote_count,COALESCE(SUM(v.score) FILTER(WHERE v.round=1),0)::int vote_sum,COUNT(v.id) FILTER(WHERE v.round=$2 AND $2>1)::int runoff_count,COALESCE(SUM(v.score) FILTER(WHERE v.round=$2 AND $2>1),0)::int runoff_sum FROM turma_projects p LEFT JOIN turma_votes v ON v.project_id=p.id WHERE p.class_id=$1 GROUP BY p.id ORDER BY p.created_at',[classId,s.runoff_round]),
 name&&device&&/^[A-Za-z0-9_-]{18,100}$/.test(device)?q('SELECT project_id,round,score FROM turma_votes WHERE voter_key=$1 AND device_id=$2 AND project_id IN (SELECT id FROM turma_projects WHERE class_id=$3)',[key(name),device,classId]):Promise.resolve([])
 ]);
 const projects=rows.map(p=>({...p,vote_count:Number(p.vote_count),vote_sum:Number(p.vote_sum),runoff_count:Number(p.runoff_count),runoff_sum:Number(p.runoff_sum),average:p.vote_count?Math.round(100*p.vote_sum/p.vote_count)/100:null,runoff_average:p.runoff_count?Math.round(100*p.runoff_sum/p.runoff_count)/100:null}));
 return {classes,settings:s,projects,...placement(projects,s),my_votes:votes.reduce((a,v)=>(a[v.round+'_'+v.project_id]=v.score,a),{}),server_time:new Date().toISOString()}
}
export default async function handler(req,res){
 const origin=req.headers.origin||'';
 if(origin&&origin!=='https://dev-gabriel-exe.github.io'&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin))return send(res,403,{error:'Origem não autorizada'});
 res.setHeader('Access-Control-Allow-Origin',origin||'*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Teacher-Pin');res.setHeader('Vary','Origin');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
 try{
 const u=new URL(req.url,'https://localhost');let data=req.body||{};if(typeof data==='string')data=JSON.parse(data);
 const all=await q('SELECT id FROM turma_classes ORDER BY created_at LIMIT 1');const classId=uuid(data.class_id||u.searchParams.get('class_id'))?(data.class_id||u.searchParams.get('class_id')):all[0]?.id;
 if(req.method==='GET')return send(res,200,await state(classId,tidy(u.searchParams.get('name')),u.searchParams.get('device')||''));
 if(req.method!=='POST')return send(res,405,{error:'Método não permitido'});
 const action=data.action;
 if(action==='login')return send(res,isTeacher(req)?200:401,isTeacher(req)?{ok:true}:{error:'Código incorreto'});
 if(action==='vote'){
 const name=tidy(data.name),device=String(data.device||''),score=Number(data.score);
 if(name.length<2||!uuid(data.project_id)||!/^[A-Za-z0-9_-]{18,100}$/.test(device)||!Number.isInteger(score)||score<0||score>10)return send(res,400,{error:'Informe nome e nota de 0 a 10'});
 const [s]=await q('SELECT * FROM turma_classes WHERE id=$1',[classId]);
 const [p]=await q('SELECT id,vote_closed,retroactive_eligible FROM turma_projects WHERE id=$1 AND class_id=$2',[data.project_id,classId]);
 if(!s||!p)return send(res,404,{error:'Turma ou aplicativo não encontrado'});
 let round=1,permitted=false;
 if(s.phase==='presentation')permitted=(s.active_vote_open&&s.active_project_id===p.id&&!p.vote_closed)||(s.retroactive_open&&p.retroactive_eligible);
 else if(s.phase==='voting')permitted=true;
 else if(s.phase==='runoff'){round=s.runoff_round;permitted=(s.runoff_candidates||[]).includes(p.id)}
 if(!permitted)return send(res,409,{error:'Esse aplicativo não está com votação aberta'});
 const rows=await q('INSERT INTO turma_votes(project_id,round,voter_name,voter_key,device_id,score) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id',[p.id,round,name,key(name),device,score]);
 return send(res,rows.length?201:409,rows.length?{ok:true,score}:{error:'Este nome ou aparelho já votou nesse aplicativo'})
 }
 if(!isTeacher(req))return send(res,401,{error:'Entre com o código do professor'});
 if(action==='create_class'){const name=tidy(data.name,100);if(name.length<2)return send(res,400,{error:'Informe o nome da turma'});const r=await q('INSERT INTO turma_classes(name) VALUES($1) RETURNING id',[name]);return send(res,201,{ok:true,id:r[0].id})}
 const [s]=await q('SELECT * FROM turma_classes WHERE id=$1',[classId]);
 if(!s)return send(res,404,{error:'Turma inexistente'});
 if(action==='add'){
 if(s.phase!=='presentation'||s.active_vote_open)return send(res,409,{error:'Encerre a votação do projeto atual primeiro'});
 const student=tidy(data.student_name),app=tidy(data.app_name);if(student.length<2||app.length<2)return send(res,400,{error:'Preencha o nome do aluno e o aplicativo'});
 const r=await q('INSERT INTO turma_projects(class_id,student_name,app_name) VALUES($1,$2,$3) RETURNING id',[classId,student,app]);
 await q('UPDATE turma_classes SET active_project_id=$1 WHERE id=$2',[r[0].id,classId]);return send(res,201,{ok:true})
 }
 if(action==='active'||action==='edit'){
 if(s.phase!=='presentation'||s.active_vote_open||!uuid(data.id))return send(res,409,{error:'Encerre a votação do aplicativo atual primeiro'});
 const [p]=await q('SELECT id,vote_closed,retroactive_eligible FROM turma_projects WHERE id=$1 AND class_id=$2',[data.id,classId]);if(!p)return send(res,404,{error:'Projeto não encontrado'});
 if(action==='active'){if(p.vote_closed)return send(res,409,{error:'Projeto já avaliado. Use a recuperação excepcional se estiver disponível'});await q('UPDATE turma_classes SET active_project_id=$1 WHERE id=$2',[p.id,classId])}
 else{if(tidy(data.student_name).length<2||tidy(data.app_name).length<2)return send(res,400,{error:'Informe nomes válidos'});await q('UPDATE turma_projects SET student_name=$1,app_name=$2 WHERE id=$3',[tidy(data.student_name),tidy(data.app_name),p.id])}
 return send(res,200,{ok:true})
 }
 if(action==='open_current'||action==='open'){
 if(s.phase!=='presentation'||s.active_vote_open||!s.active_project_id)return send(res,409,{error:'Selecione um aplicativo e encerre a votação anterior'});
 const [p]=await q('SELECT vote_closed FROM turma_projects WHERE id=$1 AND class_id=$2',[s.active_project_id,classId]);
 if(!p||p.vote_closed)return send(res,409,{error:'Essa votação já foi encerrada'});
 await q('UPDATE turma_classes SET active_vote_open=true WHERE id=$1',[classId]);return send(res,200,{ok:true})
 }
 if(action==='close_current'){
 if(s.phase!=='presentation'||!s.active_vote_open)return send(res,409,{error:'Nenhuma votação do palco está aberta'});
 await q('UPDATE turma_classes SET active_vote_open=false WHERE id=$1',[classId]);await q('UPDATE turma_projects SET vote_closed=true WHERE id=$1',[s.active_project_id]);return send(res,200,{ok:true})
 }
 if(action==='open_retro'){
 if(s.phase!=='presentation'||s.retroactive_used||s.retroactive_open)return send(res,409,{error:'A recuperação extraordinária já foi utilizada ou encerrada'});
 const eligible=await q('SELECT id FROM turma_projects WHERE class_id=$1 AND retroactive_eligible=true',[classId]);
 if(!eligible.length)return send(res,409,{error:'Não existem projetos elegíveis para recuperação'});
 await q('UPDATE turma_classes SET retroactive_open=true WHERE id=$1',[classId]);return send(res,200,{ok:true})
 }
 if(action==='close_retro'){
 if(!s.retroactive_open)return send(res,409,{error:'Recuperação não está aberta'});
 await q('UPDATE turma_classes SET retroactive_open=false,retroactive_used=true WHERE id=$1',[classId]);return send(res,200,{ok:true})
 }
 if(action==='finish'||action==='runoff'){
 if(s.active_vote_open||s.retroactive_open||!['presentation','voting','runoff'].includes(s.phase))return send(res,409,{error:'Encerre as votações abertas antes de finalizar'});
 const snapshot=await state(classId),rank=placement(snapshot.projects,s);
 if(!rank.tie.complete)return send(res,409,{error:'Ainda existem aplicativos sem avaliação. Abra as estrelas para os pendentes.'});
 if(action==='finish'){if(rank.tie.required)return send(res,409,{error:'Há empate na quinta posição; inicie o desempate'});await q("UPDATE turma_classes SET phase='closed' WHERE id=$1",[classId]);return send(res,200,{ok:true})}
 if(!rank.tie.required)return send(res,409,{error:'Não há empate que afete o Top 5'});
 await q("UPDATE turma_classes SET phase='runoff',runoff_round=runoff_round+1,locked_ids=$1::jsonb,runoff_candidates=$2::jsonb WHERE id=$3",[JSON.stringify(rank.tie.locked),JSON.stringify(rank.tie.candidates),classId]);return send(res,200,{ok:true})
 }
 return send(res,400,{error:'Ação desconhecida'})
 }catch(err){console.error('mostra-votacao',err.code||err.message);return send(res,500,{error:'Não foi possível consultar ou registrar a votação'})}
}