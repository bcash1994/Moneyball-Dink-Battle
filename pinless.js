// Live sync overrides for Moneyball Dink Battle
PB.supabaseKey='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4ZGV6cHhzZ2V0ZG9ucmpoY2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTEyNDIsImV4cCI6MjEwMzMyNzI0Mn0.z0fWkTqIjK2kUEXqUKKPQTG63isK7aAO8WBgDy7uzD4';

PB.headers=function(){return{apikey:this.supabaseKey,Authorization:`Bearer ${this.supabaseKey}`,'Content-Type':'application/json'};};

// Preserve the original circle-method scheduler for every tournament size.
PB.originalStage=PB.stage;

// For 15-player Round 1, choose one real pair to rest in each round.
// Combined with the automatic single-player bye from the circle method,
// this creates exactly 3 rests and exactly 12 games for every player.
PB.balanced15RestPairs=[
  [1,14],[2,11],[0,13],[3,6],[12,10],
  [11,9],[10,8],[9,7],[13,1],[8,4],
  [6,4],[5,3],[7,14],[0,2],[5,12]
];

PB.samePair=function(a,b){return a&&b&&a.length===2&&b.length===2&&((a[0]===b[0]&&a[1]===b[1])||(a[0]===b[1]&&a[1]===b[0]));};

PB.stage=function(n,p){
  const base=this.originalStage(n,p);
  if(n!==15||p!=='R1')return base;

  return base.map((r,ri)=>{
    const pairs=[];
    r.games.forEach(g=>{pairs.push([...g.a]);pairs.push([...g.b]);});
    if(r.db)pairs.push([...r.db]);

    const target=this.balanced15RestPairs[ri];
    const restIndex=pairs.findIndex(pair=>this.samePair(pair,target));
    if(restIndex<0)return r;

    const restPair=pairs.splice(restIndex,1)[0];
    const games=[];
    for(let i=0;i<pairs.length;i+=2){
      games.push({id:`R1-R${ri+1}-G${games.length+1}`,round:ri+1,a:pairs[i],b:pairs[i+1],sa:'',sb:'',st:'pending'});
    }
    return{round:ri+1,games,db:restPair};
  });
};

PB.gameKey=function(g){
  const a=[...g.a].sort((x,y)=>x-y).join('-'),b=[...g.b].sort((x,y)=>x-y).join('-');
  return[a,b].sort().join('|');
};

PB.ensureBalanced15=function(){
  if(this.N!==15||!this.S||this.S.scheduleVersion==='balanced15-v2')return false;

  const old=(this.S.r1||[]).flatMap(r=>r.games||[]);
  const saved=new Map(old.map(g=>[this.gameKey(g),g]));
  const fresh=this.stage(15,'R1');

  fresh.forEach(r=>r.games.forEach(g=>{
    const prev=saved.get(this.gameKey(g));
    if(prev){g.sa=prev.sa;g.sb=prev.sb;g.st=prev.st;}
  }));

  this.S.r1=fresh;
  this.S.scheduleVersion='balanced15-v2';
  this.S.q=null;
  this.S.r2=this.originalStage(this.A,'R2');
  this.S.f=null;
  this.S.fs=[1,2,3].map(i=>({id:`FINAL-${i}`,sa:'',sb:'',st:'pending'}));
  this.persistSilent();
  return true;
};

PB.originalFormatText=PB.formatText;
PB.formatText=function(){
  if(this.N===15)return'Round 1 starts with 15 players. Each player plays exactly 12 games and rests exactly 3 rounds. Top 8 advance to Round 2. Top 4 from Round 2 reach the final. Rank 1 and Rank 2 become partners. Rank 3 and Rank 4 become partners. The championship is best of 3, and the first team to win 2 games is champion.';
  return this.originalFormatText();
};

PB.queuePublish=function(){if(this.mode!=='manager')return;clearTimeout(this.publishTimer);this.status('Syncing changes...');this.publishTimer=setTimeout(()=>this.publish(true).catch(e=>this.status('Sync error: '+e.message)),500);};

PB.publish=async function(silent=false){
  if(!this.S)throw Error('Tournament data is not loaded');
  this.status('Publishing live scores...');
  this.S.updatedAt=new Date().toISOString();
  const url=`${this.supabaseUrl}/rest/v1/moneyball_scores?tournament_size=eq.${this.N}`;
  const r=await fetch(url,{method:'PATCH',headers:{...this.headers(),Prefer:'return=representation'},body:JSON.stringify({data:this.S,updated_at:this.S.updatedAt})});
  if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.message||`Live sync failed (${r.status})`);}
  const rows=await r.json().catch(()=>[]);
  if(!rows.length)throw Error('Database did not accept the update');
  this.persistSilent();
  this.status('Live sync ✓');
  if(!silent)alert('Live scores updated. Players will see the changes within a few seconds.');
};

PB.resetTournament=async function(){
  const ok=confirm(`Reset the ${this.N} player tournament from the beginning? This will clear player names, scores, standings, qualifiers, and final results for this tournament size.`);
  if(!ok)return;
  clearTimeout(this.publishTimer);
  try{localStorage.removeItem(this.localKey(this.N));}catch(e){}
  this.S=this.fresh(this.N);
  if(this.N===15)this.S.scheduleVersion='balanced15-v2';
  this.render();
  this.status('Resetting tournament...');
  try{await this.publish(true);this.status('Tournament reset ✓');alert('Tournament reset complete. The View Only page has also been reset.');}
  catch(e){this.status('Reset sync error: '+e.message);alert('Tournament reset locally, but live sync failed: '+e.message);}
};

PB.byeHTML=function(t,r){
  const total=t==='r1'?this.N:this.A,used=new Set();
  r.games.forEach(g=>{g.a.forEach(i=>used.add(i));g.b.forEach(i=>used.add(i));});
  const resting=[];
  for(let i=0;i<total;i++)if(!used.has(i))resting.push(i);
  if(!resting.length)return'';
  const labels=resting.map(i=>this.esc(this.name(t,i)));
  return`<div class="byeBanner">🏓 BYE / REST: ${labels.join(', ')}</div>`;
};

PB.renderGames=function(t){
  let box=document.getElementById(t+'games');
  if(!box)return;
  if(t==='r2'&&!this.S.q){box.innerHTML='<p class="note">Round 2 has not started.</p>';return;}
  let rs=t==='r1'?this.S.r1:this.S.r2,f=document.getElementById(t+'RoundFilter');
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
    const changed=this.ensureBalanced15();
    this.render();
    this.status(changed?'Balanced 15 player schedule loaded. Syncing...':'Loading saved 15 player tournament...');
    setTimeout(()=>this.publish(true).catch(e=>this.status('Sync error: '+e.message)),700);
  }else{
    await this.load(15);
    this.ensureBalanced15();
    this.render();
    setInterval(async()=>{await this.load(this.N);this.ensureBalanced15();this.render();},2000);
  }
};
