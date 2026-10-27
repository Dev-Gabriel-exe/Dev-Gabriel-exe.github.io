const {neon}=require('@neondatabase/serverless');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const ROOM='PITGAME26';
const ALLOWED=new Set(['https://dev-gabriel-exe.github.io','https://pit-game-jam-chat.vercel.app']);
const hash=s=>createHash('sha256').update(s).digest('hex');
const safeEq=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)};
const cleanText=(s,max)=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const err=(res,status,error)=>res.status(status).json({ok:false,error});
const sqlFactory=()=>neon(process.env.DATABASE_URL);
async function teacherAuth(req){const pin=String(req.headers['x-pit-teacher-pin']||'');return pin.length>=16&&safeEq(pin,process.env.PIT_TEACHER_PIN||'')}
async function studentAuth(req,sql){const token=String(req.headers['x-pit-student-token']||'');if(!/^[0-9a-f]{64}$/.test(token))return null;const rows=await sql`SELECT id, display_name FROM pit_students WHERE token_hash=${hash(token)} AND room_code=${ROOM} LIMIT 1`;return rows[0]||null}
module.exports=async function handler(req,res){
 const origin=req.headers.origin;
 if(origin&&ALLOWED.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-PIT-Teacher-Pin, X-PIT-Student-Token');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS')return origin&&!ALLOWED.has(origin)?err(res,403,'Origem não autorizada'):res.status(204).end();
 if(origin&&!ALLOWED.has(origin))return err(res,403,'Origem não autorizada');
 if(!process.env.DATABASE_URL||!process.env.PIT_TEACHER_PIN)return err(res,503,'Chat não configurado');
 const action=String(req.query.action||req.body?.action||'').slice(0,30);const sql=sqlFactory();
 try{
  if(req.method==='GET'&&action==='health')return res.status(200).json({ok:true,chat:true});
  if(req.method==='POST'&&action==='join'){
   if(cleanText(req.body?.code,18).toUpperCase()!==ROOM)return err(res,403,'Código da turma inválido.');
   const displayName=cleanText(req.body?.name,56);if(displayName.length<2)return err(res,400,'Informe um nome ou apelido de 2 a 56 caracteres.');
   const count=await sql`SELECT count(*)::integer AS n FROM pit_students WHERE room_code=${ROOM}`;
   if(count[0].n>=90)return err(res,429,'Turma atingiu o limite de cadastros.');
   const token=randomBytes(32).toString('hex');
   const rows=await sql`INSERT INTO pit_students(room_code,display_name,token_hash) VALUES(${ROOM},${displayName},${hash(token)}) RETURNING id,display_name`;
   return res.status(201).json({ok:true,studentId:rows[0].id,name:rows[0].display_name,token,code:ROOM});
  }
  if(req.method==='POST'&&action==='teacher-login'){
   if(!await teacherAuth(req))return err(res,403,'Código de acesso do professor inválido.');
   return res.status(200).json({ok:true,room:ROOM});
  }
  if(req.method==='GET'&&action==='threads'){
   if(!await teacherAuth(req))return err(res,403,'Acesso do professor não autorizado.');
   const threads=await sql`SELECT s.id,s.display_name,s.joined_at,
     (SELECT body FROM pit_chat_messages m WHERE m.student_id=s.id ORDER BY m.id DESC LIMIT 1) AS last_body,
     (SELECT author FROM pit_chat_messages m WHERE m.student_id=s.id ORDER BY m.id DESC LIMIT 1) AS last_author,
     (SELECT created_at FROM pit_chat_messages m WHERE m.student_id=s.id ORDER BY m.id DESC LIMIT 1) AS last_at,
     (SELECT count(*)::int FROM pit_chat_messages m WHERE m.student_id=s.id AND m.author='student' AND m.read_at IS NULL) AS unread
     FROM pit_students s WHERE s.room_code=${ROOM} ORDER BY unread DESC NULLS LAST,last_at DESC NULLS LAST,s.joined_at DESC LIMIT 100`;
   return res.status(200).json({ok:true,threads});
  }
  if(req.method==='GET'&&action==='messages'){
   const teacher=await teacherAuth(req);let id;
   if(teacher){id=String(req.query.studentId||'');if(!/^[0-9a-f-]{36}$/.test(id))return err(res,400,'Aluno inválido.');}
   else{const me=await studentAuth(req,sql);if(!me)return err(res,401,'Sessão do aluno inválida. Entre novamente.');id=me.id;}
   const messages=await sql`SELECT id,author,mission,body,created_at,read_at FROM pit_chat_messages WHERE student_id=${id}::uuid AND room_code=${ROOM} ORDER BY id DESC LIMIT 80`;
   return res.status(200).json({ok:true,messages:messages.reverse()});
  }
  if(req.method==='POST'&&action==='send'){
   const teacher=await teacherAuth(req);let id;
   if(teacher){id=String(req.body?.studentId||'');if(!/^[0-9a-f-]{36}$/.test(id))return err(res,400,'Escolha um aluno.');
     const exists=await sql`SELECT id FROM pit_students WHERE id=${id}::uuid AND room_code=${ROOM} LIMIT 1`;if(!exists.length)return err(res,404,'Aluno não encontrado.');}
   else{const me=await studentAuth(req,sql);if(!me)return err(res,401,'Sessão inválida; entre novamente.');id=me.id;}
   const body=cleanText(req.body?.body,1200);if(body.length<2)return err(res,400,'Digite uma mensagem de pelo menos 2 caracteres.');
   const author=teacher?'teacher':'student';
   const burst=await sql`SELECT count(*)::int AS n FROM pit_chat_messages WHERE student_id=${id}::uuid AND author=${author} AND created_at>now()-interval '1 minute'`;
   if(burst[0].n>=12)return err(res,429,'Limite temporário de mensagens. Tente novamente em um minuto.');
   const missionRaw=Number(req.body?.mission);const mission=Number.isInteger(missionRaw)&&missionRaw>=1&&missionRaw<=6?missionRaw:null;
   const result=await sql`INSERT INTO pit_chat_messages(room_code,student_id,author,mission,body) VALUES(${ROOM},${id}::uuid,${author},${mission},${body}) RETURNING id`;
   return res.status(201).json({ok:true,id:result[0].id});
  }
  if(req.method==='POST'&&action==='read'){
   const teacher=await teacherAuth(req);let id,author;
   if(teacher){id=String(req.body?.studentId||'');if(!/^[0-9a-f-]{36}$/.test(id))return err(res,400,'Aluno inválido.');author='student';}
   else{const me=await studentAuth(req,sql);if(!me)return err(res,401,'Sessão inválida.');id=me.id;author='teacher';}
   await sql`UPDATE pit_chat_messages SET read_at=now() WHERE student_id=${id}::uuid AND room_code=${ROOM} AND author=${author} AND read_at IS NULL`;
   return res.status(200).json({ok:true});
  }
  return err(res,404,'Operação desconhecida');
 }catch(e){console.error('chat api:',e?.code||e?.name||'failure');return err(res,500,'Falha temporária no chat. Tente novamente.');}
};