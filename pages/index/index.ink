<script def>
{"navigationBarTitleText":"大肥鱼显示测试","description":"在眼镜上对比两组原始立绘的待机动画","schema":{"data":{"type":"object","properties":{}}}}
</script>
<script setup>
const HEIGHTS = [144, 204, 240];
const DURATIONS = [1700, 380, 500, 90, 110, 90, 400, 500];
const NAMES = ['A 首版造型', 'B 现有填色'];
export default {
  data: { mode:0, title:NAMES[0], size:1, height:204, width:153, src:'/assets/a-0.png', frame:0,
    automatic:true, playing:true, status:'自动对比 · 每12秒换版', hint:'单击换版 · 前滑尺寸 · 后滑动静 · 双击退出' },
  onLoad(query) {
    this.visible=false; this.timer=null; this.compareTimer=null; this.armed=false;
    const mode=Number(query && query.mode)===1?1:0;
    const size=Number(query && query.size);
    this.setData({mode,title:NAMES[mode],size:Number.isInteger(size)&&size>=0&&size<3?size:1,
      automatic:!(query && String(query.auto)==='0')});
    this.updateImage(0); this.updateStatus();
    console.log('[dafeiyu-lab] load', JSON.stringify({mode:this.data.mode,size:this.data.size,automatic:this.data.automatic}));
  },
  onShow() { this.visible=true; this.start(); console.log('[dafeiyu-lab] show'); },
  onReady() { this.ready=true; this.start(); console.log('[dafeiyu-lab] ready'); },
  onHide() { this.visible=false; this.stop(); console.log('[dafeiyu-lab] hide'); },
  onUnload() { this.visible=false; this.ready=false; this.stop(); console.log('[dafeiyu-lab] unload'); },
  onVoiceWakeup(event) { if(event && event.preventDefault)event.preventDefault(); },
  stop() {
    if(this.timer!==null)clearTimeout(this.timer);
    if(this.compareTimer!==null)clearTimeout(this.compareTimer);
    this.timer=null; this.compareTimer=null; this.armed=false;
  },
  start() {
    if(!this.visible || !this.ready)return;
    if(this.data.playing && this.timer===null)this.scheduleFrame();
    if(this.data.automatic && this.compareTimer===null){
      this.compareTimer=setTimeout(()=>{
        this.compareTimer=null;
        if(!this.visible)return;
        this.changeMode(false); this.start();
      },12000);
    }
  },
  scheduleFrame() {
    if(!this.visible || !this.ready || !this.data.playing || this.timer!==null)return;
    this.timer=setTimeout(()=>{
      this.timer=null;
      if(!this.visible || !this.data.playing)return;
      this.updateImage((this.data.frame+1)%8); this.scheduleFrame();
    },DURATIONS[this.data.frame]);
  },
  updateImage(frame) {
    const height=HEIGHTS[this.data.size];
    this.setData({frame,height,width:height*0.75,src:'/assets/'+(this.data.mode?'b':'a')+'-'+frame+'.png'});
    if(frame===0)console.log('[dafeiyu-lab] loop',JSON.stringify({mode:this.data.mode,height,src:this.data.src}));
  },
  updateStatus() { this.setData({status:(this.data.automatic?'自动对比 · 每12秒换版':'手动对比')+' · '+(this.data.playing?'动态':'静止')}); },
  changeMode(manual) {
    if(this.timer!==null)clearTimeout(this.timer); this.timer=null;
    if(manual && this.compareTimer!==null){clearTimeout(this.compareTimer);this.compareTimer=null;}
    const mode=(this.data.mode+1)%2;
    this.setData({mode,title:NAMES[mode],automatic:manual?false:this.data.automatic});
    this.updateImage(0);this.updateStatus();this.start();
    console.log('[dafeiyu-lab] mode',this.data.mode);
  },
  changeSize() {
    this.setData({size:(this.data.size+1)%3});this.updateImage(this.data.frame);
    console.log('[dafeiyu-lab] size',this.data.height);
  },
  toggleMotion() {
    if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
    this.setData({playing:!this.data.playing});this.updateStatus();this.start();
    console.log('[dafeiyu-lab] playing',this.data.playing);
  },
  handleTap() { this.armed=false;this.changeMode(true); },
  onKeyDown(event) {
    const code=event && (event.code||event.key||event.keyCode);
    if(code==='Enter'||code==='NumpadEnter'||code==='Select'||code==='OK'||code===13)this.armed=true;
  },
  onKeyUp(event) {
    const code=event && (event.code||event.key||event.keyCode);
    const confirm=code==='Enter'||code==='NumpadEnter'||code==='Select'||code==='OK'||code===13;
    const up=code==='ArrowUp'||code==='Up'||code===19;
    const down=code==='ArrowDown'||code==='Down'||code===20;
    console.log('[dafeiyu-lab] key',String(code));
    if(confirm){
      const armed=this.armed;this.armed=false;
      if(event.preventDefault)event.preventDefault();
      if(armed)this.changeMode(true);
    }else if(up||down){
      if(event.preventDefault)event.preventDefault();
      if(up)this.changeSize();else this.toggleMotion();
    }
  }
};
</script>
<page>
  <view class="root" style="width:480px;height:320px;" bindtap="handleTap">
    <view class="header"><text class="title">{{title}}</text><text class="size">{{height}}px</text></view>
    <view class="stage"><image src="{{src}}" mode="aspectFit" style="width:{{width}}px;height:{{height}}px;"></image></view>
    <view class="footer"><text class="status">{{status}}</text><text class="hint">{{hint}}</text></view>
  </view>
</page>
<style>
.root { display:flex;flex-direction:column;background-color:#000000;color:#40ff5e; }
.header { height:32px;display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:0 16px; }
.title { font-size:18px;line-height:24px;font-weight:500; }
.size { font-size:14px;line-height:20px;color:#40ff5e; }
.stage { height:240px;display:flex;align-items:center;justify-content:center; }
.footer { height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center; }
.status { font-size:14px;line-height:22px; }
.hint { font-size:14px;line-height:22px; }
</style>
