export const DESTINATIONS=[
{id:'rain',name:'雨巷集市',subtitle:'霓虹落进雨里，故事从街角开始。',duration:300000,energy:18,food:1,coins:8,art:'/web/assets/art/rain-v1.jpg',souvenir:'neon-sign',souvenirName:'雨巷路牌',condition:'随时可以出发',story:'她在小摊前停了很久，带回一张被雨点打湿的车票。窗外很热闹，可她还是想早点回来。'},
{id:'garden',name:'穹顶花园',subtitle:'在城市上方，寻找一片会发光的叶子。',duration:600000,energy:25,food:1,coins:12,art:'/web/assets/art/garden-v1.jpg',souvenir:'glow-plant',souvenirName:'发光盆栽',condition:'认识一株绿植',story:'穹顶里没有雨，叶片却亮着温柔的光。她认真挑了一颗种子，说想把这片绿意带回你的窗边。'},
{id:'harbor',name:'星港回廊',subtitle:'搭上末班渡轮，听一听星海的回声。',duration:900000,energy:30,food:2,coins:20,art:'/web/assets/art/harbor-v1.jpg',souvenir:'star-orbit',souvenirName:'星潮仪',condition:'完成两次旅行，并认识键盘',story:'星港的信号灯像一串缓慢呼吸的星星。她把听到的潮声收进小小的星潮仪，留给下一次和你相见。'}];
export const OBJECTS=[
{id:'toy',label:'毛绒玩具',tag:'柔软的陪伴',action:'结识新朋友',reaction:'软乎乎的，想和它坐在一起。',inspiration:'comfort',gift:'安心的陪伴，装进行囊可多带回2枚潮汐币'},
{id:'cup',label:'杯子',tag:'日常的小小海洋',action:'收集一滴潮声',reaction:'这个杯子，可以装一片小小的海吗？',inspiration:'tide',gift:'收集灵感时，获得一份海盐饭团'},
{id:'plant',label:'绿植',tag:'向光生长',action:'记录发光叶脉',reaction:'它在慢慢长大，我也在慢慢认识世界。',inspiration:'leaf',gift:'认识它，解锁穹顶花园'},
{id:'keyboard',label:'键盘',tag:'城市的信号',action:'听一段电子心跳',reaction:'这些小方块，藏着你每天的故事。',inspiration:'signal',gift:'为星港回廊收集信号'},
{id:'book',label:'书',tag:'还没讲完的故事',action:'夹一片故事书签',reaction:'这一页讲到哪里了？下次还想听。',inspiration:'story',gift:'装进行囊，让旅行多一点好奇心'}];
export const QUESTS=[
{id:'hello',title:'让她记住你的问候',description:'在家园和大肥鱼打个招呼。',reward:3,page:'home'},
{id:'care',title:'一份出发前的照料',description:'喂一份海盐饭团，补充旅行能量。',reward:3,page:'home'},
{id:'discover',title:'把眼前变成灵感',description:'观察一个物体，再收集它的灵感。',reward:4,page:'observe'},
{id:'journey',title:'寄一张远方的回声',description:'完成旅行，亲手拆开归来的旅行包。',reward:5,page:'travel'},
{id:'decorate',title:'让远方住进家里',description:'摆放一件旅行带回的纪念品。',reward:4,page:'home'},
{id:'remember',title:'留住一件小事',description:'把一条喜欢的回忆置顶。',reward:4,page:'memories'}];
export const DECORATIONS=[{id:'neon-sign',name:'雨巷路牌',description:'一小段霓虹，留在家的角落。',route:'rain'},{id:'glow-plant',name:'发光盆栽',description:'穹顶花园捎来的绿意。',route:'garden'},{id:'star-orbit',name:'星潮仪',description:'把星港的潮声，留在你身边。',route:'harbor'}];
export const getDestination=id=>DESTINATIONS.find(d=>d.id===id)||DESTINATIONS[0];
export const getObject=label=>OBJECTS.find(o=>o.label===label||o.id===label);
export function destinationUnlocked(s,id){return id==='rain'||(id==='garden'&&!!s.discoveries.plant)||(id==='harbor'&&s.completedTrips>=2&&!!s.discoveries.keyboard);}
export function questComplete(s,id){return ({hello:s.counters.greetings>0,care:s.counters.feeds>0,discover:s.collectedInspirations.length>0,journey:s.completedTrips>0,decorate:s.decorations.length>0,remember:s.memories.some(m=>m.pinned)})[id]||false;}
export const currentQuest=s=>QUESTS.find(q=>!s.claimedQuests.includes(q.id))||null;
export const tripProgress=(s,now)=>s.trip?Math.min(1,Math.max(0,(now-s.trip.startedAt)/(s.trip.endsAt-s.trip.startedAt))):0;
