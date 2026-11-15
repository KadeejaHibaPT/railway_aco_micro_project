(() => {
  const $ = id => document.getElementById(id);
  const stations = [
    {id:'A',name:'Aster',x:.12,y:.22},{id:'B',name:'Birch',x:.47,y:.12},
    {id:'C',name:'Central',x:.48,y:.50},{id:'D',name:'Delta',x:.86,y:.29},{id:'E',name:'Elm',x:.56,y:.86}
  ];
  const tracks = [
    {a:'A',b:'B',time:9,traffic:1.08},{a:'A',b:'C',time:12,traffic:1.18},{a:'B',b:'C',time:5,traffic:1.12},
    {a:'B',b:'D',time:11,traffic:1.10},{a:'C',b:'D',time:6,traffic:1.25},{a:'C',b:'E',time:10,traffic:1.06},
    {a:'D',b:'E',time:8,traffic:1.16},{a:'A',b:'D',time:20,traffic:1.04},{a:'B',b:'E',time:17,traffic:1.13}
  ].map((e,i)=>({...e,id:`T${i+1}`,cost:e.time*e.traffic}));
  const defaultTrains = [
    {id:'R101',type:'Express',from:'A',to:'E',depart:0,dwell:18},{id:'R204',type:'Local',from:'B',to:'E',depart:10,dwell:22},
    {id:'R309',type:'Freight',from:'A',to:'D',depart:15,dwell:26},{id:'R411',type:'Express',from:'E',to:'A',depart:30,dwell:18},
    {id:'R512',type:'Local',from:'B',to:'D',depart:40,dwell:22},{id:'R620',type:'Express',from:'C',to:'A',depart:45,dwell:18}
  ];
  let trains = defaultTrains.map(t=>({...t}));
  const crews = [
    {id:'Crew 1',skills:['Express','Local'],start:0,end:240,available:true},{id:'Crew 2',skills:['Freight','Local'],start:0,end:240,available:true},
    {id:'Crew 3',skills:['Express','Freight','Local'],start:0,end:240,available:true},{id:'Crew 4',skills:['Express'],start:20,end:240,available:true},
    {id:'Crew 5',skills:['Freight','Local'],start:30,end:240,available:true}
  ];
  const platformCounts=Object.fromEntries(stations.map(s=>[s.id,2]));
  const defaultCrewAvailability=crews.map(c=>c.available),closed=new Set(),colors=['#43d6c5','#ffb454','#7da8ff','#d58ad0','#62c3e7','#e0d26e'];
  let nextTrainNumber=Math.max(...trains.map(t=>Number(t.id.slice(1))))+1;
  let result=null;
  const edgeKey=(a,b)=>[a,b].sort().join('-');
  const station=id=>stations.find(s=>s.id===id);
  function seeded(seed){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
  function options(id){return tracks.filter(e=>!closed.has(e.id)&&(e.a===id||e.b===id)).map(e=>({edge:e,next:e.a===id?e.b:e.a}));}
  function canReach(current,dest,seen){const queue=[current],visited=new Set(seen);visited.delete(current);visited.add(current);while(queue.length){const n=queue.shift();if(n===dest)return true;for(const {next} of options(n))if(!visited.has(next)){visited.add(next);queue.push(next);}}return false;}
  function pathCost(route){let cost=0;for(let i=0;i<route.length-1;i++){const edge=tracks.find(e=>edgeKey(e.a,e.b)===edgeKey(route[i],route[i+1])&&!closed.has(e.id));if(!edge)return Infinity;cost+=edge.cost;}return cost;}
  function shortestRoute(from,to){const dist=Object.fromEntries(stations.map(s=>[s.id,Infinity])),prev={};dist[from]=0;const remaining=new Set(stations.map(s=>s.id));while(remaining.size){let current=null;for(const id of remaining)if(current===null||dist[id]<dist[current])current=id;if(current===null||!Number.isFinite(dist[current]))break;remaining.delete(current);if(current===to)break;for(const {edge,next} of options(current)){const v=dist[current]+edge.cost;if(v<dist[next]){dist[next]=v;prev[next]=current;}}}if(!Number.isFinite(dist[to]))return null;const route=[to];while(route[0]!==from)route.unshift(prev[route[0]]);return route;}
  function roulette(candidates,rand){if(!candidates.length)return null;const sum=candidates.reduce((a,c)=>a+c.weight,0);if(!(sum>0))return candidates[Math.floor(rand()*candidates.length)];let pick=rand()*sum;for(const c of candidates){pick-=c.weight;if(pick<=0)return c;}return candidates[candidates.length-1];}
  function overlap(a,b,buffer=10){return a.start < b.end+buffer && b.start < a.end+buffer;}
  function buildPlan(rand,tauTrack,tauPlatform,tauCrew,cfg,baseline=false){
    const platformUse={},crewUse=Object.fromEntries(crews.map(c=>[c.id,[]])),assignments=[];let objective=0,violations=0;
    for(const train of [...trains].sort((a,b)=>a.depart-b.depart)){
      let route;
      if(baseline)route=shortestRoute(train.from,train.to);
      else{
        route=[train.from];const seen=new Set(route);let current=train.from,guard=0;
        while(current!==train.to&&guard++<stations.length){
          const candidates=options(current).filter(o=>!seen.has(o.next)&&canReach(o.next,train.to,seen));
          const choice=roulette(candidates.map(o=>({ ...o,weight:Math.pow(tauTrack[o.edge.id],cfg.alpha)*Math.pow(1/o.edge.cost,cfg.beta) })),rand);
          if(!choice)break;route.push(choice.next);seen.add(choice.next);current=choice.next;
        }
        if(current!==train.to)route=null;
      }
      if(!route){assignments.push({train,route:[],cost:2500,delay:0,platform:'No route',crew:'Unassigned',violation:true});objective+=2500;violations++;continue;}
      const travel=pathCost(route),arrival=train.depart+travel,start=arrival,end=arrival+train.dwell;
      const pChoices=Array.from({length:platformCounts[train.to]||2},(_,i)=>({id:`${train.to}-P${i+1}`,index:i+1}));
      const free=pChoices.filter(p=>(platformUse[p.id]||[]).every(slot=>!overlap({start,end},slot,0)));
      let selectedPlatform;
      if(baseline)selectedPlatform=free[0]||pChoices[0];
      else selectedPlatform=roulette((free.length?free:pChoices).map(p=>{const load=(platformUse[p.id]||[]).length;return{...p,weight:Math.pow(tauPlatform[p.id]||1,cfg.alpha)*Math.pow(1/(1+load),cfg.beta)};}),rand);
      const pConflict=!free.length;
      (platformUse[selectedPlatform.id]??=[]).push({start,end,train:train.id});
      const duty={start:train.depart,end:end};
      const activeCrews=crews.filter(c=>c.available);
      const qualified=activeCrews.filter(c=>c.skills.includes(train.type)&&c.start<=duty.start&&c.end>=duty.end);
      const available=qualified.filter(c=>crewUse[c.id].every(slot=>!overlap(duty,slot,10)));
      let selectedCrew;
      if(baseline)selectedCrew=available[0]||qualified[0]||activeCrews[0]||null;
      else{
        const pool=available.length?available:(qualified.length?qualified:activeCrews);
        selectedCrew=roulette(pool.map(c=>({ ...c,weight:Math.pow(tauCrew[`${train.id}:${c.id}`]||1,cfg.alpha)*Math.pow(1/(1+crewUse[c.id].length+(c.skills.includes(train.type)?0:10)),cfg.beta)})),rand);
      }
      const skillConflict=!selectedCrew||!selectedCrew.skills.includes(train.type),shiftConflict=!!selectedCrew&&(selectedCrew.start>duty.start||selectedCrew.end<duty.end);
      const staffConflict=!selectedCrew||skillConflict||shiftConflict||!available.includes(selectedCrew);
      if(selectedCrew)crewUse[selectedCrew.id].push({...duty,train:train.id});
      const delay=0,cost=travel+(pConflict?180:0)+(staffConflict?240:0)+(skillConflict?500:0)+(shiftConflict?500:0);
      objective+=cost;if(pConflict||staffConflict)violations++;
      assignments.push({train,route,travel,arrival,start,end,delay,platform:selectedPlatform.id,crew:selectedCrew?.id||'No available crew',pConflict,staffConflict,skillConflict,shiftConflict,cost});
    }
    return{assignments,objective,violations,tauTrack,tauPlatform,tauCrew};
  }
  function optimize(cfg){
    const rand=seeded(cfg.seed),tauTrack=Object.fromEntries(tracks.map(e=>[e.id,1])),tauPlatform={},tauCrew={};
    stations.forEach(s=>{for(let p=1;p<=(platformCounts[s.id]||2);p++)tauPlatform[`${s.id}-P${p}`]=1;});
    trains.forEach(t=>crews.forEach(c=>tauCrew[`${t.id}:${c.id}`]=1));
    let best=buildPlan(()=>.5,tauTrack,tauPlatform,tauCrew,cfg,true),trace=[];
    for(let iteration=0;iteration<cfg.iterations;iteration++){
      const ants=[];
      for(let a=0;a<cfg.ants;a++){const candidate=buildPlan(rand,tauTrack,tauPlatform,tauCrew,cfg,false);ants.push(candidate);if(candidate.objective<best.objective)best=candidate;}
      for(const e of tracks)tauTrack[e.id]*=1-cfg.rho;
      Object.keys(tauPlatform).forEach(k=>tauPlatform[k]*=1-cfg.rho);Object.keys(tauCrew).forEach(k=>tauCrew[k]*=1-cfg.rho);
      ants.sort((a,b)=>a.objective-b.objective);const elite=ants.slice(0,Math.max(1,Math.ceil(ants.length*.2)));
      for(const ant of elite){const deposit=1/Math.max(1,ant.objective);for(const row of ant.assignments){for(let i=0;i<row.route.length-1;i++){const edge=tracks.find(e=>edgeKey(e.a,e.b)===edgeKey(row.route[i],row.route[i+1]));if(edge)tauTrack[edge.id]+=deposit;}if(row.platform!=='No route')tauPlatform[row.platform]+=deposit;if(crews.some(c=>c.id===row.crew))tauCrew[`${row.train.id}:${row.crew}`]+=deposit;}}
      trace.push(best.objective);
    }
    return{...best,trace};
  }
  function baseline(cfg){return buildPlan(()=>.5,Object.fromEntries(tracks.map(e=>[e.id,1])),{}, {},cfg,true);}
  function drawNetwork(){const canvas=$('network'),rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);const w=rect.width,h=rect.height,pad=36,pt=s=>[pad+s.x*(w-pad*2),pad+s.y*(h-pad*2)];c.clearRect(0,0,w,h);
    for(const e of tracks){const a=station(e.a),b=station(e.b),pa=pt(a),pb=pt(b);c.beginPath();c.moveTo(...pa);c.lineTo(...pb);c.strokeStyle=closed.has(e.id)?'#ff6874':'#344a5c';c.lineWidth=closed.has(e.id)?3:2;c.setLineDash(closed.has(e.id)?[6,4]:[]);c.stroke();c.setLineDash([]);c.font='9px DM Mono,monospace';c.fillStyle='#9aafbd';c.fillText(`${e.time}m`,(pa[0]+pb[0])/2+3,(pa[1]+pb[1])/2-3);}
    if(result)result.assignments.forEach((row,i)=>{if(row.route.length<2)return;c.beginPath();row.route.forEach((id,j)=>{const p=pt(station(id));j?c.lineTo(...p):c.moveTo(...p);});c.strokeStyle=colors[i%colors.length];c.globalAlpha=.8;c.lineWidth=3;c.stroke();c.globalAlpha=1;});
    for(const s of stations){const p=pt(s);c.beginPath();c.arc(...p,8,0,Math.PI*2);c.fillStyle='#43d6c5';c.fill();c.strokeStyle='#d8fff9';c.lineWidth=2;c.stroke();c.font='600 10px DM Sans,sans-serif';c.fillStyle='#e8f2f6';c.fillText(s.name,p[0]+10,p[1]-8);c.font='8px DM Mono,monospace';c.fillStyle='#9aafbd';c.fillText(`${s.id} · ${platformCounts[s.id]||2} PLATFORMS`,p[0]+10,p[1]+5);}}
  function drawChart(trace){const canvas=$('chart'),rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);const w=rect.width,h=rect.height,left=48,right=14,top=12,bottom=24,iw=w-left-right,ih=h-top-bottom;c.clearRect(0,0,w,h);if(!trace?.length)return;const hi=Math.max(...trace),lo=Math.min(...trace),span=hi-lo||1;c.font='9px DM Mono,monospace';c.fillStyle='#9aafbd';c.strokeStyle='#263746';for(let k=0;k<=4;k++){const y=top+ih*k/4;c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();c.fillText((hi-span*k/4).toFixed(0),3,y+3);}c.beginPath();trace.forEach((v,i)=>{const x=left+iw*i/Math.max(1,trace.length-1),y=top+ih*(hi-v)/span;i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle='#43d6c5';c.lineWidth=2;c.stroke();c.fillText('ITERATION',left+iw/2-28,h-4);}
  const clock=m=>{const total=((8*60+m)%1440+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;};
  function renderPlan(aco,base,elapsed){result=aco;$('aco-cost').textContent=aco.objective.toFixed(1);$('base-cost').textContent=base.objective.toFixed(1);const gain=base.objective?100*(base.objective-aco.objective)/base.objective:0;$('gain').textContent=`${gain>=0?'+':''}${gain.toFixed(1)}%`;$('aco-runtime').textContent=`${elapsed.toFixed(0)} ms · ${aco.violations} violations`;$('status').textContent=`BEST FOUND IN ${elapsed.toFixed(0)} MS`;
    const conflicts=aco.assignments.filter(a=>a.pConflict||a.staffConflict||a.route.length===0).length;$('summary').innerHTML=`<b>${trains.length}</b> scheduled trains · <b>${conflicts}</b> assignment issue(s) · Routes account for track closures and traffic-weighted travel time.`;
    $('table-wrap').innerHTML=`<table class="plan-table"><thead><tr><th>Train</th><th>Service</th><th>Route</th><th>Travel</th><th>Arrives</th><th>Platform</th><th>Crew</th><th>Checks</th></tr></thead><tbody>${aco.assignments.map((r,i)=>`<tr><td><b style="color:${colors[i%colors.length]}">● ${r.train.id}</b></td><td>${r.train.type}</td><td>${r.route.length?r.route.join(' → '):'No route'}</td><td>${Number.isFinite(r.travel)?r.travel.toFixed(1)+' min':'—'}</td><td>${Number.isFinite(r.arrival)?clock(r.arrival):'—'}</td><td>${r.platform==='No route'?'—':r.platform}${r.pConflict?' ⚠':''}</td><td>${r.crew}${r.staffConflict?' ⚠':''}</td><td>${r.route.length&& !r.pConflict&&!r.staffConflict?'<span class="pill">FEASIBLE</span>':'<span class="pill bad">REVIEW</span>'}</td></tr>`).join('')}</tbody></table>`;
    $('export').disabled=false;drawNetwork();drawChart(aco.trace);}
  function run(){if(!trains.length){$('status').textContent='ADD A TRAIN FIRST';return;}const cfg={ants:Math.max(8,Math.min(100,+$('ants').value||32)),iterations:Math.max(20,Math.min(300,+$('iterations').value||100)),alpha:+$('alpha').value||1,beta:+$('beta').value||3,rho:+$('rho').value||.4,seed:+$('seed').value||42};$('run').disabled=true;$('run').textContent='Optimizing…';setTimeout(()=>{const start=performance.now(),base=baseline(cfg),aco=optimize(cfg),elapsed=performance.now()-start;renderPlan(aco,base,elapsed);$('run').disabled=false;$('run').textContent='▶  Optimize railway plan';},20);}
  function invalidate(message='SCENARIO CHANGED · RE-RUN'){result=null;$('status').textContent=message;$('summary').textContent='Scenario changed. Run the optimizer to refresh the plan.';$('table-wrap').innerHTML='';$('export').disabled=true;drawNetwork();}
  function fillStationSelect(id){const select=$(id);select.innerHTML='';stations.forEach(s=>{const option=document.createElement('option');option.value=s.id;option.textContent=`${s.name} (${s.id})`;select.append(option);});}
  function refreshEditors(){
    $('train-manifest').innerHTML=[...trains].sort((a,b)=>a.depart-b.depart).map(t=>`<div class="manifest-row"><span class="service-dot ${t.type.toLowerCase()}"></span><span><b>${t.id}</b> · ${t.type}</span><small>${t.from} → ${t.to} · ${clock(t.depart)}</small><button class="remove-train" data-id="${t.id}" aria-label="Remove ${t.id}">×</button></div>`).join('')||'<p class="empty">No trains scheduled yet.</p>';
    $('train-manifest').querySelectorAll('.remove-train').forEach(button=>button.addEventListener('click',()=>{if(trains.length<=1){$('status').textContent='KEEP AT LEAST ONE TRAIN';return;}trains=trains.filter(t=>t.id!==button.dataset.id);refreshEditors();invalidate();}));
    $('crew-roster').innerHTML=crews.map(c=>`<div class="crew-row"><span>${c.id}<small>${c.skills.join(' / ')}</small></span><button class="crew-toggle ${c.available?'on':'off'}" data-crew="${c.id}">${c.available?'AVAILABLE':'OFF DUTY'}</button></div>`).join('');
    $('crew-roster').querySelectorAll('.crew-toggle').forEach(button=>button.addEventListener('click',()=>{const crew=crews.find(c=>c.id===button.dataset.crew);crew.available=!crew.available;refreshEditors();invalidate();}));
    $('platform-count').value=platformCounts[$('platform-station').value]||2;
    $('network-meta').textContent=`${stations.length} STATIONS · ${tracks.length-closed.size}/${tracks.length} OPEN TRACKS`;
  }
  function refreshTracks(){const select=$('track-select'),old=select.value;select.innerHTML='';tracks.forEach(e=>{const opt=document.createElement('option');opt.value=e.id;opt.textContent=`${station(e.a).name} ↔ ${station(e.b).name}${closed.has(e.id)?' (CLOSED)':''}`;select.append(opt);});if([...select.options].some(o=>o.value===old))select.value=old;$('toggle-track').textContent=closed.has(select.value)?'Reopen selected track':'Close selected track';$('network-meta').textContent=`${stations.length} STATIONS · ${tracks.length-closed.size}/${tracks.length} OPEN TRACKS`;}
  function saveScenario(){try{const params=['ants','iterations','alpha','beta','rho','seed'].reduce((out,id)=>(out[id]=$(id).value,out),{}),data={trains,closed:[...closed],platformCounts,crewAvailability:crews.map(c=>[c.id,c.available]),params};localStorage.setItem('railwayAcoScenarioV1',JSON.stringify(data));$('status').textContent='SCENARIO + ACO SETTINGS SAVED';}catch{$('status').textContent='BROWSER STORAGE IS UNAVAILABLE';}}
  function loadScenario(){let raw;try{raw=localStorage.getItem('railwayAcoScenarioV1');}catch{$('status').textContent='BROWSER STORAGE IS UNAVAILABLE';return;}if(!raw){$('status').textContent='NO SAVED SCENARIO FOUND';return;}try{const data=JSON.parse(raw);if(Array.isArray(data.trains)&&data.trains.every(t=>station(t.from)&&station(t.to)&&t.from!==t.to)){trains=data.trains;closed.clear();(data.closed||[]).forEach(id=>{if(tracks.some(e=>e.id===id))closed.add(id);});stations.forEach(s=>platformCounts[s.id]=Math.max(1,Math.min(6,Number(data.platformCounts?.[s.id])||2)));(data.crewAvailability||[]).forEach(([id,available])=>{const crew=crews.find(c=>c.id===id);if(crew)crew.available=!!available;});['ants','iterations','alpha','beta','rho','seed'].forEach(id=>{if(data.params?.[id]!==undefined)$(id).value=data.params[id];});nextTrainNumber=Math.max(1,...trains.map(t=>Number(t.id.replace(/\D/g,''))+1));refreshTracks();refreshEditors();invalidate('SAVED SCENARIO LOADED · RE-RUN');}else throw new Error('Invalid saved scenario');}catch{$('status').textContent='SAVED SCENARIO COULD NOT BE LOADED';}}
  function resetScenario(){trains=defaultTrains.map(t=>({...t}));closed.clear();stations.forEach(s=>platformCounts[s.id]=2);crews.forEach((c,i)=>c.available=defaultCrewAvailability[i]);nextTrainNumber=Math.max(...trains.map(t=>Number(t.id.slice(1))))+1;$('ants').value=32;$('iterations').value=100;$('alpha').value=1;$('beta').value=3;$('rho').value=.4;$('seed').value=42;refreshTracks();refreshEditors();invalidate('DEFAULT SCENARIO RESTORED · RE-RUN');}
  function addTrain(){if(trains.length>=20){$('status').textContent='MAXIMUM OF 20 TRAINS';return;}const from=$('train-from').value,to=$('train-to').value;if(from===to){$('status').textContent='ORIGIN AND DESTINATION MUST DIFFER';return;}const [hours,minutes]=$('train-depart').value.split(':').map(Number);if(!Number.isFinite(hours)||!Number.isFinite(minutes)){ $('status').textContent='ENTER A DEPARTURE TIME';return;}trains.push({id:`R${nextTrainNumber++}`,type:$('train-type').value,from,to,depart:hours*60+minutes-480,dwell:Math.max(5,Math.min(120,+$('train-dwell').value||20))});refreshEditors();invalidate();}
  function refreshTracks(){const select=$('track-select'),old=select.value;select.innerHTML='';tracks.forEach(e=>{const opt=document.createElement('option');opt.value=e.id;opt.textContent=`${station(e.a).name} ↔ ${station(e.b).name}${closed.has(e.id)?' (CLOSED)':''}`;select.append(opt);});if([...select.options].some(o=>o.value===old))select.value=old;$('toggle-track').textContent=closed.has(select.value)?'Reopen selected track':'Close selected track';}
  ['train-from','train-to','platform-station'].forEach(fillStationSelect);$('train-to').value='E';$('platform-station').value='A';refreshEditors();
  $('platform-station').addEventListener('change',()=>{$('platform-count').value=platformCounts[$('platform-station').value]||2;});
  $('apply-platforms').addEventListener('click',()=>{platformCounts[$('platform-station').value]=Math.max(1,Math.min(6,+$('platform-count').value||2));refreshEditors();invalidate();});
  $('add-train').addEventListener('click',addTrain);$('save-scenario').addEventListener('click',saveScenario);$('load-scenario').addEventListener('click',loadScenario);$('reset-scenario').addEventListener('click',resetScenario);
  $('track-select').addEventListener('change',()=>{$('toggle-track').textContent=closed.has($('track-select').value)?'Reopen selected track':'Close selected track';});
  $('toggle-track').addEventListener('click',()=>{const id=$('track-select').value;if(closed.has(id))closed.delete(id);else closed.add(id);refreshTracks();$('track-select').value=id;$('toggle-track').textContent=closed.has(id)?'Reopen selected track':'Close selected track';invalidate('NETWORK CHANGED · RE-RUN');});
  $('run').addEventListener('click',run);window.addEventListener('resize',()=>{drawNetwork();if(result)drawChart(result.trace);});
  $('export').addEventListener('click',()=>{if(!result)return;const rows=[['Train','Service','Route','Travel time (min)','Arrival','Platform','Crew','Platform conflict','Staff conflict'],...result.assignments.map(r=>[r.train.id,r.train.type,r.route.join(' -> '),Number.isFinite(r.travel)?r.travel.toFixed(2):'',Number.isFinite(r.arrival)?clock(r.arrival):'',r.platform,r.crew,r.pConflict?'yes':'no',r.staffConflict?'yes':'no'])];const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='railway-aco-plan.csv';a.click();URL.revokeObjectURL(url);});
  refreshTracks();drawNetwork();
})();
