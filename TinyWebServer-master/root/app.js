/**
 * AimScope v2.2 — 简约调试面板
 * Vue 3 + ROS + Three.js (lazy) + 可交互时序图
 */
class RingBuffer {
  constructor(cap) { this.buf = new Array(cap); this.head = 0; this.size = 0; this.cap = cap; }
  push(v) { this.buf[this.head] = v; this.head = (this.head + 1) % this.cap; if (this.size < this.cap) this.size++; }
  toArray() { if (!this.size) return []; if (this.size < this.cap) return this.buf.slice(0, this.size); const a = []; for (let i = 0; i < this.size; i++) a.push(this.buf[(this.head + i) % this.cap]); return a; }
  clear() { this.head = 0; this.size = 0; }
}

// ============================================================
// InteractiveChart — 可交互 Canvas 时序图
// ============================================================
class InteractiveChart {
  constructor(canvas, opts) {
    this.cvs = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({
      series: [], windowSec: 30, yMin: -3.2, yMax: 3.2, yAuto: true,
      bg: '#252536', text: '#888', grid: '#333',
      showPlayhead: false, playheadTime: 0, isPlayback: false, totalDuration: 0,
    }, opts);
    this._origYMin = this.opts.yMin; this._origYMax = this.opts.yMax;
    this._origWindow = this.opts.windowSec;
    this._drag = { on: false, sx: 0, sy: 0, yMin: 0, yMax: 0, win: 0 };
    this._resizeObs = null;
    this._init();
  }

  _init() {
    this.cvs.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    this.cvs.addEventListener('mousedown', e => this._onDown(e));
    window.addEventListener('mousemove', e => this._onMove(e));
    window.addEventListener('mouseup', () => this._onUp());
    this.cvs.addEventListener('dblclick', () => this._reset());
    this.cvs.style.cursor = 'crosshair';
    this._resizeObs = new ResizeObserver(() => { this.render(); });
    this._resizeObs.observe(this.cvs);
    // 延迟首帧渲染，确保 DOM 布局完成
    requestAnimationFrame(() => { requestAnimationFrame(() => this.render()); });
  }

  destroy() {
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
  }

  setTheme(isDark) {
    this.opts.bg = isDark ? '#252536' : '#ffffff';
    this.opts.text = isDark ? '#999' : '#777';
    this.opts.grid = isDark ? '#333' : '#e5e7eb';
    this.render();
  }

  setYRange(ymin, ymax) { this.opts.yMin = ymin; this.opts.yMax = ymax; this.opts.yAuto = false; this.render(); }
  setWindow(s) { this.opts.windowSec = Math.max(1, Math.min(600, s)); this.render(); }

  _inYAxis(mx) { return mx < 50; }

  _onWheel(e) {
    e.preventDefault();
    const r = this.cvs.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const H = Math.max(1, this.cvs.clientHeight || 130);
    const ph = H - 24; if (ph <= 0) return;
    const fracY = 1 - Math.max(0, Math.min(1, (my - 6) / ph));
    const zoom = e.deltaY < 0 ? 0.82 : 1.22;
    if (e.ctrlKey || this._inYAxis(mx)) {
      this.opts.yAuto = false;
      const c = this.opts.yMin + fracY * (this.opts.yMax - this.opts.yMin);
      const half = Math.max(0.001, (this.opts.yMax - this.opts.yMin) / 2 * zoom);
      this.opts.yMin = c - half; this.opts.yMax = c + half;
    } else {
      this.opts.windowSec = Math.max(1, Math.min(600, this.opts.windowSec * zoom));
    }
    this.render();
  }

  _onDown(e) {
    this._drag.on = true;
    this._drag.sx = e.clientX; this._drag.sy = e.clientY;
    this._drag.yMin = this.opts.yMin; this._drag.yMax = this.opts.yMax;
    this._drag.win = this.opts.windowSec;
    this.cvs.style.cursor = 'grabbing';
  }

  _onMove(e) {
    if (!this._drag.on) return;
    const dx = e.clientX - this._drag.sx, dy = e.clientY - this._drag.sy;
    if (e.shiftKey) {
      this.opts.yAuto = false;
      const range = Math.max(0.001, this._drag.yMax - this._drag.yMin);
      const shift = (dy / Math.max(1, this.cvs.clientHeight || 130)) * range * 1.5;
      this.opts.yMin = this._drag.yMin + shift; this.opts.yMax = this._drag.yMax + shift;
    } else {
      const W = Math.max(1, this.cvs.clientWidth || 280);
      const frac = dx / (W - 55);
      this.opts.windowSec = Math.max(1, Math.min(600, this._drag.win + frac * this._drag.win));
    }
    this.render();
  }

