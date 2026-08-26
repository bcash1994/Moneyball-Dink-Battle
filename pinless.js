// Live sync overrides for Moneyball Dink Battle
// Uses Supabase anonymous JWT for browser read/write through RLS policies.
PB.supabaseKey='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZGV6cHhzZ2V0ZG9ucmpoY2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTEyNDIsImV4cCI6MjEwMzMyNzI0Mn0.z0fWkTqIjK2kUEXqUKKPQTG63isK7aAO8WBgDy7uzD4';

PB.headers=function(){
  return {
    apikey:this.supabaseKey,
    Authorization:`Bearer ${this.supabaseKey}`,
    'Content-Type':'application/json'
  };
};

PB.queuePublish=function(){
  if(this.mode!=='manager') return;
  clearTimeout(this.publishTimer);
  this.status('Syncing changes...');
  this.publishTimer=setTimeout(()=>this.publish(true).catch(e=>this.status('Sync error: '+e.message)),500);
};

PB.publish=async function(silent=false){
  if(!this.S) throw Error('Tournament data is not loaded');
  this.status('Publishing live scores...');
  this.S.updatedAt=new Date().toISOString();
  const url=`${this.supabaseUrl}/rest/v1/moneyball_scores?tournament_size=eq.${this.N}`;
  const r=await fetch(url,{
    method:'PATCH',
    headers:{...this.headers(),Prefer:'return=representation'},
    body:JSON.stringify({data:this.S,updated_at:this.S.updatedAt})
  });
  if(!r.ok){
    let e=await r.json().catch(()=>({}));
    throw Error(e.message||`Live sync failed (${r.status})`);
  }
  const rows=await r.json().catch(()=>[]);
  if(!rows.length) throw Error('Database did not accept the update');
  this.persistSilent();
  this.status('Live sync ✓');
  if(!silent) alert('Live scores updated. Players will see the changes within a few seconds.');
};

PB.resetTournament=async function(){
  const ok=confirm(`Reset the ${this.N} player tournament from the beginning? This will clear player names, scores, standings, qualifiers, and final results for this tournament size.`);
  if(!ok) return;
  clearTimeout(this.publishTimer);
  try{localStorage.removeItem(this.localKey(this.N));}catch(e){}
  this.S=this.fresh(this.N);
  this.render();
  this.status('Resetting tournament...');
  try{
    await this.publish(true);
    this.status('Tournament reset ✓');
    alert('Tournament reset complete. The View Only page has also been reset.');
  }catch(e){
    this.status('Reset sync error: '+e.message);
    alert('Tournament reset locally, but live sync failed: '+e.message);
  }
};

PB.byeHTML=function(t,r){
  const total=t==='r1'?this.N:this.A;
  const used=new Set();
  r.games.forEach(g=>{g.a.forEach(i=>used.add(i));g.b.forEach(i=>used.add(i));});
  const resting=[];
  for(let i=0;i<total;i++) if(!used.has(i)) resting.push(i);
  if(!resting.length) return '';
  const labels=resting.map(i=>this.esc(this.name(t,i)));
  let text='';
  if(r.db&&r.db.length===2){
    const a=this.esc(this.name(t,r.db[0])), b=this.esc(this.name(t,r.db[1]));
    const extra=resting.filter(i=>!r.db.includes(i)).map(i=>this.esc(this.name(t,i)));
    text=`<div class="byeBanner">🏓 BYE TEAM: ${a} + ${b}${extra.length?` &nbsp; • &nbsp; ROTATION REST: ${extra.join(', ')}`:''}</div>`;
  }else{
    text=`<div class="byeBanner">🏓 BYE / REST: ${labels.join(', ')}</div>`;
  }
  return text;
};

PB.renderGames=function(t){
  let box=document.getElementById(t+'games');
  if(!box)return;
  if(t==='r2'&&!this.S.q){box.innerHTML='<p class="note">Round 2 has not started.</p>';return;}
  let rs=t==='r1'?this.S.r1:this.S.r2,
      f=document.getElementById(t+'RoundFilter');
  if(f&&f.value!=='all')rs=rs.filter(r=>String(r.round)===f.value);
  box.innerHTML=rs.map(r=>`<div class="round">Round ${r.round}</div>${this.byeHTML(t,r)}${r.games.map(g=>this.gameHTML(t,g)).join('')}`).join('');
};

PB.init=async function(mode){
  this.mode=mode;
  if(mode==='manager'){
    let share=document.getElementById('shareLink');
    if(share)share.value='https://bcash1994.github.io/Moneyball-Dink-Battle/';
    let copy=document.getElementById('copyBtn');
    if(copy)copy.onclick=()=>navigator.clipboard.writeText(share.value);
    await this.load(15);
    this.status('Loading saved 15 player tournament...');
    setTimeout(()=>this.publish(true).catch(e=>this.status('Sync error: '+e.message)),700);
  }else{
    await this.load(15);
    setInterval(()=>this.load(this.N),2000);
  }
};
