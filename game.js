'use strict';
// Balance constants are intentionally centralized for later playtesting.
const CONFIG={advantage:1.45,disadvantage:.72,critMultiplier:1.5,enemyDamageMultiplier:1,freeTunePerRound:1};
const ADV={happy:'angry',angry:'sad',sad:'happy'};
const E={neutral:'보통',happy:'기쁨',sad:'슬픔',angry:'분노'};
const PARTY=[
 {name:'Fighter',hp:110,mp:18,atk:24,def:9,spd:13,luck:10,acc:91,skills:['heavy','rage']},
 {name:'Guardian',hp:135,mp:22,atk:13,def:18,spd:8,luck:7,acc:94,skills:['guard','sadness']},
 {name:'Healer',hp:95,mp:35,atk:11,def:9,spd:12,luck:11,acc:96,skills:['heal','restore']},
 {name:'Support',hp:100,mp:30,atk:14,def:10,spd:18,luck:15,acc:92,skills:['haste','cheer']}
];
const FOES=[
 {name:'Brute',hp:270,mp:0,atk:29,def:12,spd:10,luck:7,acc:89,skills:[]},
 {name:'Trickster',hp:205,mp:0,atk:23,def:10,spd:16,luck:13,acc:92,skills:[]}
];
const SKILLS={
 heavy:{name:'강타',cost:6,target:'enemy',hint:'단일 적에게 강력한 공격'},
 rage:{name:'분노 자극',cost:4,target:'ally',hint:'아군 분노 누적 (+45)'},
 guard:{name:'방어 태세',cost:3,target:'self',hint:'다음 자기 턴까지 받는 피해 감소'},
 sadness:{name:'슬픔 유도',cost:5,target:'any',hint:'대상 슬픔 누적 (+45)'},
 heal:{name:'치유',cost:7,target:'ally',hint:'HP 38 회복, 기쁨 누적 (+25)'},
 restore:{name:'MP 회복',cost:0,target:'ally',hint:'MP 10 회복'},
 haste:{name:'가속',cost:5,target:'ally',hint:'속도 증가 (다음 라운드까지)'},
 cheer:{name:'응원',cost:5,target:'ally',hint:'기쁨 누적 (+25)'}
};
const $=id=>document.getElementById(id);
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const living=a=>a.filter(u=>u.hp>0);
let party=[],foes=[],round=1,queue=[],active=null,ended=false,tuneLeft=1,selectedAction='attack',selectedTarget=null,history=[],lastEvent='',recentEvents=[],nextId=0;
function unit(d,side){return {...d,id:'u'+nextId++,side,maxHP:d.hp,maxMP:d.mp,emotion:'neutral',tier:0,points:0,guard:false,haste:0};}
function record(msg,side='system'){lastEvent=msg;recentEvents.push({msg,side});recentEvents=recentEvents.slice(-5);history.unshift({msg,side,round});history=history.slice(0,80);}
// Emotion points are internal; visible tiers change at 40 and 85.
function tierOf(points){return points>=85?2:points>=40?1:0;}
function changeEmotion(u,e,amount=22){
 if(u.hp<=0)return;
 if(u.emotion!==e){u.emotion=e;u.points=0;}
 const before=u.tier;u.points=clamp(u.points+amount,0,100);u.tier=tierOf(u.points);
 if(u.tier!==before)record(`${u.name}: ${E[e]} ${u.tier}단계 도달`,u.side);
}
function stats(u){let {atk,def,spd,luck,acc}=u;const t=u.tier;if(u.emotion==='angry'){atk+=7*t;def-=3*t;acc-=5*t;}if(u.emotion==='sad'){def+=5*t;spd-=2*t;}if(u.emotion==='happy'){spd+=3*t;luck+=9*t;acc-=5*t;}if(u.haste>0)spd+=7;return {atk:Math.max(1,atk),def:Math.max(0,def),spd:Math.max(1,spd),luck:clamp(luck,0,65),acc:clamp(acc,45,100)};}
function multiplier(a,b){if(a.tier===0||b.tier===0)return 1;if(ADV[a.emotion]===b.emotion)return CONFIG.advantage;if(ADV[b.emotion]===a.emotion)return CONFIG.disadvantage;return 1;}
function damage(a,b,power=1){const as=stats(a),bs=stats(b);if(Math.random()*100>=as.acc){record(`${a.name}의 공격이 빗나갔습니다!`,a.side);return;}const crit=Math.random()*100<as.luck;const mult=multiplier(a,b);let value=Math.max(1,Math.round((as.atk*power*(.87+Math.random()*.26)-bs.def*.45)*mult*(crit?CONFIG.critMultiplier:1)*(b.guard?.45:1)*(a.side==='enemy'?CONFIG.enemyDamageMultiplier:1)));b.hp=Math.max(0,b.hp-value);record(`${a.name} → ${b.name}: ${value} 피해${crit?' (치명타)':''}${mult>1?' (상성 유리)':''}${mult<1?' (상성 불리)':''}`,a.side);if(b.hp===0)record(`${b.name} 전투 불능`,b.side);}
function targetSet(kind){if(kind==='enemy')return living(foes);if(kind==='ally')return living(party);if(kind==='self')return active?[active]:[];return [...living(party),...living(foes)];}
function choices(){return [{id:'attack',name:'일반 공격',cost:0,hint:'공격 시 분노 누적 (+18)',target:'enemy'},...active.skills.map(id=>({id,...SKILLS[id]}))];}
function getChoice(){return choices().find(x=>x.id===selectedAction)||choices()[0];}
function makeQueue(){const all=[...living(party),...living(foes)];queue=all.map(u=>({u,speed:stats(u).spd,tie:Math.random()})).sort((a,b)=>b.speed-a.speed||b.tie-a.tie).map(x=>x.u);tuneLeft=CONFIG.freeTunePerRound;}
function begin(){party=PARTY.map(d=>unit(d,'ally'));foes=FOES.map(d=>unit(d,'enemy'));round=1;ended=false;history=[];recentEvents=[];lastEvent='전투 시작!';makeQueue();nextTurn();}
function finishCheck(){if(living(foes).length===0){ended=true;record('승리! 모든 적을 쓰러뜨렸습니다.');return true;}if(living(party).length===0){ended=true;record('패배! 아군이 모두 쓰러졌습니다.');return true;}return false;}
function nextTurn(){if(finishCheck()){active=null;render();return;}while(queue.length===0){round++;for(const u of [...party,...foes])if(u.haste>0)u.haste--;makeQueue();}active=queue.shift();if(active.hp<=0){nextTurn();return;}active.guard=false;selectedAction='attack';selectedTarget=null;if(active.side==='enemy'){enemyMove(active);if(!finishCheck())nextTurn();else{active=null;render();}return;}render();}
function enemyMove(u){
 const candidates=living(party);if(!candidates.length)return;
 const target=candidates[Math.floor(Math.random()*candidates.length)];
 if(u.name==='Brute'&&Math.random()<.42){
  record(`⚠ Brute 스킬: 지면 강타! 아군 전체를 공격합니다.`, 'enemy');
  for(const ally of [...candidates]){damage(u,ally,.78);if(ally.hp>0)changeEmotion(ally,'sad',15);}
 }else if(u.name==='Trickster'&&Math.random()<.48){
  record(`⚠ Trickster 스킬: 혼란의 속삭임! ${target.name}의 감정을 뒤흔듭니다.`, 'enemy');
  changeEmotion(target,['happy','sad','angry'][Math.floor(Math.random()*3)],55);
  damage(u,target,.65);
 }else{
  record(`${u.name} 일반 공격 → ${target.name}`, 'enemy');
  damage(u,target);if(target.hp>0)changeEmotion(target,'sad',15);
 }
}
function useAction(){if(ended||!active||active.side!=='ally')return;const choice=getChoice();if(active.mp<choice.cost){record('MP가 부족합니다.');render();return;}const possible=targetSet(choice.target);let target=possible.find(x=>x.id===selectedTarget)||possible[0];if(!target){record('선택할 대상이 없습니다.');render();return;}active.mp-=choice.cost;if(choice.id==='attack'){damage(active,target);changeEmotion(active,'angry',18);}else if(choice.id==='heavy'){damage(active,target,1.9);changeEmotion(active,'angry',18);}else if(choice.id==='rage')changeEmotion(target,'angry',45);else if(choice.id==='sadness')changeEmotion(target,'sad',45);else if(choice.id==='guard'){active.guard=true;record(`${active.name} 방어 태세: 다음 자기 턴까지 피해 감소`,'ally');}else if(choice.id==='heal'){const healed=Math.min(38,target.maxHP-target.hp);target.hp+=healed;record(`${target.name} HP +${healed}`,'ally');changeEmotion(target,'happy',25);}else if(choice.id==='restore'){const gained=Math.min(10,target.maxMP-target.mp);target.mp+=gained;record(`${target.name} MP +${gained}`,'ally');}else if(choice.id==='haste'){target.haste=2;record(`${target.name} 가속 적용`,'ally');}else if(choice.id==='cheer')changeEmotion(target,'happy',25);nextTurn();}
function tune(e){if(!active||active.side!=='ally'||ended||tuneLeft<1)return;changeEmotion(active,e,30);tuneLeft--;selectedTarget=null;render();}
function card(u){const pct=(v,max)=>max?100*v/max:0;return `<article class="unit ${u===active?'active':''} ${u.hp===0?'ko':''}"><div class="name"><span>${u.name}</span><span>${u.hp===0?'KO':u===active?'▶':''}</span></div><div class="sub">HP ${u.hp}/${u.maxHP}</div><div class="meter"><div class="fill" style="width:${pct(u.hp,u.maxHP)}%"></div></div>${u.side==='ally'?`<div class="sub">MP ${u.mp}/${u.maxMP}</div><div class="meter"><div class="fill mp" style="width:${pct(u.mp,u.maxMP)}%"></div></div>`:''}<div class="emotion ${u.emotion}">${u.tier?`${E[u.emotion]} ${u.tier}단계`:'보통'} ${u.guard?'· 방어':''}${u.haste?' · 가속':''}</div><div class="emotion-track"><div class="emotion-progress ${u.emotion}" style="width:${u.points}%"></div><i style="left:40%"></i><i style="left:85%"></i></div></article>`;}
function render() {
  $('round').textContent = `ROUND ${round}`;
  $('turn').textContent = ended ? '전투 종료' : active ? `${active.name} 차례` : '진행 중';
  $('party').innerHTML = party.map(card).join('');
  $('enemies').innerHTML = foes.map(card).join('');
  $('event').innerHTML = recentEvents.slice().reverse().map(x=>`<div class="event-line ${x.side}"><span class="event-tag">${x.side==='enemy'?'적 행동':x.side==='ally'?'아군 행동':'상태'}</span><span>${x.msg}</span></div>`).join('') || '<div class="event-line system">전투 시작!</div>';
  $('history').innerHTML = history.map(x => `<div class="log-${x.side}">R${x.round} · ${x.msg}</div>`).join('');
  if (ended) {
    $('current').textContent = living(foes).length ? '패배' : '승리';
    $('actions').innerHTML = '';
    $('targetBox').innerHTML = '';
    $('hint').textContent = 'Restart를 눌러 다시 플레이하세요.';
    return;
  }
  if (!active || active.side !== 'ally') return;
  $('current').textContent = `${active.name} · HP ${active.hp}/${active.maxHP} · MP ${active.mp}/${active.maxMP}`;
  const ch = choices();
  $('actions').innerHTML = `<div class="choices">${ch.map(x => `<button type="button" data-action="${x.id}" class="${x.id === selectedAction ? 'selected' : ''}" ${active.mp < x.cost ? 'disabled' : ''}>${x.name}${x.cost ? ' · ' + x.cost + ' MP' : ''}</button>`).join('')}</div>`;
  document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => {
    selectedAction = btn.dataset.action;
    selectedTarget = null;
    render();
  }));
  const choice = getChoice();
  const available = targetSet(choice.target);
  if (!available.some(x => x.id === selectedTarget)) selectedTarget = available[0]?.id || null;
  $('targetBox').innerHTML = `<div class="note">대상 선택</div><div class="targets">${available.map(u => `<button type="button" data-target="${u.id}" class="${selectedTarget === u.id ? 'selected' : ''}">${u.name}</button>`).join('')}</div><button id="commit" class="primary commit" ${!selectedTarget ? 'disabled' : ''}>행동 실행 →</button>`;
  document.querySelectorAll('[data-target]').forEach(btn => btn.addEventListener('click', () => {
    selectedTarget = btn.dataset.target;
    render();
  }));
  $('commit').addEventListener('click', useAction);
  $('hint').innerHTML = `<div class="note">${choice.hint} · 감정 무료 조절: 라운드당 ${tuneLeft}회 남음 (턴 소비 없음)</div><div class="targets">${['happy','sad','angry'].map(e => `<button type="button" data-tune="${e}" ${tuneLeft === 0 ? 'disabled' : ''}>${E[e]} +30</button>`).join('')}</div><div class="note">감정 단계 기준: 40부터 1단계, 85부터 2단계. 공격 +18, 피격 +15, 치유 +25. 적은 감정 변경 행동을 사용합니다.</div>`;
  document.querySelectorAll('[data-tune]').forEach(btn => btn.addEventListener('click', () => tune(btn.dataset.tune)));
}
$('restart').addEventListener('click',()=>{nextId=0;begin();});begin();
