PB.queuePublish=function(){
  if(this.mode!=='manager') return;
  clearTimeout(this.publishTimer);
  this.status('Syncing changes...');
  this.publishTimer=setTimeout(()=>this.publish(true).catch(e=>this.status(e.message)),500);
};

PB.publish=async function(silent=false){
  this.status('Publishing live scores...');
  this.S.updatedAt=new Date().toISOString();
  const url=`${this.supabaseUrl}/rest/v1/moneyball_scores?tournament_size=eq.${this.N}`;
  const r=await fetch(url,{
    method:'PATCH',
    headers:{...this.headers(),Prefer:'return=minimal'},
    body:JSON.stringify({data:this.S,updated_at:this.S.updatedAt})
  });
  if(!r.ok){
    let e=await r.json().catch(()=>({}));
    throw Error(e.message||'Live sync failed');
  }
  this.persistSilent();
  this.status('Live sync ✓');
  if(!silent) alert('Live scores updated. Players will see the changes within a few seconds.');
};
