<script def>
{"navigationBarTitleText":"大肥鱼 Canvas 测试","description":"预缓存动作帧并在同一个 Canvas 上播放","schema":{"data":{"type":"object","properties":{}}}}
</script>
<script setup>
import wx from 'wx';
import {WIDTH,HEIGHT,FRAMES} from '../../lib/frame-data.js';
const HEIGHTS=[144,204,240];
const DURATIONS=[1700,380,500,90,110,90,400,500];
const NAMES=['A 首版绿线','B 现有填色'];
export default {
  data:{title:'Canvas缓存 · A首版绿线',height:204,status:'正在准备动作帧…',hint:'单击换版 · 前滑尺寸 · 后滑动静 · 双击退出',playing:true},
  onLoad(){
    this.visible=false;this.ready=false;this.timer=null;this.retryTimer=null;this.token=0;
    this.cache=[];this.mode=0;this.size=1;this.frame=0;this.armed=false;this.drawCount=0;this.error=false;
    console.log('[dafeiyu-canvas] load v0.2.0');
  },
  onShow(){this.visible=true;if(this.ready)this.prepare();console.log('[dafeiyu-canvas] show');},
  onReady(){this.ready=true;this.prepare();console.log('[dafeiyu-canvas] ready');},
  onHide(){this.visible=false;this.stop();console.log('[dafeiyu-canvas] hide',this.drawCount);},
  onUnload(){this.visible=false;this.stop();this.cache=[];console.log('[dafeiyu-canvas] unload');},
  onVoiceWakeup(event){if(event && event.preventDefault)event.preventDefault();},
  stop(){
    this.token++;
    if(this.timer!==null)clearTimeout(this.timer);
    if(this.retryTimer!==null)clearTimeout(this.retryTimer);
    this.timer=null;this.retryTimer=null;this.preparing=false;this.armed=false;
  },
  async prepare(){
    if(!this.visible || !this.ready || this.preparing || this.error)return;
    if(this.cache.length===16){this.draw();this.schedule();return;}
    this.preparing=true;const token=this.token;const started=Date.now();
    try{
      while(this.cache.length<16){
        if(!this.visible || token!==this.token)return;
        const index=this.cache.length;const encoded=FRAMES[index<8?'a':'b'][index%8];
        const binary=window.atob(encoded);
        if(binary.length!==WIDTH*HEIGHT*4)throw Error('帧数据长度错误');
        const canvas=new Canvas(WIDTH,HEIGHT);const ctx=canvas.getContext('2d');
        const pixels=ctx.createImageData(WIDTH,HEIGHT);
        if(pixels.data.length!==binary.length)throw Error('像素缓冲长度错误');
        for(let p=0;p<binary.length;p++)pixels.data[p]=binary.charCodeAt(p);
        ctx.putImageData(pixels,0,0);
        ctx.flush();
        this.cache.push(canvas);
        this.setData({status:'缓存动作帧 '+this.cache.length+'/16'});
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(!this.visible || token!==this.token)return;
      this.preparing=false;this.updateStatus();
      console.log('[dafeiyu-canvas] cache-ready',JSON.stringify({frames:this.cache.length,width:WIDTH,height:HEIGHT,rgbaBytes:16*WIDTH*HEIGHT*4,ms:Date.now()-started}));
      this.draw();this.schedule();
    }catch(error){
      if(token!==this.token)return;
      this.preparing=false;this.error=true;
      this.setData({status:'Canvas失败：'+String(error && error.message || error).slice(0,45)});
      console.log('[dafeiyu-canvas] error',String(error && error.stack || error));
    }
  },
  updateStatus(){this.setData({title:'Canvas缓存 · '+NAMES[this.mode],height:HEIGHTS[this.size],status:'16帧已缓存 · '+(this.data.playing?'动态':'静止')});},
  draw(){
    if(!this.visible || !this.ready || this.cache.length!==16 || this.error)return;
    try{
      const ctx=wx.createCanvasContext('pet');
      if(!ctx){
        if(this.retryTimer===null)this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.draw();},80);
        return;
      }
      const h=HEIGHTS[this.size],w=h*0.75;
      // Clear and draw in one synchronous operation; flush only the complete frame.
      ctx.clearRect(0,0,480,240);
      ctx.drawImage(this.cache[this.mode*8+this.frame],(480-w)/2,(240-h)/2,w,h);
      ctx.flush();this.drawCount++;
      if(this.frame===0)console.log('[dafeiyu-canvas] draw',JSON.stringify({mode:this.mode,frame:this.frame,height:h,drawCount:this.drawCount,cache:this.cache.length}));
    }catch(error){
      this.error=true;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
      this.setData({status:'绘制失败：'+String(error && error.message || error).slice(0,45)});
      console.log('[dafeiyu-canvas] draw-error',String(error && error.stack || error));
    }
  },
  schedule(){
    if(!this.visible || this.error || !this.data.playing || this.cache.length!==16 || this.timer!==null)return;
    this.timer=setTimeout(()=>{
      this.timer=null;if(!this.visible || !this.data.playing)return;
      this.frame=(this.frame+1)%8;this.draw();this.schedule();
    },DURATIONS[this.frame]);
  },
  changeMode(){
    if(this.cache.length!==16)return;
    if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
    this.mode=(this.mode+1)%2;this.frame=0;this.updateStatus();this.draw();this.schedule();
    console.log('[dafeiyu-canvas] mode',this.mode);
  },
  changeSize(){this.size=(this.size+1)%3;this.updateStatus();this.draw();console.log('[dafeiyu-canvas] size',HEIGHTS[this.size]);},
  toggleMotion(){
    if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
    this.setData({playing:!this.data.playing});this.updateStatus();this.schedule();
    console.log('[dafeiyu-canvas] playing',this.data.playing);
  },
  handleTap(){this.armed=false;this.changeMode();},
  onKeyDown(event){const c=event && (event.code||event.key||event.keyCode);if(c==='Enter'||c==='NumpadEnter'||c==='Select'||c==='OK'||c===13)this.armed=true;},
  onKeyUp(event){
    const c=event && (event.code||event.key||event.keyCode);
    console.log('[dafeiyu-canvas] key',String(c));
    if(c==='Backspace'||c==='Escape'||c==='Back'||c==='GoBack'||c===4||c===8||c===27){
      if(event.preventDefault)event.preventDefault();this.visible=false;this.stop();window.close();return;
    }
    if(c==='Enter'||c==='NumpadEnter'||c==='Select'||c==='OK'||c===13){
      const armed=this.armed;this.armed=false;if(event.preventDefault)event.preventDefault();if(armed)this.changeMode();
    }else if(c==='ArrowUp'||c==='Up'||c===19){if(event.preventDefault)event.preventDefault();this.changeSize();}
    else if(c==='ArrowDown'||c==='Down'||c===20){if(event.preventDefault)event.preventDefault();this.toggleMotion();}
  }
};
</script>
<page>
  <view class="root" style="width:480px;height:320px;" bindtap="handleTap">
    <view class="header"><text class="title">{{title}}</text><text class="size">{{height}}px</text></view>
    <canvas id="pet" width="480" height="240" class="stage"></canvas>
    <view class="footer"><text class="status">{{status}}</text><text class="hint">{{hint}}</text></view>
  </view>
</page>
<style>
.root { display:flex;flex-direction:column;background-color:#000000;color:#40ff5e; }
.header { height:32px;display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:0 16px; }
.title { font-size:18px;line-height:24px;font-weight:500; }
.size { font-size:14px;line-height:20px; }
.stage { width:480px;height:240px; }
.footer { height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center; }
.status { font-size:14px;line-height:22px; }
.hint { font-size:14px;line-height:22px; }
</style>
