import { getStore } from '@netlify/blobs';

const QUESTIONS = [
  { category:'SCIENCE', question:'Which planet is known as the Red Planet?', answers:['Venus','Mars','Mercury','Jupiter'], correct:1 },
  { category:'GEOGRAPHY', question:'What is the capital city of Japan?', answers:['Kyoto','Osaka','Tokyo','Sapporo'], correct:2 },
  { category:'TECHNOLOGY', question:'What does CPU stand for?', answers:['Central Processing Unit','Computer Power Utility','Core Program Upload','Central Performance User'], correct:0 },
  { category:'NATURE', question:'What is the largest mammal on Earth?', answers:['African elephant','Giraffe','Blue whale','Orca'], correct:2 },
  { category:'HISTORY', question:'The ancient Olympic Games began in which country?', answers:['Italy','Greece','Egypt','Turkey'], correct:1 },
  { category:'SPACE', question:'Which star is closest to Earth?', answers:['Sirius','Proxima Centauri','The Sun','Polaris'], correct:2 },
  { category:'LITERATURE', question:'Who wrote Romeo and Juliet?', answers:['Charles Dickens','Jane Austen','William Shakespeare','Mark Twain'], correct:2 },
  { category:'MATH', question:'What is 12 × 8?', answers:['84','88','96','108'], correct:2 },
  { category:'FOOD', question:'Which ingredient is traditionally used to make guacamole?', answers:['Cucumber','Avocado','Green peas','Zucchini'], correct:1 },
  { category:'GENERAL KNOWLEDGE', question:'How many sides does a hexagon have?', answers:['Five','Six','Seven','Eight'], correct:1 }
];
const headers = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const id = () => crypto.randomUUID();
const safeName = value => String(value || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 18) || 'Player';
const currentQuestion = room => QUESTIONS[room.questionOrder?.[room.questionIndex] ?? room.questionIndex];
const publicRoom = room => ({
  code: room.code, status: room.status, hostId: room.hostId, players: room.players.map(p => ({ id:p.id, name:p.name, score:p.score, host:p.id===room.hostId, answered:room.answers?.[p.id] !== undefined })),
  questionIndex: room.questionIndex, totalQuestions: 10, deadline: room.deadline || null,
  question: room.status === 'playing' ? { category:currentQuestion(room).category, question:currentQuestion(room).question, answers:currentQuestion(room).answers } : null,
  results: room.status === 'results' ? { correctAnswer:currentQuestion(room).correct, answerText:currentQuestion(room).answers[currentQuestion(room).correct], scores:room.players.map(p=>({id:p.id,name:p.name,score:p.score})) } : null,
  winner: room.status === 'finished' ? [...room.players].sort((a,b)=>b.score-a.score)[0]?.name || null : null
});
async function withRoomLock(store, roomCode, operation) {
  const key = `lock:${roomCode}`;
  const token = JSON.stringify({ token:id(), at:Date.now() });
  let acquired = false;
  for (let attempt=0; attempt<30; attempt++) {
    try { await store.set(key, token, { onlyIfNew:true }); acquired = true; break; }
    catch (error) {
      const existing = await store.get(key, { type:'json' }).catch(()=>null);
      if (!existing || Date.now() - Number(existing.at || 0) > 8000) {
        if (existing) await store.delete(key).catch(()=>{});
      } else await new Promise(resolve=>setTimeout(resolve, 35 + attempt*8));
    }
  }
  if (!acquired) throw Object.assign(new Error('Room is busy. Please retry.'), { status:409 });
  try { return await operation(); }
  finally {
    const current = await store.get(key, { type:'json' }).catch(()=>null);
    if (current?.token && JSON.parse(token).token === current.token) await store.delete(key).catch(()=>{});
  }
}
export default async request => {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'}});
  if (request.method !== 'POST') return reply(405,{error:'Use POST.'});
  let input; try { input = await request.json(); } catch { return reply(400,{error:'Invalid JSON.'}); }
  const action = String(input.action || '');
  const store = getStore({ name:'quiz-battle-rooms', consistency:'strong' });
  try {
    if (action === 'create') {
      const player = { id:id(), name:safeName(input.name), score:0 };
      let roomCode, room;
      for (let i=0;i<8;i++) { roomCode=code(); if (!await store.get(`room:${roomCode}`)) break; }
      room = { code:roomCode, hostId:player.id, players:[player], status:'lobby', questionIndex:0, answers:{}, deadline:null, createdAt:Date.now() };
      await store.setJSON(`room:${roomCode}`,room,{onlyIfNew:true});
      return reply(200,{playerId:player.id, room:publicRoom(room)});
    }
    const roomCode = String(input.code || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) return reply(400,{error:'Enter a valid six-character room code.'});
    return await withRoomLock(store,roomCode,async()=>{
      const key=`room:${roomCode}`; const room=await store.get(key,{type:'json'});
      if (!room) return reply(404,{error:'Room not found. Check the code and try again.'});
      if (action === 'join') {
        if (room.status !== 'lobby') return reply(409,{error:'This game has already started.'});
        if (room.players.length >= 8) return reply(409,{error:'This room is full.'});
        const name=safeName(input.name); if (room.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return reply(409,{error:'That name is already in this room.'});
        const player={id:id(),name,score:0}; room.players.push(player); await store.setJSON(key,room);
        return reply(200,{playerId:player.id,room:publicRoom(room)});
      }
      const player=room.players.find(p=>p.id===input.playerId);
      if (action !== 'state' && !player) return reply(403,{error:'This player is not a member of the room.'});
      if (action === 'state') {
        if (room.status==='playing' && Date.now()>=room.deadline) { room.status='results'; await store.setJSON(key,room); }
        return reply(200,{room:publicRoom(room)});
      }
      if (action === 'start') {
        if (input.playerId!==room.hostId) return reply(403,{error:'Only the host can start the game.'});
        if (room.status!=='lobby') return reply(409,{error:'The game has already started.'});
        if (room.players.length<2) return reply(409,{error:'At least two players are required.'});
        room.questionOrder=QUESTIONS.map((_,i)=>i).sort(()=>Math.random()-.5); room.questionIndex=0; room.answers={}; room.status='playing'; room.deadline=Date.now()+15000;
        await store.setJSON(key,room); return reply(200,{room:publicRoom(room)});
      }
      if (action === 'answer') {
        if (room.status!=='playing') return reply(409,{error:'This question is not accepting answers.'});
        if (Date.now()>=room.deadline) { room.status='results'; await store.setJSON(key,room); return reply(409,{error:'Time is up.'}); }
        if (room.answers[player.id]!==undefined) return reply(409,{error:'You have already answered this question.'});
        const choice=Number(input.choice); if (!Number.isInteger(choice)||choice<0||choice>3) return reply(400,{error:'Choose one of the four answers.'});
        const q=currentQuestion(room); const elapsed=Date.now()-(room.deadline-15000); const points=choice===q.correct ? 100+Math.max(0,Math.round(50*(1-elapsed/15000))) : 0;
        room.answers[player.id]={choice,points,answeredAt:Date.now()}; player.score+=points;
        if (Object.keys(room.answers).length===room.players.length || Date.now()>=room.deadline) room.status='results';
        await store.setJSON(key,room); return reply(200,{points,correct:choice===q.correct,room:publicRoom(room)});
      }
      if (action === 'next') {
        if (input.playerId!==room.hostId) return reply(403,{error:'Only the host can advance the round.'});
        if (room.status!=='results') return reply(409,{error:'Wait until the question ends.'});
        if (room.questionIndex>=9) room.status='finished';
        else { room.questionIndex++; room.answers={}; room.status='playing'; room.deadline=Date.now()+15000; }
        await store.setJSON(key,room); return reply(200,{room:publicRoom(room)});
      }
      if (action === 'leave') {
        if (room.status==='lobby') { room.players=room.players.filter(p=>p.id!==player.id); if (!room.players.length) { await store.delete(key); return reply(200,{left:true}); } if (room.hostId===player.id) room.hostId=room.players[0].id; await store.setJSON(key,room); }
        return reply(200,{left:true});
      }
      return reply(400,{error:'Unknown action.'});
    });
  } catch (error) { return reply(error.status || 500,{error:error.status ? error.message : 'Server error. Please retry.'}); }
};
