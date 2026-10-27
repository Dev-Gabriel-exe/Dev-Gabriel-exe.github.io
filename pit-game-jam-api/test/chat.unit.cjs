const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const students=[], messages=[];
const ROOM='PITGAME26';
const uuid=()=>crypto.randomUUID();
const sql=async (tpl,...args)=>{
 const text=tpl.join('?').replace(/\s+/g,' ');
 if(text.includes('count(*)::integer AS n FROM pit_students'))return [{n:students.length}];
 if(text.includes('INSERT INTO pit_students')){const s={id:uuid(),room_code:args[0],display_name:args[1],token_hash:args[2]};students.push(s);return [{id:s.id,display_name:s.display_name}];}
 if(text.includes('SELECT id, display_name FROM pit_students WHERE token_hash'))return students.filter(s=>s.token_hash===args[0]&&s.room_code===args[1]);
 if(text.includes('FROM pit_students s WHERE s.room_code'))return students.map(s=>({id:s.id,display_name:s.display_name,last_body:messages.at(-1)?.body||null,unread:messages.filter(m=>m.student_id===s.id&&m.author==='student'&&!m.read_at).length}));
 if(text.includes('SELECT id,author,mission,body,created_at,read_at FROM pit_chat_messages'))return messages.filter(m=>m.student_id===args[0]).reverse().slice(0,80);
 if(text.includes('SELECT id FROM pit_students WHERE id'))return students.filter(s=>s.id===args[0]);
 if(text.includes('SELECT count(*)::int AS n FROM pit_chat_messages'))return [{n:messages.filter(m=>m.student_id===args[0]&&m.author===args[1]).length}];
 if(text.includes('INSERT INTO pit_chat_messages')){const m={id:messages.length+1,room_code:args[0],student_id:args[1],author:args[2],mission:args[3],body:args[4],created_at:new Date().toISOString(),read_at:null};messages.push(m);return [{id:m.id}];}
 if(text.includes('UPDATE pit_chat_messages SET read_at')){messages.filter(m=>m.student_id===args[0]&&m.author===args[2]).forEach(m=>m.read_at=new Date().toISOString());return [];}
 throw Error('Unexpected SQL: '+text.slice(0,180));
};
const moduleMock={exports:{}};
const mockRequire=(name)=>name==='@neondatabase/serverless'?{neon:()=>sql}:require(name);
vm.runInNewContext(fs.readFileSync('pit-game-jam-api/api/chat.js','utf8'),{module:moduleMock,require:mockRequire,Buffer,console,process:{env:{DATABASE_URL:'mock',PIT_TEACHER_PIN:'test-teacher-secret-123456789'}}});
const api=moduleMock.exports;
const call=async(method,action,body={},headers={})=>{
 let status=200,result=null;
 const res={setHeader(){return this},status(n){status=n;return this},json(v){result=v;return this},end(){result={ok:true};return this}};
 await api({method,query:{action,studentId:body.studentId},body,headers},res);
 return {status,result};
};
(async()=>{
 assert.equal((await call('GET','health')).status,200);
 assert.equal((await call('POST','join',{code:'FAKE',name:'Carlos'})).status,403);
 const c=await call('POST','join',{code:ROOM,name:'Aluno 01'});
 assert.equal(c.status,201);assert.equal(c.result.token.length,64);
 const d=await call('POST','join',{code:ROOM,name:'Aluno 02'});
 assert.equal(d.status,201);
 const hdr={'x-pit-student-token':c.result.token};
 assert.equal((await call('GET','threads')).status,403);
 assert.equal((await call('POST','send',{body:'Olá, sou aluno 01',mission:2},hdr)).status,201);
 assert.equal((await call('GET','messages',{},hdr)).result.messages.length,1);
 const hdrOther={'x-pit-student-token':d.result.token};
 assert.equal((await call('GET','messages',{studentId:c.result.studentId},hdrOther)).result.messages.length,0,'student must not read another student');
 assert.equal((await call('POST','teacher-login',{},{'x-pit-teacher-pin':'wrong'})).status,403);
 const teacher={'x-pit-teacher-pin':'test-teacher-secret-123456789'};
 assert.equal((await call('POST','teacher-login',{},teacher)).status,200);
 assert.equal((await call('GET','threads',{},teacher)).result.threads.length,2);
 assert.equal((await call('POST','send',{studentId:c.result.studentId,body:'Vamos testar o Preview?',mission:2},teacher)).status,201);
 assert.equal((await call('GET','messages',{},hdr)).result.messages.length,2);
 assert.equal((await call('GET','messages',{},hdrOther)).result.messages.length,0);
 assert.equal((await call('POST','send',{body:' '},hdr)).status,400);
 console.log('PASS: health, room join, student scoped read/send, teacher authentication, personal response, invalid body');
})().catch(e=>{console.error(e);process.exitCode=1});