  _onUp() { this._drag.on = false; this.cvs.style.cursor = 'crosshair'; }

  _reset() {
    this.opts.yAuto = true;
    this.opts.yMin = this._origYMin; this.opts.yMax = this._origYMax;
    this.opts.windowSec = this._origWindow;
    this.render();
  }

  render(override) {
    const o = Object.assign({}, this.opts, override || {});
    const { cvs, ctx } = this;
    const W = Math.max(1, cvs.width = cvs.clientWidth || 280);
    const H = Math.max(1, cvs.height = cvs.clientHeight || 130);
    const pad = { t: 6, r: 10, b: 18, l: 50 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;

    let yMin = o.yMin, yMax = o.yMax;
    if (o.yAuto) {
      let all = []; for (const s of o.series) { if (s.data && s.data.size) all = all.concat(s.data.toArray()); }
      if (all.length > 1) {
        let mn = Infinity, mx = -Infinity;
        for (const v of all) { if (v < mn) mn = v; if (v > mx) mx = v; }
        const p = Math.max((mx - mn) * 0.2, 0.05);
        yMin = mn - p; yMax = mx + p;
      }
    }

    // bg
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H);

    // grid
    const nGrid = 4;
    ctx.strokeStyle = o.grid; ctx.lineWidth = 0.5;
    for (let i = 0; i <= nGrid; i++) {
      const y = pad.t + (ph / nGrid) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }

    // y-axis labels
    ctx.fillStyle = o.text; ctx.font = '10px system-ui'; ctx.textAlign = 'right';
    for (let i = 0; i <= nGrid; i++) {
      const v = yMax - ((yMax - yMin) / nGrid) * i;
      ctx.fillText(this._fmt(v), pad.l - 4, pad.t + (ph / nGrid) * i + 4);
    }

    // auto/lock indicator
    ctx.textAlign = 'left'; ctx.font = '9px system-ui';
    ctx.fillStyle = o.yAuto ? '#22c55e' : '#f59e0b';
    ctx.fillText(o.yAuto ? 'AUTO' : 'LOCK', 4, 12);

    // x-axis labels
    ctx.fillStyle = o.text; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    if (o.isPlayback && o.totalDuration > 0) {
      const dur = o.totalDuration / 1000;
      ctx.fillText('0s', pad.l, H - 3);
      ctx.fillText(dur.toFixed(1) + 's', W - pad.r, H - 3);
    } else {
      ctx.fillText('-' + (o.windowSec >= 60 ? (o.windowSec/60).toFixed(1)+'m' : o.windowSec+'s'), pad.l, H - 3);
      ctx.fillText('now', W - pad.r, H - 3);
    }

    // clip & draw series
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
    for (const s of o.series) {
      if (!s.data || s.data.size < 2) continue;
      const arr = s.data.toArray();
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = pad.l + (i / Math.max(1, arr.length - 1)) * pw;
        const fy = (arr[i] - yMin) / Math.max(0.001, yMax - yMin);
        const y = pad.t + ph - Math.max(0, Math.min(1, fy)) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // playhead
    if (o.showPlayhead && o.isPlayback && o.totalDuration > 0) {
      const px = pad.l + (o.playheadTime / o.totalDuration) * pw;
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, pad.t + ph); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // legend
    ctx.font = '9px system-ui'; let lx = W - pad.r;
    for (let i = o.series.length - 1; i >= 0; i--) {
      const s = o.series[i], txt = s.label || s.key;
      const tw = ctx.measureText(txt).width + 12;
      lx -= tw; ctx.fillStyle = s.color + '30'; ctx.fillRect(lx, 0, tw, 12);
      ctx.fillStyle = s.color; ctx.textAlign = 'left'; ctx.fillText(txt, lx + 2, 9);
    }
  }

  _fmt(v) {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    if (Math.abs(v) >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }
}

// ============================================================
// Vue 3 应用
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const { createApp, ref, reactive, onMounted, onUnmounted, nextTick, watch } = Vue;
  const app = createApp({ setup() {

    // ---- 主题 ----
    const theme = ref(localStorage.getItem('aimscope-theme') || 'dark');
    function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('aimscope-theme', t); }
    applyTheme(theme.value);
    function toggleTheme() {
      theme.value = theme.value === 'dark' ? 'light' : 'dark'; applyTheme(theme.value);
    }

    // ---- 连接 ----
    const rosUrl = 'ws://192.168.186.136:9090';
    const connStatus = ref('连接中...'); const connClass = ref('connecting');

    // ---- 核心数据 ----
    const imuData = reactive({ roll:0,pitch:0,yaw:0,camp:0,shoot:false,bulletVec:0 });
    const angleData = reactive({ x:0,y:0,z:0 });
    const debugData = reactive({ dbg0:0,dbg1:0,dbg2:0 });
    const timestamp = ref('');
    const activeView = ref('raw');
    const displayFps = ref(0); const rawFps = ref(0); const resultFps = ref(0);
    const flashKeys = reactive({ roll:false,pitch:false,yaw:false });
    let prevImu = { roll:0,pitch:0,yaw:0 };
    function triggerFlash(k) { flashKeys[k] = true; setTimeout(() => flashKeys[k] = false, 350); }
    const rawImgReceived = ref(false); const resultImgReceived = ref(false);

    // ---- Canvas refs ----
    const rawCanvas = ref(null); const resultCanvas = ref(null);
    const mainContent = ref(null); const threeContainer = ref(null); const threeReady = ref(false);

    // ---- 图表环形缓冲 ----
    const CAP = 600;
    const chartRollBuf=new RingBuffer(CAP),chartPitchBuf=new RingBuffer(CAP),chartYawBuf=new RingBuffer(CAP);
    const chartAXBuf=new RingBuffer(CAP),chartAYBuf=new RingBuffer(CAP),chartAZBuf=new RingBuffer(CAP);
    const chartD0Buf=new RingBuffer(CAP),chartD1Buf=new RingBuffer(CAP),chartD2Buf=new RingBuffer(CAP);

    // ---- 图表实例 & 范围控制 ----
    let chartIMU=null,chartAngle=null,chartDebug=null;
    const chartIMUCanvas=ref(null),chartAngleCanvas=ref(null),chartDebugCanvas=ref(null);
    const showCharts=ref(true);
    const chartRanges=reactive({
      imu:  {yMin:-3.2,yMax:3.2,win:30},
      angle:{yMin:-1,yMax:1,win:30},
      debug:{yMin:-10,yMax:10,win:30},
    });

    function initCharts() {
      const ok = chartIMUCanvas.value && chartAngleCanvas.value && chartDebugCanvas.value;
      if (!ok) return;
      if (chartIMU) { chartIMU.destroy(); chartAngle.destroy(); chartDebug.destroy(); }
      const d = theme.value === 'dark';
      chartIMU = new InteractiveChart(chartIMUCanvas.value, {
        series:[
          {key:'roll',label:'Roll',color:'#ef4444',data:chartRollBuf},
          {key:'pitch',label:'Pitch',color:'#22c55e',data:chartPitchBuf},
          {key:'yaw',label:'Yaw',color:'#3b82f6',data:chartYawBuf},
        ],windowSec:30,yMin:-3.2,yMax:3.2,yAuto:true,
        bg:d?'#252536':'#fff',text:d?'#999':'#777',grid:d?'#333':'#e5e7eb',
      });
      chartAngle = new InteractiveChart(chartAngleCanvas.value, {
        series:[
          {key:'ax',label:'X',color:'#eab308',data:chartAXBuf},
          {key:'ay',label:'Y',color:'#ec4899',data:chartAYBuf},
          {key:'az',label:'Z',color:'#8b5cf6',data:chartAZBuf},
        ],windowSec:30,yMin:-1,yMax:1,yAuto:true,
        bg:d?'#252536':'#fff',text:d?'#999':'#777',grid:d?'#333':'#e5e7eb',
      });
      chartDebug = new InteractiveChart(chartDebugCanvas.value, {
        series:[
          {key:'d0',label:'dbg0',color:'#f97316',data:chartD0Buf},
          {key:'d1',label:'dbg1',color:'#eab308',data:chartD1Buf},
          {key:'d2',label:'dbg2',color:'#8b5cf6',data:chartD2Buf},
        ],windowSec:30,yMin:-10,yMax:10,yAuto:true,
        bg:d?'#252536':'#fff',text:d?'#999':'#777',grid:d?'#333':'#e5e7eb',
      });
    }

    function applyChartRange(type) {
      const c = type==='imu'?chartIMU:(type==='angle'?chartAngle:chartDebug);
      const r = chartRanges[type];
      if (c) { c.setYRange(r.yMin,r.yMax); c.setWindow(r.win); }
    }

    function updateChartsLive() {
      chartRollBuf.push(imuData.roll);chartPitchBuf.push(imuData.pitch);chartYawBuf.push(imuData.yaw);
      chartAXBuf.push(angleData.x);chartAYBuf.push(angleData.y);chartAZBuf.push(angleData.z);
      chartD0Buf.push(debugData.dbg0);chartD1Buf.push(debugData.dbg1);chartD2Buf.push(debugData.dbg2);
      if (showCharts.value) { if(chartIMU)chartIMU.render(); if(chartAngle)chartAngle.render(); if(chartDebug)chartDebug.render(); }
    }

    // ---- FPS ----
    let rfc=0, rsc=0, fpsT=0;
    function startFps() { fpsT=setInterval(()=>{rawFps.value=rfc;rfc=0;resultFps.value=rsc;rsc=0;displayFps.value=rawFps.value+resultFps.value;},1000); }

    // ---- 图像解码 ----
    // bug fix: rosbridge 对 uint8[] 类型字段会自动 Base64 编码
    // 数据路径: Python list(jpg_bytes) → rosbridge Base64 编码 → 浏览器收到 Base64 字符串
    // 如果用 new Uint8Array(string) 直接处理 Base64 字符串会得到无效数据
    // 正确做法: atob() 解码 → 逐字符 charCodeAt() → Uint8Array
    function decodeImageData(d) {
      if (typeof d==='string'){const b=atob(d);const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
      if (Array.isArray(d))return new Uint8Array(d);
      if (d instanceof Uint8Array)return d;
      return null;
    }
    function renderCanvas(cv, data) {
      if (!cv) return;
      const blob = new Blob([data],{type:'image/jpeg'});
      const img = new Image();
      img.onload=()=>{cv.width=img.width;cv.height=img.height;cv.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(img.src);};
      img.src=URL.createObjectURL(blob);
    }

    // ---- 录制 ----
    const isRecording=ref(false),recordTimer=ref('00:00'),recordIncludeImages=ref(false);
    let recBuf={},recStart=0,recTI=null,recImgN=0;
    let recDirHandle=null; const recDirName=ref('');

    async function pickRecDir(){
      try{if(!window.showDirectoryPicker){alert('浏览器不支持。将使用下载方式。');return;}
        recDirHandle=await window.showDirectoryPicker({mode:'readwrite'});recDirName.value=recDirHandle.name;}
      catch(e){if(e.name!=='AbortError')console.error(e);}
    }
    function resetRecBuf(){
      recBuf={'/RmSerialData':[],'/auto_angle':[],'/debugpub':[],'/debugpub1':[],'/debugpub2':[]};
      if(recordIncludeImages.value){recBuf['/hikrobot_camera/rgb/compressed']=[];recBuf['/tracker/result_image/compressed']=[];}
      recImgN=0;
    }
    function recMsg(topic,data){if(!isRecording.value)return;const t=Date.now()-recStart;if(!recBuf[topic])recBuf[topic]=[];recBuf[topic].push({t,d:data});}
    function startRec(){if(isRecording.value)return;resetRecBuf();recStart=Date.now();isRecording.value=true;recordTimer.value='00:00';
      recTI=setInterval(()=>{const e=Math.floor((Date.now()-recStart)/1000);recordTimer.value=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');if(e>180)stopRec();},250);}
    function stopRec(){if(!isRecording.value)return;isRecording.value=false;if(recTI){clearInterval(recTI);recTI=null;}saveRec();}
    function toggleRec(){isRecording.value?stopRec():startRec();}
    async function saveRec(){
      const dur=Date.now()-recStart,fname='aimscope_'+new Date().toISOString().replace(/[:.]/g,'-')+'.aimscope.json';
      const payload={version:'2.1',format:'aimscope-recording',metadata:{startTime:recStart,duration:dur,includesImages:recordIncludeImages.value,rosUrl,recordedAt:new Date().toISOString()},topics:recBuf};
      const json=JSON.stringify(payload); recBuf={};
      if(recDirHandle){try{const fh=await recDirHandle.getFileHandle(fname,{create:true});(await fh.createWritable()).write(json);console.log('[AimScope] 已保存:',recDirName.value+'/'+fname);return;}catch(e){console.warn('目录保存失败:',e);recDirHandle=null;recDirName.value='';}}
      const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=fname;a.click();URL.revokeObjectURL(url);
    }

    // ---- 回放 ----
    const isPlaying=ref(false),isPaused=ref(false),isPMode=ref(false);
    const pbCur=ref(0),pbDur=ref(0),pbSpeed=ref(1),pbProgress=ref(0),pbTimeDisp=ref('00:00 / 00:00');
    let pbData=null,pbRAF=null,pbStartWall=0,pbPausedOff=0;

    function fmtT(ms){const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
    function loadPbFile(file){const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(d.format!=='aimscope-recording'){alert('无效格式');return;}pbData=d;pbDur.value=d.metadata.duration;pbCur.value=0;pbProgress.value=0;pbSpeed.value=1;isPMode.value=true;isPlaying.value=false;isPaused.value=false;pbPausedOff=0;pbTimeDisp.value='00:00 / '+fmtT(d.metadata.duration);updateChartsPb(true);seekPb(0);}catch(err){alert('解析失败: '+err.message);}};r.readAsText(file);}
    function loadPbInput(e){const f=e.target.files[0];if(f)loadPbFile(f);e.target.value='';}
    function startPb(){if(!pbData||isPlaying.value)return;isPlaying.value=true;isPaused.value=false;pbStartWall=performance.now()-pbPausedOff;pbPausedOff=0;pbLoop();}
    function pausePb(){if(!isPlaying.value)return;isPlaying.value=false;isPaused.value=true;pbPausedOff=pbCur.value;if(pbRAF){cancelAnimationFrame(pbRAF);pbRAF=null;}}
    function stopPb(){isPlaying.value=false;isPaused.value=false;if(pbRAF){cancelAnimationFrame(pbRAF);pbRAF=null;}pbCur.value=0;pbProgress.value=0;pbPausedOff=0;pbTimeDisp.value='00:00 / '+fmtT(pbDur.value);seekPb(0);}
    function exitPb(){stopPb();isPMode.value=false;pbData=null;[chartRollBuf,chartPitchBuf,chartYawBuf,chartAXBuf,chartAYBuf,chartAZBuf,chartD0Buf,chartD1Buf,chartD2Buf].forEach(b=>b.clear());}
    function pbLoop(){if(!isPlaying.value)return;const now=performance.now(),elapsed=(now-pbStartWall)*pbSpeed.value,t=Math.min(elapsed,pbDur.value);pbCur.value=t;pbProgress.value=pbDur.value>0?(t/pbDur.value)*100:0;pbTimeDisp.value=fmtT(t)+' / '+fmtT(pbDur.value);seekPb(t);if(t>=pbDur.value){isPlaying.value=false;isPaused.value=false;pbPausedOff=pbDur.value;pbTimeDisp.value=fmtT(pbDur.value)+' / '+fmtT(pbDur.value);return;}pbRAF=requestAnimationFrame(pbLoop);}
    function seekPb(t){if(!pbData)return;pbCur.value=t;pbProgress.value=pbDur.value>0?(t/pbDur.value)*100:0;pbTimeDisp.value=fmtT(t)+' / '+fmtT(pbDur.value);for(const[tn,td]of Object.entries(pbData.topics)){const ms=td.messages;if(!ms||!ms.length)continue;const i=bsNear(ms,t);if(i>=0)applyPbMsg(tn,ms[i].d);}updateChartsPb(false,t);}
    function bsNear(msgs,t){let lo=0,hi=msgs.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(msgs[mid].t<=t)lo=mid;else hi=mid-1;}return msgs[lo]&&msgs[lo].t<=t?lo:-1;}
    function applyPbMsg(tn,d){switch(tn){case'/RmSerialData':imuData.roll=d.Roll;imuData.pitch=d.Pitch;imuData.yaw=d.Yaw;imuData.camp=d.Camp;imuData.shoot=d.ShootFlag===1;imuData.bulletVec=d.BulletVec;break;case'/auto_angle':angleData.x=d.x;angleData.y=d.y;angleData.z=d.z;break;case'/debugpub':debugData.dbg0=d.data;break;case'/debugpub1':debugData.dbg1=d.data;break;case'/debugpub2':debugData.dbg2=d.data;break;}}
    function seekPbPct(pct){if(!pbData)return;const t=(pct/100)*pbDur.value;seekPb(t);if(isPaused.value)pbPausedOff=t;}
    function ppToggle(){if(!isPMode.value)return;isPlaying.value?pausePb():startPb();}
    function seekRel(dms){if(!isPMode.value)return;const t=Math.max(0,Math.min(pbDur.value,pbCur.value+dms));seekPb(t);if(isPaused.value)pbPausedOff=t;if(!isPlaying.value&&!isPaused.value)pbPausedOff=t;}
    function updateChartsPb(full,tMs){
      if(!showCharts.value||!pbData)return;
      const top=pbData.topics;
      function fill(tn,extract,bufs){
        const td=top[tn];if(!td||!td.messages)return;
        const ms=td.messages;let end=ms.length;if(tMs!==undefined)end=bsNear(ms,tMs)+1;
        const start=Math.max(0,end-CAP);bufs.forEach(b=>b.clear());
        for(let i=start;i<end;i++){const vals=extract(ms[i].d);vals.forEach((v,j)=>bufs[j].push(v));}
      }
      fill('/RmSerialData',d=>[d.Roll,d.Pitch,d.Yaw],[chartRollBuf,chartPitchBuf,chartYawBuf]);
      fill('/auto_angle',d=>[d.x,d.y,d.z],[chartAXBuf,chartAYBuf,chartAZBuf]);
      fill('/debugpub',d=>[d.data],[chartD0Buf]);fill('/debugpub1',d=>[d.data],[chartD1Buf]);fill('/debugpub2',d=>[d.data],[chartD2Buf]);
      const ov={isPlayback:true,totalDuration:pbDur.value,playheadTime:tMs!==undefined?tMs:0,showPlayhead:true};
      if(chartIMU)chartIMU.render(ov);if(chartAngle)chartAngle.render(ov);if(chartDebug)chartDebug.render(ov);
    }

    // ---- ROS 连接 ----
    let ros=null, rosConnAttempted=false;
    function connectROS(){
      if(rosConnAttempted)return; rosConnAttempted=true;
      ros=new ROSLIB.Ros({url:rosUrl});
      ros.on('connection',()=>{connStatus.value='已连接';connClass.value='connected';});
      ros.on('error',e=>{connStatus.value='错误';connClass.value='disconnected';console.error(e);});
      ros.on('close',()=>{connStatus.value='断开';connClass.value='disconnected';});
      new ROSLIB.Topic({ros,name:'/auto_angle',messageType:'geometry_msgs/Vector3'}).subscribe(m=>{if(isPMode.value)return;angleData.x=m.x;angleData.y=m.y;angleData.z=m.z;recMsg('/auto_angle',{x:m.x,y:m.y,z:m.z});});
      new ROSLIB.Topic({ros,name:'/RmSerialData',messageType:'rm_msgs/RmSerial'}).subscribe(m=>{if(isPMode.value)return;const nr=m.Roll,np=m.Pitch,ny=m.Yaw;if(Math.abs(nr-prevImu.roll)>0.05)triggerFlash('roll');if(Math.abs(np-prevImu.pitch)>0.05)triggerFlash('pitch');if(Math.abs(ny-prevImu.yaw)>0.3)triggerFlash('yaw');imuData.roll=nr;imuData.pitch=np;imuData.yaw=ny;imuData.camp=m.Camp;imuData.shoot=m.ShootFlag===1;imuData.bulletVec=m.BulletVec;prevImu.roll=nr;prevImu.pitch=np;prevImu.yaw=ny;recMsg('/RmSerialData',{Roll:nr,Pitch:np,Yaw:ny,Camp:m.Camp,ShootFlag:m.ShootFlag,BulletVec:m.BulletVec});updateChartsLive();update3D();});
      new ROSLIB.Topic({ros,name:'/debugpub',messageType:'std_msgs/Float64'}).subscribe(m=>{if(isPMode.value)return;debugData.dbg0=m.data;recMsg('/debugpub',{data:m.data});});
      new ROSLIB.Topic({ros,name:'/debugpub1',messageType:'std_msgs/Float64'}).subscribe(m=>{if(isPMode.value)return;debugData.dbg1=m.data;recMsg('/debugpub1',{data:m.data});});
      new ROSLIB.Topic({ros,name:'/debugpub2',messageType:'std_msgs/Float64'}).subscribe(m=>{if(isPMode.value)return;debugData.dbg2=m.data;recMsg('/debugpub2',{data:m.data});});
      new ROSLIB.Topic({ros,name:'/hikrobot_camera/rgb/compressed',messageType:'sensor_msgs/CompressedImage'}).subscribe(m=>{if(isPMode.value)return;const d=decodeImageData(m.data);if(!d)return;rawImgReceived.value=true;rfc++;if(activeView.value==='raw')renderCanvas(rawCanvas.value,d);if(isRecording.value&&recordIncludeImages.value){recImgN++;if(recImgN%5===0&&typeof m.data==='string')recMsg('/hikrobot_camera/rgb/compressed',m.data);}});
      new ROSLIB.Topic({ros,name:'/tracker/result_image/compressed',messageType:'sensor_msgs/CompressedImage'}).subscribe(m=>{if(isPMode.value)return;const d=decodeImageData(m.data);if(!d)return;resultImgReceived.value=true;rsc++;if(activeView.value==='result')renderCanvas(resultCanvas.value,d);if(isRecording.value&&recordIncludeImages.value){if(recImgN%5===0&&typeof m.data==='string')recMsg('/tracker/result_image/compressed',m.data);}});
    }

    // ---- 时间戳 ----
    let tsT=null;
    function startTs(){tsT=setInterval(()=>{timestamp.value=new Date().toLocaleTimeString();},200);}

    // ---- 键盘 ----
    function onKD(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
      switch(e.key.toLowerCase()){
        case'r':if(!e.ctrlKey&&!e.metaKey){e.preventDefault();toggleRec();}break;
        case' ':{if(isPMode.value){e.preventDefault();ppToggle();}}break;
        case'arrowleft':if(isPMode.value){e.preventDefault();seekRel(-5000);}break;
        case'arrowright':if(isPMode.value){e.preventDefault();seekRel(5000);}break;
        case'1':e.preventDefault();activeView.value='raw';break;
        case'2':e.preventDefault();activeView.value='result';break;
        case'3':e.preventDefault();activeView.value='3d';init3D();break;
        case't':if(!e.ctrlKey&&!e.metaKey)toggleTheme();break;
        case'escape':if(isPMode.value)exitPb();break;
      }
    }

    // ---- 3D (lazy) ----
    let ts=null,tr=null,tc=null,ta=null,tro=null,gy=null,gp=null,tgt=null,mm=null,tm=null;
    let ds={dragging:false,px:0,py:0,theta:0.8,phi:0.6,radius:5.5};
    let threeLoaded=false;

    function loadThreeJS(cb){
      if (typeof THREE !== 'undefined') { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/three@0.157.0/build/three.min.js';
      s.onload = cb;
      document.head.appendChild(s);
    }

    function init3D(){
      if(threeReady.value)return;
      if(typeof THREE==='undefined'){loadThreeJS(()=>init3D());return;}
      const ct=threeContainer.value;if(!ct)return;
      const w=ct.clientWidth||400,h=ct.clientHeight||300;
      ts=new THREE.Scene();ts.background=new THREE.Color(0x1a1a2e);
      tc=new THREE.PerspectiveCamera(50,w/h,0.1,50);tc.position.set(3,2.5,5);tc.lookAt(0,0.4,0);
      tr=new THREE.WebGLRenderer({antialias:true,alpha:true});tr.setSize(w,h);tr.setPixelRatio(Math.min(devicePixelRatio,2));
      ct.appendChild(tr.domElement);
      tr.domElement.style.cursor='grab';
      tr.domElement.addEventListener('mousedown',e=>{ds.dragging=true;ds.px=e.clientX;ds.py=e.clientY;e.target.style.cursor='grabbing';});
      window.addEventListener('mousemove',e=>{if(!ds.dragging)return;ds.theta-=(e.clientX-ds.px)*0.005;ds.phi=Math.max(0.15,Math.min(1.4,ds.phi-(e.clientY-ds.py)*0.005));ds.px=e.clientX;ds.py=e.clientY;});
      window.addEventListener('mouseup',()=>{ds.dragging=false;if(tr)tr.domElement.style.cursor='grab';});
      tr.domElement.addEventListener('wheel',e=>{e.preventDefault();ds.radius=Math.max(2,Math.min(12,ds.radius+e.deltaY*0.01));},{passive:false});
      ts.add(new THREE.AmbientLight(0x334466,1.5));
      const dl=new THREE.DirectionalLight(0x8899cc,1);dl.position.set(5,8,3);ts.add(dl);
      ts.add(new THREE.PolarGridHelper(4,32,24,64,0x333,0x333));
      const grp=new THREE.Group();
      grp.add((()=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.35,0.15,32),new THREE.MeshStandardMaterial({color:0x334,roughness:0.5,metalness:0.7}));m.position.y=-0.05;return m;})());
      gy=new THREE.Group();grp.add(gy);
      [1,-1].forEach(s=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.35,0.06),new THREE.MeshStandardMaterial({color:0x445,roughness:0.4,metalness:0.8}));m.position.set(s*0.18,0.2,0);gy.add(m);});
      gp=new THREE.Group();gp.position.y=0.35;gy.add(gp);
      const bg=new THREE.CylinderGeometry(0.03,0.04,0.7,16);bg.rotateX(Math.PI/2);
      gp.add(new THREE.Mesh(bg,new THREE.MeshStandardMaterial({color:0x667,roughness:0.3,metalness:0.9})));
      mm=new THREE.MeshStandardMaterial({color:0x3b82f6,roughness:0.2,metalness:0.3,emissive:0x3b82f6,emissiveIntensity:0.6});
      const mr=new THREE.Mesh(new THREE.TorusGeometry(0.045,0.01,8,16),mm);mr.position.z=-0.7;gp.add(mr);
      const ag=new THREE.BufferGeometry();ag.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0.35,-0.7,0,0.35,-3.0]),3));
      gp.add(new THREE.Line(ag,new THREE.LineBasicMaterial({color:0x3b82f6,transparent:true,opacity:0.4})));
      tm=new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.3,metalness:0.2,emissive:0xef4444,emissiveIntensity:0.4});
      tgt=new THREE.Mesh(new THREE.SphereGeometry(0.08,16,16),tm);tgt.position.set(0,0.3,-2.5);ts.add(tgt);
      const cr=new THREE.Mesh(new THREE.TorusGeometry(0.12,0.015,8,16),new THREE.MeshStandardMaterial({color:0xef4444,roughness:0.3,emissive:0xef4444,emissiveIntensity:0.3}));tgt.add(cr);
      ts.add(grp);threeReady.value=true;
      function anim(){ta=requestAnimationFrame(anim);tc.position.x=ds.radius*Math.sin(ds.phi)*Math.cos(ds.theta);tc.position.y=ds.radius*Math.cos(ds.phi);tc.position.z=ds.radius*Math.sin(ds.phi)*Math.sin(ds.theta);tc.lookAt(0,0.4,0);const p=0.5+0.5*Math.sin(Date.now()*0.01);if(mm)mm.emissiveIntensity=0.3+p*0.8;if(tm)tm.emissiveIntensity=0.2+p*0.6;tr.render(ts,tc);}
      anim();
      tro=new ResizeObserver(()=>{if(!tr||!tc||!ct)return;const w=ct.clientWidth,h=ct.clientHeight;tr.setSize(w,h);tc.aspect=w/Math.max(h,1);tc.updateProjectionMatrix();});
      tro.observe(ct);
    }
    function update3D(){if(!gy||!gp||!tgt)return;gy.rotation.y=imuData.yaw;gp.rotation.x=-imuData.pitch;tgt.position.lerp(new THREE.Vector3(angleData.x*2.5,angleData.y*2.5+0.3,-Math.cos(angleData.x)*2.5),0.3);}
    function destroy3D(){if(ta)cancelAnimationFrame(ta);if(tro)tro.disconnect();if(tr){tr.dispose();if(threeContainer.value&&tr.domElement.parentElement)threeContainer.value.removeChild(tr.domElement);}ts=tr=tc=ta=tro=gy=gp=tgt=mm=tm=null;threeReady.value=false;}

    // ---- 生命周期 ----
    onMounted(()=>{
      connectROS();startFps();startTs();
      document.addEventListener('keydown',onKD);
      nextTick(()=>{ initCharts(); });
    });
    onUnmounted(()=>{
      if(ros)ros.close();if(tsT)clearInterval(tsT);if(fpsT)clearInterval(fpsT);
      if(recTI)clearInterval(recTI);if(pbRAF)cancelAnimationFrame(pbRAF);
      document.removeEventListener('keydown',onKD);destroy3D();
      if(chartIMU)chartIMU.destroy();if(chartAngle)chartAngle.destroy();if(chartDebug)chartDebug.destroy();
    });
    watch(activeView,(nv,ov)=>{if(nv==='3d')nextTick(()=>init3D());else if(ov==='3d')destroy3D();});
    watch(theme,()=>{if(chartIMU)chartIMU.setTheme(theme.value==='dark');if(chartAngle)chartAngle.setTheme(theme.value==='dark');if(chartDebug)chartDebug.setTheme(theme.value==='dark');});

    // ---- 暴露给模板 ----
    return {
      theme,toggleTheme,connStatus,connClass,rosUrl,
      imuData,angleData,debugData,flashKeys,timestamp,displayFps,rawFps,resultFps,
      activeView,rawImgReceived,resultImgReceived,threeReady,
      rawCanvas,resultCanvas,mainContent,threeContainer,init3D,
      isRecording,recordTimer,recordIncludeImages,toggleRec,recDirName,pickRecDir,
      isPlaying,isPaused,isPMode,pbCur,pbDur,pbSpeed,pbProgress,pbTimeDisp,
      loadPbInput,ppToggle,stopPb,exitPb,seekPbPct,seekRel,
      showCharts,chartIMUCanvas,chartAngleCanvas,chartDebugCanvas,chartRanges,applyChartRange,
    };
  }});
  app.mount('#app');
});
