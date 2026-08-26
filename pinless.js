// Live sync overrides for Moneyball Dink Battle
// Uses Supabase anonymous JWT for browser read/write through RLS policies.
PB.supabaseKey='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZGV6cHhzZ2V0ZG9ucmpoY2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTEyNDIsImV4cCI6MjEwMzMyNzI0Mn0.z0fWkTqIjK2kUEXqUKKPQTG63isK7aAO8WBgDy7uzD4';

PB.headers=function(){return{apikey:this.supabaseKey,Authorization:`Bearer ${this.supabaseKey}`,'Content-Type':'application/json'};};

// Balanced 15 player Round 1: 15 rounds, 3 games each round, exactly 3 rests and 12 games per player.
PB.originalStage=PB.stage;
PB.stage=function(n,p){
  if(n!==15||p!=='R1') return this.originalStage(n,p);
  const out=[];
  for(let r=0;r<15;r++){
    const rest=new Set([r,(r+5)%15,(r+10)%15]);
    const active=[];
    for(let k=0;k<15;k++){
      const i=(r+k)%15;
      if(!rest.has(i)) active.push(i);
    }
    const games=[];
    for(let g=0;g<3;g++){
      const q=active.slice(g*4,g*4+4);
      games.push({id:`R1-R${r+1}-G${g+1}`,round:r+1,a:[q[0],q[1]],b:[q[2],q[3]],sa:'',sb:'',st:'pending'});
    }
    out.push({round:r+1,games,db:null,rests:[...rest]});
  }
  return out;
};

PB.gameKey=function(g){
  const a=[...g.a].sort((x,y)=>x-y).join('-'),b=[...g.b].sort((x,y)=>x-y).join('-');
  return [a,b].sort().join('|');
};

PB.ensureBalanced15=function(){
  if(this.N!==15||!this.S||this.S.scheduleVersion==='balanced15-v1') return false;
  const old=(this.S.r1||[]).flatMap(r=>r.games||[]), saved=new Map(old.map(g=>[this.gameKey(g),g]));
  const fresh=this.stage(15,'R1');
  fresh.forEach(r=>r.games.forEach(g=>{
    const prev=saved.get(this.gameKey(g));
    if(prev){g.sa=prev.sa;g.sb=prev.sb;g.st=prev.st;}
  }));
  this.S.r1=fresh;
  this.S.scheduleVersion='balanced15-v1';
  this.S.q=null;this.S.r2=this.originalStage(this.A,'R2');this.S.f=null;
  this.S.fs=[1,2,3].map(i=>({id:`FINAL-${i}`,sa:'',sb:'',st:'pending'}));
  this.persistSilent();
  return true;
};

PB.queuePublish=function(){if(this.mode!=='manager')return;clearTimeout(this.publishTimer);this.status('Syncing changes...');this.publishTimer=setTimeout(()=>this.publish(true).catch(e=>this.status('Sync error: '+e.message)),500);};

PB.publish=async function(silent=false){
  if(!this.S)throw Error('Tournament data is not loaded');
  this.status('Publishing live scores...');this.S.updatedAt=new Date().toISOString();
  const url=`${this.supabaseUrl}/rest/v1/moneyball_scores?tournament_size=eq.${this.N}`;
  const r=await fetch(url,{method:'PATCH',headers:{...this.headers(),Prefer:'return=representation'},body:JSON.stringify({data:this.S,updated_at:this.S.updatedAt})});
  if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.message||`Live sync failed (${r.status})`);}
  const rows=await r.json().catch(()=>[]);if(!rows.length)throw Error('Database did not accept the update');
  this.persistSilent();this.status('Live sync ✓');if(!silent)alert('Live scores updated. Players will see the changes within a few seconds.');
};

PB.resetTournament=async function(){
  const ok=confirm(`Reset the ${this.N} player tournament from the beginning? This will clear player names, scores, standings, qualifiers, and final results for this tournament size.`);if(!ok)return;
  clearTimeout(this.publishTimer);try{localStorage.removeItem(this.localKey(this.N));}catch(e){}
  this.S=this.fresh(this.N);if(this.N===15)this.S.scheduleVersion='balanced15-v1';this.render();this.status('Resetting tournament...');
  try{await this.publish(true);this.status('Tournament reset ✓');alert('Tournament reset complete. The View Only page has also been reset.');}catch(e){this.status('Reset sync error: '+e.message);alert('Tournament reset locally, but live sync failed: '+e.message);}
};

PB.byeHTML=function(t,r){
  const total=t==='r1'?this.N:this.A,used=new Set();r.games.forEach(g=>{g.a.forEach(i=>used.add(i));g.b.forEach(i=>used.add(i));});
  const resting=[];for(let i=0;i<total;i++)if(!used.has(i))resting.push(i);if(!resting.length)return'';
  const labels=resting.map(i=>this.esc(this.name(t,i)));
  return `<div class="byeBanner">🏓 BYE / REST: ${labels.join(', ')}</div>`;
};

PB.renderGames=function(t){
  let box=document.getElementById(t+'games');if(!box)return;if(t==='r2'&&!this.S.q){box.innerHTML='<p class="note">Round 2 has not started.</p>';return;}
  let rs=t==='r1'?this.S.r1:this.S.r2,f=document.getElementById(t+'RoundFilter');if(f&&f.value!=='all')rs=rs.filter(r=>String(r.round)===f.value);
  box.innerHTML=rs.map(r=>`<div class="round">Round ${r.round}</div>${this.byeHTML(t,r)}${r.games.map(g=>this.gameHTML(t,g)).join('')}`).join('');
};

PB.init=async function(mode){
  this.mode=mode;
  if(mode==='manager'){
    let share=document.getElementById('shareLink');if(share)share.value='https://bcash1994.github.io/Moneyball-Dink-Battle/';let copy=document.getElementById('copyBtn');if(copy)copy.onclick=()=>navigator.clipboard.writeText(share.value);
    await this.load(15);const changed=this.ensureBalanced15();this.render();this.status(changed?'Balanced 15 player schedule loaded. Syncing...':'Loading saved 15 player tournament...');setTimeout(()=>this.publish(true).catch(e=>this.status('Sync error: '+e.message)),700);
  }else{
    await this.load(15);this.ensureBalanced15();this.render();setInterval(async()=>{await this.load(this.N);this.ensureBalanced15();this.render();},2000);
  }
};
