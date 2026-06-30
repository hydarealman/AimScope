/**
 * AimScope v2.4 — 简约调试面板
 * Vue 3 + ROS + Three.js (lazy) + 可交互时序图
 */
const AimScope = window.AimScope || {};
const { RingBuffer, InteractiveChart, ConfigEditor, DiffViewer } = AimScope;
if (!RingBuffer || !InteractiveChart) {
  throw new Error('AimScope core modules are not loaded.');
}
// v3 API modules (optional — degrade gracefully)
const AuthAPI = AimScope.AuthAPI || null;
const ParamAPI = AimScope.ParamAPI || null;
const ReplayAPI = AimScope.ReplayAPI || null;
const BenchmarkAPI = AimScope.BenchmarkAPI || null;

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
    function defaultRosUrl() {
      const saved = localStorage.getItem('aimscope-ros-url');
      if (saved) return saved;
      const host = window.location.hostname || '127.0.0.1';
      return `ws://${host}:9090`;
    }
    function normalizeRosUrl(v) {
      const s = String(v || '').trim();
      if (!s) return defaultRosUrl();
      return /^wss?:\/\//i.test(s) ? s : `ws://${s}`;
    }
    const rosUrl = ref(normalizeRosUrl(defaultRosUrl()));
    const rosUrlDraft = ref(rosUrl.value);
    const rosVersion = ref(localStorage.getItem('aimscope-ros-version') || 'ros2');
    const connStatus = ref('未连接'); const connClass = ref('disconnected');
    const connLastError = ref('');
    const isRosConnected = ref(false);
    function msgType(ros1, ros2) { return rosVersion.value === 'ros2' ? ros2 : ros1; }
    function pick(obj, ...keys) {
      for (const key of keys) {
        if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
      }
      return undefined;
    }

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
    const imageStreams = {
      raw: { canvasRef: rawCanvas, pending: null, raf: 0 },
      result: { canvasRef: resultCanvas, pending: null, raf: 0 },
    };
    const imageStats = reactive({
      raw: { latencyMs:null, ageMs:null, msgSize:0, state:'idle' },
      result: { latencyMs:null, ageMs:null, msgSize:0, state:'idle' },
    });

    // ---- Topic 状态 & 事件日志 ----
    const topicDefs = [
      {name:'/hikrobot_camera/rgb/compressed', label:'原始图像', type:'sensor_msgs/CompressedImage', warnAfter:1200, alarmAfter:2500, imageKey:'raw'},
      {name:'/image_debug/compressed', label:'调试图像', type:'sensor_msgs/CompressedImage', warnAfter:1200, alarmAfter:2500, imageKey:'result'},
      {name:'/auto_angle', label:'瞄准角', type:'geometry_msgs/Vector3', warnAfter:1800, alarmAfter:4000},
      {name:'/RmSerialData', label:'串口 ROS1', type:'rm_msgs/RmSerial', warnAfter:2500, alarmAfter:5000},
      {name:'/aimscope_demo/serial', label:'串口 Demo', type:'std_msgs/Float64MultiArray', warnAfter:2500, alarmAfter:5000},
      {name:'/debugpub', label:'debug0', type:'std_msgs/Float64', warnAfter:3000, alarmAfter:6000},
      {name:'/debugpub1', label:'debug1', type:'std_msgs/Float64', warnAfter:3000, alarmAfter:6000},
      {name:'/debugpub2', label:'debug2', type:'std_msgs/Float64', warnAfter:3000, alarmAfter:6000},
      {name:'/armor_array', label:'装甲板检测', type:'rm_msgs/ArmorArray', warnAfter:1800, alarmAfter:4000},
    ];
    const topicStatus = reactive(topicDefs.map(d=>Object.assign({}, d, {
      count:0,lastCount:0,hz:0,lastAt:null,ageMs:null,latencyMs:null,msgSize:0,state:'idle',
      lastMsg:null,lastMsgText:'',lastMsgTime:'--'
    })));
    const topicMap = {};
    topicStatus.forEach(t=>{ topicMap[t.name]=t; });
    const eventLog = reactive([]);
    const alarmCount = ref(0), diagLevel = ref('idle'), diagText = ref('未连接');
    const latencyWarnMs = 1000, latencyAlarmMs = 3000;
    let eventSeq = 0, diagT = null, diagLastAt = Date.now();
    const sessionStartAt = Date.now();
    const eventDedupe = new Map();
    const topicInspect = reactive({open:false,name:'',copied:false});

    // ---- v3.0 Tab 导航 ----
    const activeTab = ref('monitor');
    function switchTab(tab) {
      activeTab.value = tab;
      // Auto-load data when switching tabs
      if (tab === 'replay') loadReplaySessions();
      if (tab === 'params') loadParamConfigs();
      if (tab === 'benchmark') { loadReplaySessions(); loadParamConfigs(); loadBenchmarkRuns(); }
    }

    // ---- v3.0 认证 ----
    const showLogin = ref(false);
    const loginMode = ref(true);
    const authUser = ref(AuthAPI ? AuthAPI.getUser() : null);
    const loginForm = reactive({ username: '', password: '', role: 'TESTER' });
    const loginError = ref('');
    async function doLogin() {
      loginError.value = '';
      if (!AuthAPI) { loginError.value = 'Auth API 未加载'; return; }
      try {
        if (loginMode.value) {
          var result = await AuthAPI.login(loginForm.username, loginForm.password);
          authUser.value = AuthAPI.getUser();
          showLogin.value = false;
        } else {
          await AuthAPI.register(loginForm.username, loginForm.password, loginForm.role);
          loginMode.value = true;
          loginError.value = '注册成功，请登录';
        }
      } catch (e) {
        loginError.value = e.message || '认证失败';
      }
    }
    function doLogout() {
      if (AuthAPI) AuthAPI.logout();
      authUser.value = null;
    }

    // ---- v3.0 回放 ----
    const replaySessions = ref([]);
    const activeReplayId = ref(null);
    const uploadProgress = ref(-1);
    const replayPlaying = ref(false);
    const replayCursor = ref(0);
    const replayDuration = ref(10000);
    const replayTopics = ref([]);
    const replayTopicFilter = ref('');
    const analysisEvents = ref([]);
    var replayPlayTimer = null;

    async function loadReplaySessions() {
      if (!ReplayAPI) return;
      try { replaySessions.value = await ReplayAPI.list(); } catch (e) { /* silent */ }
    }
    function triggerUpload() {
      var el = document.querySelector('input[ref="replayFileInput"]');
      if (!el) { var all = document.querySelectorAll('input[type="file"]'); for (var i = 0; i < all.length; i++) { if (all[i].accept.indexOf('.bag') >= 0) { el = all[i]; break; } } }
      if (el) el.click();
    }
    function handleFileDrop(e) {
      var file = e.dataTransfer.files[0];
      if (file) uploadReplayFile(file);
    }
    function handleReplayUpload(e) {
      var file = e.target.files[0];
      if (file) uploadReplayFile(file);
      e.target.value = '';
    }
    async function uploadReplayFile(file) {
      if (!ReplayAPI) return;
      uploadProgress.value = 0;
      try {
        var session = await ReplayAPI.upload(file, function(pct) { uploadProgress.value = pct; });
        uploadProgress.value = 100;
        await loadReplaySessions();
        selectReplaySession(session);
      } catch (e) {
        alert('上传失败: ' + e.message);
      }
      setTimeout(function() { uploadProgress.value = -1; }, 2000);
    }
    function selectReplaySession(s) {
      activeReplayId.value = s.id;
      replayDuration.value = s.totalDurationMs || 10000;
      replayCursor.value = 0;
      analysisEvents.value = [];
      // Load analysis events
      if (ReplayAPI && s.status === 'READY') {
        ReplayAPI.queryEvents(s.id, 0, s.totalDurationMs).then(function(data) {
          analysisEvents.value = data.events || [];
        }).catch(function() {});
      }
    }
    function seekReplayMs(ms) {
      replayCursor.value = Math.max(0, Math.min(replayDuration.value, ms));
      if (!activeReplayId.value || !ReplayAPI) return;
      var topicFilter = replayTopicFilter.value || void 0;
      var from = Math.max(0, ms - 2500);
      var to = ms + 2500;
      // Query data for current window
      if (topicFilter) {
        ReplayAPI.queryData(activeReplayId.value, topicFilter, from, to).then(function(data) {
          // In real impl, push to charts
        }).catch(function() {});
      }
    }
    function replayPlayPause() {
      if (replayPlaying.value) {
        replayPlaying.value = false;
        if (replayPlayTimer) { clearInterval(replayPlayTimer); replayPlayTimer = null; }
      } else {
        replayPlaying.value = true;
        replayPlayTimer = setInterval(function() {
          replayCursor.value = Math.min(replayDuration.value, replayCursor.value + 50);
          if (replayCursor.value >= replayDuration.value) {
            replayPlaying.value = false;
            if (replayPlayTimer) { clearInterval(replayPlayTimer); replayPlayTimer = null; }
          }
        }, 50);
      }
    }

    // ---- v3.0 参数管理 ----
    var paramEditor = null;
    const paramConfigs = ref([]);
    const activeParamId = ref(null);
    const activeParamName = ref('');
    const paramViewMode = ref('edit');
    const paramVersions = ref([]);
    const diffV1 = ref(1);
    const diffV2 = ref(2);

    async function loadParamConfigs() {
      if (!ParamAPI) return;
      try { paramConfigs.value = await ParamAPI.list(); } catch (e) { /* silent */ }
    }
    function selectParamConfig(pc) {
      activeParamId.value = pc.id;
      activeParamName.value = pc.name;
      paramViewMode.value = 'edit';
      diffV1.value = Math.max(1, (pc.currentVersion || 1) - 1);
      diffV2.value = pc.currentVersion || 1;
      loadParamVersions(pc.id);
      // Load content into editor
      ParamAPI.get(pc.id).then(function(data) {
        var content = data.currentContent || '';
        initParamEditor(content, data.fileType);
      }).catch(function() {});
    }
    function newParamConfig() {
      var name = (window.prompt && window.prompt('配置名称 (如 ekf_params_v2.yaml):', '')) || '';
      if (!name) return;
      var fileType = name.endsWith('.json') ? 'JSON' : 'YAML';
      if (ParamAPI) {
        ParamAPI.create({ name: name, description: '', fileType: fileType, content: '# ' + name + '\n' }).then(function(pc) {
          loadParamConfigs();
          selectParamConfig(pc);
        }).catch(function(e) { alert('创建失败: ' + e.message); });
      }
    }
    function initParamEditor(content, fileType) {
      var container = document.querySelector('[ref="paramEditorContainer"]');
      if (!container) return;
      if (paramEditor) paramEditor.destroy();
      if (ConfigEditor) {
        paramEditor = ConfigEditor(container, {
          value: content,
          mode: (fileType || 'YAML').toLowerCase(),
          onChange: function() {},
          onSave: function(v) { saveParamConfig(); }
        });
      }
    }
    async function saveParamConfig() {
      if (!activeParamId.value || !ParamAPI) return;
      var content = paramEditor ? paramEditor.getValue() : '';
      try {
        await ParamAPI.update(activeParamId.value, { content: content, message: '更新 ' + activeParamName.value });
        loadParamVersions(activeParamId.value);
        loadParamConfigs();
      } catch (e) {
        alert('保存失败: ' + e.message);
      }
    }
    async function loadParamVersions(configId) {
      if (!ParamAPI) return;
      try { paramVersions.value = await ParamAPI.versions(configId); } catch (e) { /* silent */ }
    }
    function viewParamVersion(v) {
      if (!ParamAPI || !activeParamId.value) return;
      ParamAPI.getVersion(activeParamId.value, v.versionNum).then(function(data) {
        if (paramEditor) paramEditor.setValue(data.content);
        paramViewMode.value = 'edit';
      }).catch(function() {});
    }
    async function rollbackParam(versionNum) {
      if (!ParamAPI || !activeParamId.value) return;
      if (!confirm('确认回滚到 v' + versionNum + '?')) return;
      try {
        await ParamAPI.rollback(activeParamId.value, versionNum);
        loadParamVersions(activeParamId.value);
        loadParamConfigs();
      } catch (e) { alert('回滚失败: ' + e.message); }
    }
    function loadDiff() {
      if (!ParamAPI || !activeParamId.value) return;
      var container = document.querySelector('[ref="diffContainer"]');
      ParamAPI.diff(activeParamId.value, diffV1.value, diffV2.value).then(function(data) {
        if (DiffViewer && container) {
          container.innerHTML = '';
          DiffViewer(container, {
            oldText: data.oldContent || '',
            newText: data.newContent || '',
            oldLabel: 'v' + diffV1.value,
            newLabel: 'v' + diffV2.value
          });
        }
      }).catch(function(e) { alert('Diff 加载失败: ' + e.message); });
    }

    // ---- v3.0 自动化测试 ----
    const benchmarkRuns = ref([]);
    const activeBenchmarkId = ref(null);
    const activeBenchmark = ref(null);
    const showNewBenchmark = ref(false);
    const newBenchmark = reactive({ name: '', replayId: null, configAId: null, configBId: null });

    async function loadBenchmarkRuns() {
      if (!BenchmarkAPI) return;
      try { benchmarkRuns.value = await BenchmarkAPI.list(); } catch (e) { /* silent */ }
    }
    function selectBenchmark(br) {
      activeBenchmarkId.value = br.id;
      activeBenchmark.value = br;
    }
    async function createBenchmark() {
      if (!BenchmarkAPI) return;
      try {
        var run = await BenchmarkAPI.create({
          name: newBenchmark.name,
          replayId: newBenchmark.replayId,
          configAId: newBenchmark.configAId,
          configBId: newBenchmark.configBId
        });
        showNewBenchmark.value = false;
        loadBenchmarkRuns();
        selectBenchmark(run);
      } catch (e) { alert('创建失败: ' + e.message); }
    }

    // ---- v3.0 工具函数 ----
    function fmtMs(ms) {
      if (!Number.isFinite(ms)) return '--';
      var s = Math.floor(ms / 1000);
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + String(Math.floor(ms % 1000)).padStart(3, '0');
    }
    function renderMarkdown(md) {
      if (!md) return '';
      return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\|(.+)\|/g, function(m) { return '<tr>' + m.split('|').filter(function(x) { return x; }).map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>'; })
        .replace(/\n\n/g, '<br><br>');
    }
    function parseMetrics(jsonStr) {
      try { return JSON.parse(jsonStr); } catch (e) { return {}; }
    }

    function eventTime() {
      return new Date().toLocaleTimeString('zh-CN', {hour12:false});
    }
    function pushEvent(level, message, key='', coolMs=1500) {
      const now = Date.now();
      if (key) {
        const last = eventDedupe.get(key) || 0;
        if (now - last < coolMs) return;
        eventDedupe.set(key, now);
      }
      const levelText = level === 'error' ? '报警' : (level === 'warn' ? '警告' : '信息');
      const entry = {id:++eventSeq,time:eventTime(),level,levelText,message};
      eventLog.unshift(entry);
      if (AimScope.emitLog) AimScope.emitLog(Object.assign({}, entry));
      if (eventLog.length > 80) eventLog.splice(80);
      if (isRecording.value && recStart) {
        recordEvents.push({t:Date.now()-recStart,time:entry.time,level,levelText,message});
      }
    }
    function clearEvents() { eventLog.splice(0); eventDedupe.clear(); }
    function formatHz(v) {
      if (!Number.isFinite(v) || v <= 0) return '--';
      return v >= 10 ? v.toFixed(0) : v.toFixed(1);
    }
    function formatMs(v) {
      if (!Number.isFinite(v)) return '--';
      if (v < 1000) return Math.max(0, Math.round(v)) + 'ms';
      return (v / 1000).toFixed(1) + 's';
    }
    function formatAge(v) { return formatMs(v); }
    function formatBytes(v) {
      if (!Number.isFinite(v) || v <= 0) return '--';
      if (v < 1024) return Math.round(v) + 'B';
      if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + 'K';
      return (v / 1024 / 1024).toFixed(1) + 'M';
    }
    function estimateMsgSize(msg) {
      if (!msg) return 0;
      const d = msg.data !== undefined ? msg.data : msg;
      if (typeof d === 'string') return Math.round(d.length * 0.75);
      if (Array.isArray(d) || d instanceof Uint8Array) return d.length;
      try { return JSON.stringify(msg).length; } catch(e) { return 0; }
    }
    function sanitizeTopicValue(v, key='', depth=0) {
      if (v === null || v === undefined) return v;
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        if (key === 'data' || v.length > 360) {
          return {
            type:'string',
            bytes:formatBytes(Math.round(v.length * 0.75)),
            preview:v.slice(0, 180) + (v.length > 180 ? ' ...' : '')
          };
        }
        return v;
      }
      if (Array.isArray(v) || v instanceof Uint8Array) {
        const arr = Array.from(v);
        if (key === 'data' || arr.length > 80) {
          return {type:'array', length:arr.length, preview:arr.slice(0, 24)};
        }
        return arr.map(item=>sanitizeTopicValue(item, '', depth + 1));
      }
      if (typeof v === 'object') {
        if (depth >= 5) return '[Object]';
        const out = {};
        const entries = Object.entries(v).slice(0, 80);
        for (const [k,val] of entries) out[k] = sanitizeTopicValue(val, k, depth + 1);
        if (Object.keys(v).length > entries.length) out.__truncatedKeys = Object.keys(v).length - entries.length;
        return out;
      }
      return String(v);
    }
    function topicMsgText(t, msg) {
      try {
        const formatter = AimScope.hooks && AimScope.hooks.topicFormatters && AimScope.hooks.topicFormatters.get(t.name);
        if (formatter) {
          const formatted = formatter(msg, t);
          return typeof formatted === 'string' ? formatted : JSON.stringify(formatted, null, 2);
        }
        return JSON.stringify(sanitizeTopicValue(msg), null, 2);
      }
      catch(e) { return String(msg); }
    }
    function rememberTopicMessage(t, msg, timeText) {
      t.lastMsg = sanitizeTopicValue(msg);
      t.lastMsgText = topicMsgText(t, msg);
      t.lastMsgTime = timeText || eventTime();
    }
    function clearTopicMessage(t) {
      t.lastMsg = null;
      t.lastMsgText = '';
      t.lastMsgTime = '--';
    }
    function selectTopic(t) {
      if (!t) return;
      topicInspect.open = true;
      topicInspect.name = t.name;
      topicInspect.copied = false;
    }
    function closeTopicInspector() { topicInspect.open = false; }
    function activeTopic() { return topicMap[topicInspect.name] || null; }
    function activeTopicLabel() { const t = activeTopic(); return t ? t.label : '--'; }
    function activeTopicName() { const t = activeTopic(); return t ? t.name : '--'; }
    function activeTopicType() { const t = activeTopic(); return t ? t.type : '--'; }
    function activeTopicState() { const t = activeTopic(); return t ? t.state : 'idle'; }
    function activeTopicCount() { const t = activeTopic(); return t ? t.count : 0; }
    function activeTopicUpdated() { const t = activeTopic(); return t ? t.lastMsgTime : '--'; }
    function activeTopicSize() { const t = activeTopic(); return t ? formatBytes(t.msgSize) : '--'; }
    function activeTopicText() {
      const t = activeTopic();
      return t && t.lastMsgText ? t.lastMsgText : '暂无消息';
    }
    async function copyTopicMessage() {
      const text = activeTopicText();
      if (!text || text === '暂无消息') return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
        else {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        topicInspect.copied = true;
        pushEvent('info', `已复制 ${activeTopicLabel()} 内容`, `topic-copy:${topicInspect.name}`, 500);
        setTimeout(()=>{ topicInspect.copied = false; }, 1200);
      } catch(e) {
        pushEvent('warn', 'Topic 内容复制失败', 'topic-copy-fail', 1000);
      }
    }
    function stampMs(msg) {
      const s = msg && msg.header && msg.header.stamp;
      if (!s) return null;
      const sec = Number(s.sec !== undefined ? s.sec : s.secs);
      const nsec = Number(s.nanosec !== undefined ? s.nanosec : s.nsecs);
      if (!Number.isFinite(sec) || sec <= 0) return null;
      return sec * 1000 + (Number.isFinite(nsec) ? nsec / 1e6 : 0);
    }
    function calcLatencyMs(msg, now) {
      const ms = stampMs(msg);
      if (ms === null) return null;
      const latency = now - ms;
      if (!Number.isFinite(latency) || latency < -5000 || latency > 86400000) return null;
      return Math.max(0, latency);
    }
    function setTopicState(t, next, reason) {
      const prev = t.state;
      t.state = next;
      if (next === 'ok' && (prev === 'warn' || prev === 'alarm')) {
        pushEvent('info', `${t.label} 恢复`, `${t.name}:recover`, 1000);
      } else if (next === 'warn' && prev !== 'warn') {
        pushEvent('warn', reason || `${t.label} 异常`, `${t.name}:warn`, 5000);
      } else if (next === 'alarm' && prev !== 'alarm') {
        pushEvent('error', reason || `${t.label} 报警`, `${t.name}:alarm`, 5000);
      }
    }
    function updateDiagSummary() {
      let warn = 0, alarm = 0;
      topicStatus.forEach(t=>{ if (t.state === 'alarm') alarm++; else if (t.state === 'warn') warn++; });
      alarmCount.value = alarm + warn;
      if (isPMode.value) {
        if (alarm) { diagLevel.value = 'alarm'; diagText.value = `回放报警 ${alarm}`; }
        else if (warn) { diagLevel.value = 'warn'; diagText.value = `回放警告 ${warn}`; }
        else { diagLevel.value = 'ok'; diagText.value = '回放正常'; }
      } else if (!isRosConnected.value) { diagLevel.value = 'idle'; diagText.value = '未连接'; }
      else if (alarm) { diagLevel.value = 'alarm'; diagText.value = `报警 ${alarm}`; }
      else if (warn) { diagLevel.value = 'warn'; diagText.value = `警告 ${warn}`; }
      else { diagLevel.value = 'ok'; diagText.value = '正常'; }
    }
    function noteTopic(name, msg) {
      const t = topicMap[name];
      if (!t) return;
      const now = Date.now();
      t.count++;
      t.lastAt = now;
      t.ageMs = 0;
      t.msgSize = estimateMsgSize(msg);
      t.latencyMs = calcLatencyMs(msg, now);
      rememberTopicMessage(t, msg, eventTime());
      let next = 'ok', reason = '';
      if (Number.isFinite(t.latencyMs) && t.latencyMs >= latencyAlarmMs) {
        next = 'alarm'; reason = `${t.label} 延迟 ${formatMs(t.latencyMs)}`;
      } else if (Number.isFinite(t.latencyMs) && t.latencyMs >= latencyWarnMs) {
        next = 'warn'; reason = `${t.label} 延迟 ${formatMs(t.latencyMs)}`;
      }
      setTopicState(t, next, reason);
      if (t.imageKey && imageStats[t.imageKey]) {
        imageStats[t.imageKey].latencyMs = t.latencyMs;
        imageStats[t.imageKey].ageMs = t.ageMs;
        imageStats[t.imageKey].msgSize = t.msgSize;
        imageStats[t.imageKey].state = t.state;
      }
      updateDiagSummary();
    }
    function refreshDiagnostics() {
      const now = Date.now();
      const dt = Math.max(0.001, (now - diagLastAt) / 1000);
      diagLastAt = now;
      if (isPMode.value && pbData) {
        updatePlaybackDiagnostics(pbCur.value);
        updateReportPreview();
        return;
      }
      topicStatus.forEach(t=>{
        t.hz = (t.count - t.lastCount) / dt;
        t.lastCount = t.count;
        t.ageMs = t.lastAt ? now - t.lastAt : null;
        let next = t.state;
        if (!isRosConnected.value) next = 'idle';
        else if (!t.lastAt) next = 'waiting';
        else if (t.ageMs >= t.alarmAfter) next = 'alarm';
        else if (t.ageMs >= t.warnAfter) next = 'warn';
        else if (Number.isFinite(t.latencyMs) && t.latencyMs >= latencyAlarmMs) next = 'alarm';
        else if (Number.isFinite(t.latencyMs) && t.latencyMs >= latencyWarnMs) next = 'warn';
        else next = 'ok';
        if (next === 'alarm') setTopicState(t, next, `${t.label} 断流 ${formatAge(t.ageMs)}`);
        else if (next === 'warn') setTopicState(t, next, `${t.label} 间隔 ${formatAge(t.ageMs)}`);
        else setTopicState(t, next);
        if (t.imageKey && imageStats[t.imageKey]) {
          imageStats[t.imageKey].ageMs = t.ageMs;
          imageStats[t.imageKey].msgSize = t.msgSize;
          imageStats[t.imageKey].state = t.state;
          imageStats[t.imageKey].latencyMs = t.latencyMs;
        }
      });
      updateDiagSummary();
      updateReportPreview();
    }
    function startDiagnostics() {
      refreshDiagnostics();
      diagT = setInterval(refreshDiagnostics, 1000);
    }

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

    const CHART_RENDER_MIN_MS = 50;
    let chartRenderTimer = 0, chartRenderRAF = 0, lastChartRenderAt = 0, pendingChartOverride = null;
    function renderChartsNow(override) {
      const ov = override || pendingChartOverride || undefined;
      pendingChartOverride = null;
      lastChartRenderAt = performance.now();
      if (chartIMU) chartIMU.render(ov);
      if (chartAngle) chartAngle.render(ov);
      if (chartDebug) chartDebug.render(ov);
    }
    function scheduleChartRender(override) {
      if (!showCharts.value) return;
      if (override) pendingChartOverride = Object.assign({}, pendingChartOverride || {}, override);
      if (chartRenderTimer || chartRenderRAF) return;
      const wait = Math.max(0, CHART_RENDER_MIN_MS - (performance.now() - lastChartRenderAt));
      chartRenderTimer = setTimeout(() => {
        chartRenderTimer = 0;
        chartRenderRAF = requestAnimationFrame(() => {
          chartRenderRAF = 0;
          renderChartsNow();
        });
      }, wait);
    }
    function cancelScheduledChartRender() {
      if (chartRenderTimer) { clearTimeout(chartRenderTimer); chartRenderTimer = 0; }
      if (chartRenderRAF) { cancelAnimationFrame(chartRenderRAF); chartRenderRAF = 0; }
      pendingChartOverride = null;
    }

    function updateChartsLive() {
      chartRollBuf.push(imuData.roll);chartPitchBuf.push(imuData.pitch);chartYawBuf.push(imuData.yaw);
      chartAXBuf.push(angleData.x);chartAYBuf.push(angleData.y);chartAZBuf.push(angleData.z);
      chartD0Buf.push(debugData.dbg0);chartD1Buf.push(debugData.dbg1);chartD2Buf.push(debugData.dbg2);
      scheduleChartRender();
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
      if (!d) return null;
      if (typeof d==='string'){
        let s=d.trim();
        const comma=s.indexOf(',');
        if (s.startsWith('data:')&&comma>=0) s=s.slice(comma+1);
        try{
          const b=atob(s);const a=new Uint8Array(b.length);
          for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);
          return a;
        }catch(e){
          const a=new Uint8Array(s.length);
          for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&255;
          return a;
        }
      }
      if (Array.isArray(d)) return new Uint8Array(d);
      if (d instanceof Uint8Array) return d;
      if (d instanceof ArrayBuffer) return new Uint8Array(d);
      if (d && d.buffer instanceof ArrayBuffer) return new Uint8Array(d.buffer);
      return null;
    }
    function renderCanvas(cv, data, done) {
      if (!cv) return;
      const blob = new Blob([data],{type:'image/jpeg'});
      const img = new Image();
      img.onload=()=>{cv.width=img.width;cv.height=img.height;cv.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(img.src);if(done)done();};
      img.onerror=()=>{URL.revokeObjectURL(img.src);if(done)done();};
      img.src=URL.createObjectURL(blob);
    }
    function flushCanvasFrame(kind) {
      const st = imageStreams[kind];
      if (!st || document.hidden || !st.pending) return;
      const payload = st.pending;
      st.pending = null;
      const data = decodeImageData(payload);
      if (!data) return;
      renderCanvas(st.canvasRef.value, data, () => {
        if (st.pending) requestCanvasFrame(kind);
      });
    }
    function requestCanvasFrame(kind) {
      const st = imageStreams[kind];
      if (!st || st.raf || document.hidden) return;
      st.raf = requestAnimationFrame(() => {
        st.raf = 0;
        flushCanvasFrame(kind);
      });
    }
    function queueCanvasFrame(kind, payload) {
      const st = imageStreams[kind];
      if (!st) return;
      st.pending = payload;
      if (kind === 'raw') rawImgReceived.value = true;
      if (kind === 'result') resultImgReceived.value = true;
      requestCanvasFrame(kind);
    }
    function onVisibilityChange() {
      if (!document.hidden) { requestCanvasFrame('raw'); requestCanvasFrame('result'); }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    // ---- 录制 ----
    const isRecording=ref(false),recordTimer=ref('00:00'),recordIncludeImages=ref(false);
    let recBuf={},recStart=0,recTI=null,recImgN=0;
    let recordEvents=[],recordMarkers=[];
    let recDirHandle=null; const recDirName=ref('');
    const lastSavedRecordingName = ref('');

    async function pickRecDir(){
      try{if(!window.showDirectoryPicker){alert('浏览器不支持。将使用下载方式。');return;}
        recDirHandle=await window.showDirectoryPicker({mode:'readwrite'});recDirName.value=recDirHandle.name;}
      catch(e){if(e.name!=='AbortError')console.error(e);}
    }
    function resetRecBuf(){
      recBuf={'/RmSerialData':[],'/auto_angle':[],'/debugpub':[],'/debugpub1':[],'/debugpub2':[]};
      if(recordIncludeImages.value){recBuf['/hikrobot_camera/rgb/compressed']=[];recBuf['/image_debug/compressed']=[];}
      recImgN=0;recordEvents=[];recordMarkers=[];
    }
    function recMsg(topic,data){if(!isRecording.value)return;const t=Date.now()-recStart;if(!recBuf[topic])recBuf[topic]=[];recBuf[topic].push({t,d:data});}
    function startRec(){if(isRecording.value)return;resetRecBuf();recStart=Date.now();isRecording.value=true;recordTimer.value='00:00';pushEvent('info','开始录制','record:start',1000);
      recTI=setInterval(()=>{const e=Math.floor((Date.now()-recStart)/1000);recordTimer.value=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');if(e>180)stopRec();},250);}
    function stopRec(){if(!isRecording.value)return;pushEvent('info','停止录制','record:stop',1000);isRecording.value=false;if(recTI){clearInterval(recTI);recTI=null;}saveRec();}
    function toggleRec(){isRecording.value?stopRec():startRec();}
    async function saveRec(){
      const dur=Date.now()-recStart,fname='aimscope_'+new Date().toISOString().replace(/[:.]/g,'-')+'.aimscope.json';
      const payload={version:'2.2',format:'aimscope-recording',metadata:{startTime:recStart,duration:dur,includesImages:recordIncludeImages.value,rosUrl:rosUrl.value,recordedAt:new Date().toISOString()},topics:recBuf,events:recordEvents.slice(),markers:recordMarkers.slice()};
      payload.report = buildReportPayload(payload);
      const json=JSON.stringify(payload); recBuf={};
      lastSavedRecordingName.value=fname;
      if(recDirHandle){try{const fh=await recDirHandle.getFileHandle(fname,{create:true});const w=await fh.createWritable();await w.write(json);await w.close();console.log('[AimScope] 已保存:',recDirName.value+'/'+fname);return;}catch(e){console.warn('目录保存失败:',e);recDirHandle=null;recDirName.value='';}}
      const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=fname;a.click();URL.revokeObjectURL(url);
    }

    // ---- 回放 ----
    const isPlaying=ref(false),isPaused=ref(false),isPMode=ref(false);
    const pbCur=ref(0),pbDur=ref(0),pbSpeed=ref(1),pbProgress=ref(0),pbTimeDisp=ref('00:00 / 00:00');
    const pbFrameInfo=reactive({index:0,total:0,topic:''});
    const pbMarkers=reactive([]);
    const pbTargetInfo=ref('--');
    const reportPreview=reactive({avgFps:'--',maxLatency:'--',dropouts:'0',alarms:'0',targetLost:'0',shoots:'0'});
    let pbData=null,pbRAF=null,pbStartWall=0,pbPausedOff=0,pbFrameTimes=[],pbFileName='';

    function fmtT(ms){const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
    function fmtPrecise(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+'.'+String(Math.floor(ms%1000)).padStart(3,'0');}
    function topicMessages(topicData) {
      if (Array.isArray(topicData)) return topicData;
      if (topicData && Array.isArray(topicData.messages)) return topicData.messages;
      return [];
    }
    function imagePayload(d) {
      if (d && typeof d === 'object' && d.data !== undefined) return d.data;
      return d;
    }
    function calcRecordingDuration(d) {
      if (d.metadata && Number.isFinite(d.metadata.duration)) return d.metadata.duration;
      let mx = 0;
      for (const td of Object.values(d.topics || {})) {
        for (const m of topicMessages(td)) if (Number.isFinite(m.t) && m.t > mx) mx = m.t;
      }
      return mx;
    }
    function normalizeRecording(d) {
      d.metadata = d.metadata || {};
      d.topics = d.topics || {};
      d.events = Array.isArray(d.events) ? d.events : [];
      d.markers = Array.isArray(d.markers) ? d.markers : [];
      d.metadata.duration = calcRecordingDuration(d);
      for (const td of Object.values(d.topics)) topicMessages(td).sort((a,b)=>(a.t||0)-(b.t||0));
      d.events.sort((a,b)=>(a.t||0)-(b.t||0));
      d.markers.sort((a,b)=>(a.t||0)-(b.t||0));
      return d;
    }
    function rebuildFrameTimes() {
      pbFrameTimes = [];
      if (!pbData) return;
      ['/hikrobot_camera/rgb/compressed','/image_debug/compressed'].forEach(topic=>{
        topicMessages(pbData.topics[topic]).forEach((m,i)=>pbFrameTimes.push({t:Number(m.t)||0,topic,index:i}));
      });
      pbFrameTimes.sort((a,b)=>a.t-b.t);
    }
    function loadPbFile(file){const r=new FileReader();r.onload=e=>{try{const d=normalizeRecording(JSON.parse(e.target.result));if(d.format!=='aimscope-recording'){alert('无效格式');return;}pbData=d;pbFileName=file.name;pbDur.value=d.metadata.duration;pbCur.value=0;pbProgress.value=0;pbSpeed.value=1;isPMode.value=true;isPlaying.value=false;isPaused.value=false;pbPausedOff=0;pbTimeDisp.value='00:00 / '+fmtT(d.metadata.duration);rebuildFrameTimes();pbMarkers.splice(0,pbMarkers.length,...d.markers.map((m,i)=>Object.assign({id:i+1,label:'问题标记'},m)));loadRecordingEvents(d);updateChartsPb(true);seekPb(0);updateReportPreview();}catch(err){alert('解析失败: '+err.message);}};r.readAsText(file);}
    function loadPbInput(e){const f=e.target.files[0];if(f)loadPbFile(f);e.target.value='';}
    function startPb(){if(!pbData||isPlaying.value)return;isPlaying.value=true;isPaused.value=false;pbStartWall=performance.now()-pbPausedOff;pbPausedOff=0;pbLoop();}
    function pausePb(){if(!isPlaying.value)return;isPlaying.value=false;isPaused.value=true;pbPausedOff=pbCur.value;if(pbRAF){cancelAnimationFrame(pbRAF);pbRAF=null;}}
    function stopPb(){isPlaying.value=false;isPaused.value=false;if(pbRAF){cancelAnimationFrame(pbRAF);pbRAF=null;}pbCur.value=0;pbProgress.value=0;pbPausedOff=0;pbTimeDisp.value='00:00 / '+fmtT(pbDur.value);seekPb(0);}
    function exitPb(){stopPb();isPMode.value=false;pbData=null;pbFileName='';pbFrameTimes=[];pbMarkers.splice(0);pbFrameInfo.index=0;pbFrameInfo.total=0;pbFrameInfo.topic='';pbTargetInfo.value='--';[chartRollBuf,chartPitchBuf,chartYawBuf,chartAXBuf,chartAYBuf,chartAZBuf,chartD0Buf,chartD1Buf,chartD2Buf].forEach(b=>b.clear());updateReportPreview();}
    function pbLoop(){if(!isPlaying.value)return;const now=performance.now(),elapsed=(now-pbStartWall)*pbSpeed.value,t=Math.min(elapsed,pbDur.value);pbCur.value=t;pbProgress.value=pbDur.value>0?(t/pbDur.value)*100:0;pbTimeDisp.value=fmtT(t)+' / '+fmtT(pbDur.value);seekPb(t);if(t>=pbDur.value){isPlaying.value=false;isPaused.value=false;pbPausedOff=pbDur.value;pbTimeDisp.value=fmtT(pbDur.value)+' / '+fmtT(pbDur.value);return;}pbRAF=requestAnimationFrame(pbLoop);}
    function seekPb(t){if(!pbData)return;t=Math.max(0,Math.min(pbDur.value,t));pbCur.value=t;pbProgress.value=pbDur.value>0?(t/pbDur.value)*100:0;pbTimeDisp.value=fmtT(t)+' / '+fmtT(pbDur.value);for(const[tn,td]of Object.entries(pbData.topics)){const ms=topicMessages(td);if(!ms.length)continue;const i=bsNear(ms,t);if(i>=0)applyPbMsg(tn,ms[i].d);}updateChartsPb(false,t);updatePlaybackDiagnostics(t);updatePbFrameInfo(t);}
    function bsNear(msgs,t){let lo=0,hi=msgs.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(msgs[mid].t<=t)lo=mid;else hi=mid-1;}return msgs[lo]&&msgs[lo].t<=t?lo:-1;}
    function applySerialData(d) {
      if (Array.isArray(d && d.data)) {
        d = {
          roll: d.data[0],
          pitch: d.data[1],
          yaw: d.data[2],
          camp: d.data[3],
          shoot_flag: d.data[4],
          bullet_vec: d.data[5],
        };
      }
      const nr = Number(pick(d,'Roll','roll') || 0), np = Number(pick(d,'Pitch','pitch') || 0), ny = Number(pick(d,'Yaw','yaw') || 0);
      imuData.roll=nr;imuData.pitch=np;imuData.yaw=ny;
      imuData.camp=Number(pick(d,'Camp','camp') || 0);
      const shoot=pick(d,'ShootFlag','shoot_flag','shootFlag');
      imuData.shoot=shoot===1||shoot===true;
      imuData.bulletVec=Number(pick(d,'BulletVec','bullet_vec','bulletVec') || 0);
      return {nr,np,ny};
    }
    function applyPbMsg(tn,d){switch(tn){case'/RmSerialData':case'/aimscope_demo/serial':applySerialData(d);break;case'/auto_angle':angleData.x=d.x;angleData.y=d.y;angleData.z=d.z;break;case'/debugpub':debugData.dbg0=d.data;break;case'/debugpub1':debugData.dbg1=d.data;break;case'/debugpub2':debugData.dbg2=d.data;break;case'/hikrobot_camera/rgb/compressed':queueCanvasFrame('raw',imagePayload(d));break;case'/image_debug/compressed':queueCanvasFrame('result',imagePayload(d));break;}}
    function seekPbPct(pct){if(!pbData)return;const t=(pct/100)*pbDur.value;seekPb(t);if(isPaused.value)pbPausedOff=t;}
    function ppToggle(){if(!isPMode.value)return;isPlaying.value?pausePb():startPb();}
    function seekRel(dms){if(!isPMode.value)return;const t=Math.max(0,Math.min(pbDur.value,pbCur.value+dms));seekPb(t);if(isPaused.value)pbPausedOff=t;if(!isPlaying.value&&!isPaused.value)pbPausedOff=t;}
    function stepPbFrame(dir) {
      if (!isPMode.value || !pbFrameTimes.length) return;
      if (isPlaying.value) pausePb();
      let idx = pbFrameTimes.findIndex(f=>f.t > pbCur.value + 0.5);
      if (idx < 0) idx = pbFrameTimes.length;
      const target = dir > 0 ? Math.min(pbFrameTimes.length - 1, idx) : Math.max(0, idx - 2);
      const t = pbFrameTimes[target].t;
      seekPb(t);pbPausedOff=t;isPaused.value=true;
    }
    function updateChartsPb(full,tMs){
      if(!showCharts.value||!pbData)return;
      const top=pbData.topics;
      function fill(tn,extract,bufs){
        const ms=topicMessages(top[tn]);if(!ms.length)return;
        let end=ms.length;if(tMs!==undefined)end=bsNear(ms,tMs)+1;
        const start=Math.max(0,end-CAP);bufs.forEach(b=>b.clear());
        for(let i=start;i<end;i++){const vals=extract(ms[i].d);vals.forEach((v,j)=>bufs[j].push(v));}
      }
      fill('/RmSerialData',d=>[pick(d,'Roll','roll')||0,pick(d,'Pitch','pitch')||0,pick(d,'Yaw','yaw')||0],[chartRollBuf,chartPitchBuf,chartYawBuf]);
      fill('/auto_angle',d=>[d.x,d.y,d.z],[chartAXBuf,chartAYBuf,chartAZBuf]);
      fill('/debugpub',d=>[d.data],[chartD0Buf]);fill('/debugpub1',d=>[d.data],[chartD1Buf]);fill('/debugpub2',d=>[d.data],[chartD2Buf]);
      const ov={isPlayback:true,totalDuration:pbDur.value,playheadTime:tMs!==undefined?tMs:0,showPlayhead:true};
      scheduleChartRender(ov);
    }

    function loadRecordingEvents(d) {
      eventLog.splice(0);
      const loaded = (d.events || []).slice(-70).reverse().map((e,i)=>({
        id:++eventSeq,
        time:e.t !== undefined ? fmtT(e.t) : (e.time || '--'),
        level:e.level || 'info',
        levelText:e.levelText || (e.level === 'error' ? '报警' : (e.level === 'warn' ? '警告' : '信息')),
        message:e.message || '录制事件'
      }));
      eventLog.push(...loaded);
      pushEvent('info', `已加载录制 ${pbFileName || ''}`, 'playback:loaded', 500);
    }
    function msgAt(topic, t) {
      if (!pbData) return null;
      const ms = topicMessages(pbData.topics[topic]);
      const i = bsNear(ms,t);
      return i >= 0 ? ms[i] : null;
    }
    function localHz(ms, idx) {
      if (!ms.length || idx <= 0) return 0;
      const prev = ms[Math.max(0, idx - 5)];
      const cur = ms[idx];
      const span = cur.t - prev.t;
      const n = idx - Math.max(0, idx - 5);
      return span > 0 ? n * 1000 / span : 0;
    }
    function playbackLatencyMs(m) {
      if (!pbData || !m || !m.d || !pbData.metadata || !Number.isFinite(pbData.metadata.startTime)) return null;
      const s = stampMs(m.d);
      if (s === null) return null;
      const lat = pbData.metadata.startTime + (Number(m.t)||0) - s;
      return Number.isFinite(lat) && lat >= 0 && lat < 86400000 ? lat : null;
    }
    function updatePlaybackDiagnostics(t) {
      if (!pbData) return;
      topicStatus.forEach(ts=>{
        const ms = topicMessages(pbData.topics[ts.name]);
        if (!ms.length) {
          ts.hz=0;ts.ageMs=null;ts.latencyMs=null;ts.msgSize=0;ts.state='idle';
          clearTopicMessage(ts);
          return;
        }
        const idx = bsNear(ms,t);
        if (idx < 0) {
          ts.hz=0;ts.ageMs=null;ts.latencyMs=null;ts.msgSize=0;ts.state='waiting';
          clearTopicMessage(ts);
          return;
        }
        const m = ms[idx];
        ts.hz = localHz(ms,idx);
        ts.ageMs = Math.max(0,t-(Number(m.t)||0));
        ts.msgSize = estimateMsgSize(m.d);
        ts.latencyMs = playbackLatencyMs(m);
        rememberTopicMessage(ts, m.d, fmtT(Number(m.t)||0));
        if (ts.ageMs >= ts.alarmAfter) ts.state='alarm';
        else if (ts.ageMs >= ts.warnAfter) ts.state='warn';
        else if (Number.isFinite(ts.latencyMs) && ts.latencyMs >= latencyAlarmMs) ts.state='alarm';
        else if (Number.isFinite(ts.latencyMs) && ts.latencyMs >= latencyWarnMs) ts.state='warn';
        else ts.state='ok';
        if (ts.imageKey && imageStats[ts.imageKey]) {
          imageStats[ts.imageKey].latencyMs=ts.latencyMs;
          imageStats[ts.imageKey].ageMs=ts.ageMs;
          imageStats[ts.imageKey].msgSize=ts.msgSize;
          imageStats[ts.imageKey].state=ts.state;
        }
      });
      rawFps.value = Math.round(topicMap['/hikrobot_camera/rgb/compressed'].hz || 0);
      resultFps.value = Math.round(topicMap['/image_debug/compressed'].hz || 0);
      displayFps.value = rawFps.value + resultFps.value;
      updateDiagSummary();
    }
    function updatePbFrameInfo(t) {
      pbFrameInfo.total = pbFrameTimes.length;
      if (!pbFrameTimes.length) { pbFrameInfo.index=0;pbFrameInfo.topic='';pbTargetInfo.value=extractTargetInfo(t);return; }
      let idx = pbFrameTimes.findIndex(f=>f.t > t + 0.5);
      if (idx < 0) idx = pbFrameTimes.length;
      idx = Math.max(0,idx-1);
      pbFrameInfo.index = idx + 1;
      pbFrameInfo.topic = pbFrameTimes[idx].topic.replace('/compressed','');
      pbTargetInfo.value = extractTargetInfo(t);
    }
    function extractTargetInfo(t) {
      if (!pbData) return '--';
      const candidates = ['/aimscope/target','/tracker/target','/target','/armor_detector/target'];
      for (const topic of candidates) {
        const m = msgAt(topic,t);
        if (!m) continue;
        const d = m.d || {};
        const id = pick(d,'id','target_id','armor_id');
        const conf = pick(d,'confidence','conf','score');
        const dist = pick(d,'distance','dist','range');
        const valid = pick(d,'valid','is_valid','tracking');
        const parts = [];
        if (id !== undefined) parts.push('ID '+id);
        if (conf !== undefined) parts.push('C '+Number(conf).toFixed(2));
        if (dist !== undefined) parts.push(Number(dist).toFixed(2)+'m');
        if (valid !== undefined) parts.push(valid?'有效':'无效');
        return parts.length ? parts.join(' / ') : topic;
      }
      return '--';
    }
    function markerLabel(n) { return '问题标记 ' + n; }
    function addMarker() {
      const base = isPMode.value ? pbCur.value : (isRecording.value ? Date.now()-recStart : 0);
      const label = (window.prompt && window.prompt('标记说明', markerLabel((isPMode.value?pbMarkers.length:recordMarkers.length)+1))) || markerLabel((isPMode.value?pbMarkers.length:recordMarkers.length)+1);
      const marker = {id:Date.now(),t:Math.max(0,base),label,time:eventTime()};
      if (isPMode.value && pbData) {
        pbMarkers.push(marker);
        pbMarkers.sort((a,b)=>a.t-b.t);
        pbData.markers = pbMarkers.map(({id,...m})=>m);
        pushEvent('info', `回放标记 ${fmtT(marker.t)} ${marker.label}`, 'marker:pb:'+marker.t, 500);
      } else if (isRecording.value) {
        recordMarkers.push(marker);
        pushEvent('info', `录制标记 ${fmtT(marker.t)} ${marker.label}`, 'marker:rec:'+marker.t, 500);
      } else {
        pushEvent('info', `手动标记 ${marker.label}`, 'marker:live', 500);
      }
    }
    function serialShootValue(d) {
      if (Array.isArray(d && d.data)) return Number(d.data[4] || 0) > 0;
      const v = pick(d,'ShootFlag','shoot_flag','shootFlag');
      return v === 1 || v === true;
    }
    function countShoots(topics) {
      let count = 0, prev = false;
      ['/RmSerialData','/aimscope_demo/serial'].forEach(topic=>{
        topicMessages(topics[topic]).forEach(m=>{
          const cur = serialShootValue(m.d);
          if (cur && !prev) count++;
          prev = cur;
        });
      });
      return count;
    }
    function topicDropouts(topic, ms) {
      const def = topicMap[topic] || topicDefs.find(t=>t.name===topic) || {warnAfter:2000};
      let n = 0;
      for (let i=1;i<ms.length;i++) if ((ms[i].t-ms[i-1].t) > def.warnAfter) n++;
      return n;
    }
    function avgHz(ms, dur) {
      if (!ms || ms.length < 2 || dur <= 0) return 0;
      return (ms.length - 1) * 1000 / dur;
    }
    function maxRecordingLatency(data) {
      let mx = null;
      const start = Number(data.metadata && data.metadata.startTime);
      if (!Number.isFinite(start)) return null;
      ['/hikrobot_camera/rgb/compressed','/image_debug/compressed'].forEach(topic=>{
        topicMessages(data.topics[topic]).forEach(m=>{
          const s = stampMs(m.d);
          if (s !== null) {
            const lat = start + (Number(m.t)||0) - s;
            if (Number.isFinite(lat) && lat >= 0 && lat < 86400000) mx = mx === null ? lat : Math.max(mx,lat);
          }
        });
      });
      return mx;
    }
    function buildReportPayload(data) {
      data = data || pbData;
      if (!data) return buildLiveReportPayload();
      const dur = Number(data.metadata && data.metadata.duration) || calcRecordingDuration(data);
      const raw = topicMessages(data.topics['/hikrobot_camera/rgb/compressed']);
      const result = topicMessages(data.topics['/image_debug/compressed']);
      const topicSummary = {};
      let dropouts = 0;
      Object.keys(data.topics || {}).forEach(topic=>{
        const ms = topicMessages(data.topics[topic]);
        const d = topicDropouts(topic,ms);
        dropouts += d;
        topicSummary[topic] = {messages:ms.length,avgHz:avgHz(ms,dur),dropouts:d};
      });
      const events = data.events || [];
      const alarms = events.filter(e=>e.level==='error').length;
      const targetLost = events.filter(e=>/目标丢失|无目标|target lost|lost target/i.test(e.message||'')).length;
      return {
        generatedAt:new Date().toISOString(),
        source:data.metadata && data.metadata.fileName || pbFileName || lastSavedRecordingName.value || 'current-recording',
        durationMs:dur,
        summary:{
          avgRawFps:avgHz(raw,dur),
          avgResultFps:avgHz(result,dur),
          avgImageFps:(avgHz(raw,dur)+avgHz(result,dur))/2,
          maxLatencyMs:maxRecordingLatency(data),
          dropouts,
          alarms,
          warnings:events.filter(e=>e.level==='warn').length,
          targetLost,
          shoots:countShoots(data.topics || {}),
          markers:(data.markers || []).length,
        },
        topics:topicSummary,
        events,
        markers:data.markers || [],
      };
    }
    function buildLiveReportPayload() {
      const dur = Math.max(1,Date.now()-sessionStartAt);
      const events = eventLog.slice().map(e=>({time:e.time,level:e.level,message:e.message}));
      return {
        generatedAt:new Date().toISOString(),
        source:'live-session',
        durationMs:dur,
        summary:{
          avgRawFps:topicMap['/hikrobot_camera/rgb/compressed'].hz || 0,
          avgResultFps:topicMap['/image_debug/compressed'].hz || 0,
          avgImageFps:((topicMap['/hikrobot_camera/rgb/compressed'].hz || 0)+(topicMap['/image_debug/compressed'].hz || 0))/2,
          maxLatencyMs:Math.max(topicMap['/hikrobot_camera/rgb/compressed'].latencyMs || 0,topicMap['/image_debug/compressed'].latencyMs || 0) || null,
          dropouts:eventLog.filter(e=>/断流/.test(e.message)).length,
          alarms:eventLog.filter(e=>e.level==='error').length,
          warnings:eventLog.filter(e=>e.level==='warn').length,
          targetLost:eventLog.filter(e=>/目标丢失|无目标|target lost|lost target/i.test(e.message||'')).length,
          shoots:0,
          markers:0,
        },
        topics:Object.fromEntries(topicStatus.map(t=>[t.name,{messages:t.count,avgHz:t.hz,dropouts:0}])),
        events,
        markers:[],
      };
    }
    function updateReportPreview() {
      const r = buildReportPayload(pbData);
      reportPreview.avgFps = Number.isFinite(r.summary.avgImageFps) ? r.summary.avgImageFps.toFixed(1) : '--';
      reportPreview.maxLatency = r.summary.maxLatencyMs === null ? '--' : formatMs(r.summary.maxLatencyMs);
      reportPreview.dropouts = String(r.summary.dropouts || 0);
      reportPreview.alarms = String(r.summary.alarms || 0);
      reportPreview.targetLost = String(r.summary.targetLost || 0);
      reportPreview.shoots = String(r.summary.shoots || 0);
    }
    function reportMarkdown(r) {
      const lines = [];
      lines.push('# AimScope 测试报告');
      lines.push('');
      lines.push(`生成时间：${r.generatedAt}`);
      lines.push(`来源：${r.source}`);
      lines.push(`时长：${fmtPrecise(r.durationMs)}`);
      lines.push('');
      lines.push('## 汇总');
      lines.push(`- 平均 Raw FPS：${r.summary.avgRawFps.toFixed(2)}`);
      lines.push(`- 平均 Result FPS：${r.summary.avgResultFps.toFixed(2)}`);
      lines.push(`- 最大延迟：${r.summary.maxLatencyMs === null ? '--' : formatMs(r.summary.maxLatencyMs)}`);
      lines.push(`- 断流次数：${r.summary.dropouts}`);
      lines.push(`- 报警次数：${r.summary.alarms}`);
      lines.push(`- 警告次数：${r.summary.warnings}`);
      lines.push(`- 目标丢失次数：${r.summary.targetLost}`);
      lines.push(`- 开火次数：${r.summary.shoots}`);
      lines.push(`- 标记数量：${r.summary.markers}`);
      lines.push('');
      lines.push('## Topic');
      lines.push('| Topic | 消息数 | 平均 Hz | 断流 |');
      lines.push('|---|---:|---:|---:|');
      Object.entries(r.topics).forEach(([topic,s])=>lines.push(`| ${topic} | ${s.messages} | ${s.avgHz.toFixed(2)} | ${s.dropouts} |`));
      lines.push('');
      lines.push('## 标记');
      if (!r.markers.length) lines.push('无');
      r.markers.forEach(m=>lines.push(`- ${fmtPrecise(m.t || 0)} ${m.label || '问题标记'}`));
      lines.push('');
      lines.push('## 事件日志');
      if (!r.events.length) lines.push('无');
      r.events.forEach(e=>lines.push(`- ${e.t !== undefined ? fmtPrecise(e.t) : (e.time || '--')} [${e.level || 'info'}] ${e.message || ''}`));
      return lines.join('\n');
    }
    function downloadText(name, text, type='text/plain') {
      const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
    }
    function exportReport() {
      const r = buildReportPayload(pbData);
      const name = 'aimscope_report_'+new Date().toISOString().replace(/[:.]/g,'-')+'.md';
      downloadText(name,reportMarkdown(r),'text/markdown');
      pushEvent('info','已导出测试报告','report:export',1000);
    }
    function sliceTopicMessages(ms,start,end) {
      return ms.filter(m=>m.t>=start&&m.t<=end).map(m=>Object.assign({},m,{t:m.t-start}));
    }
    function exportSegment() {
      if (!pbData) { alert('请先加载录制文件'); return; }
      const pad = 5000,start=Math.max(0,pbCur.value-pad),end=Math.min(pbDur.value,pbCur.value+pad);
      const topics = {};
      Object.entries(pbData.topics || {}).forEach(([topic,td])=>{ const ms=sliceTopicMessages(topicMessages(td),start,end); if(ms.length)topics[topic]=ms; });
      const payload={version:'2.2',format:'aimscope-recording',metadata:Object.assign({},pbData.metadata,{duration:end-start,segmentStart:start,segmentEnd:end,sourceFile:pbFileName,exportedAt:new Date().toISOString()}),topics,events:(pbData.events||[]).filter(e=>e.t>=start&&e.t<=end).map(e=>Object.assign({},e,{t:e.t-start})),markers:(pbData.markers||[]).filter(m=>m.t>=start&&m.t<=end).map(m=>Object.assign({},m,{t:m.t-start}))};
      payload.report=buildReportPayload(payload);
      downloadText('aimscope_segment_'+fmtPrecise(start).replace(/[:.]/g,'-')+'_'+fmtPrecise(end).replace(/[:.]/g,'-')+'.aimscope.json',JSON.stringify(payload),'application/json');
      pushEvent('info',`已导出片段 ${fmtT(start)}-${fmtT(end)}`,'segment:export',1000);
    }

    // ---- ROS 连接 ----
    let ros=null, rosGeneration=0, reconnectTimer=null, reconnectAttempt=0, manualDisconnect=false;
    let rosTopics=[];
    function clearReconnect() { if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer=null; } }
    function clearRosTopics() { rosTopics.forEach(t=>{try{t.unsubscribe();}catch(e){}}); rosTopics=[]; }
    function cleanupROS(closeSocket=true) {
      rosGeneration++;
      clearRosTopics();
      if (ros && closeSocket) { const old=ros; ros=null; try{old.close();}catch(e){} }
      else ros=null;
      isRosConnected.value=false;
    }
    function scheduleReconnect() {
      if (manualDisconnect || reconnectTimer) return;
      const delay = Math.min(8000, 1000 + reconnectAttempt * 1000);
      reconnectTimer = setTimeout(() => { reconnectTimer=null; connectROS(); }, delay);
    }
    function subTopic(opts, cb) {
      const t = new ROSLIB.Topic(Object.assign({ros, queue_length:1}, opts));
      t.subscribe(cb);
      rosTopics.push(t);
      return t;
    }
    function applyRosUrl() {
      rosUrl.value = normalizeRosUrl(rosUrlDraft.value);
      rosUrlDraft.value = rosUrl.value;
      localStorage.setItem('aimscope-ros-url', rosUrl.value);
      localStorage.setItem('aimscope-ros-version', rosVersion.value);
      connectROS();
    }
    function disconnectROS() {
      manualDisconnect = true;
      clearReconnect();
      cleanupROS(true);
      connStatus.value='已断开'; connClass.value='disconnected'; connLastError.value='';
      pushEvent('info', 'ROS Bridge 已断开', 'ros:manual-disconnect', 1000);
    }
    function connectROS(){
      manualDisconnect=false;
      clearReconnect();
      cleanupROS(true);
      rosUrl.value = normalizeRosUrl(rosUrl.value);
      rosUrlDraft.value = rosUrl.value;
      localStorage.setItem('aimscope-ros-url', rosUrl.value);
      localStorage.setItem('aimscope-ros-version', rosVersion.value);
      connStatus.value='连接中...'; connClass.value='connecting'; connLastError.value='';
      const gen = ++rosGeneration;
      ros=new ROSLIB.Ros({url:rosUrl.value});
      ros.on('connection',()=>{if(gen!==rosGeneration)return;isRosConnected.value=true;reconnectAttempt=0;connStatus.value='已连接';connClass.value='connected';pushEvent('info', `ROS Bridge 已连接 ${rosUrl.value}`, 'ros:connected', 1000);});
      ros.on('error',e=>{if(gen!==rosGeneration)return;connStatus.value='错误';connClass.value='disconnected';connLastError.value=e&&e.message?e.message:'ROS Bridge 连接失败';pushEvent('error', connLastError.value, 'ros:error', 3000);console.error(e);});
      ros.on('close',()=>{if(gen!==rosGeneration)return;isRosConnected.value=false;if(manualDisconnect){connStatus.value='已断开';connClass.value='disconnected';return;}reconnectAttempt++;connStatus.value='断开，重连中...';connClass.value='connecting';pushEvent('warn', 'ROS Bridge 断开，准备重连', 'ros:close', 2000);scheduleReconnect();});
      subTopic({name:'/auto_angle',messageType:msgType('geometry_msgs/Vector3','geometry_msgs/msg/Vector3')},m=>{if(isPMode.value)return;noteTopic('/auto_angle',m);angleData.x=m.x;angleData.y=m.y;angleData.z=m.z;recMsg('/auto_angle',{x:m.x,y:m.y,z:m.z});});
      subTopic({name:'/RmSerialData',messageType:msgType('rm_msgs/RmSerial','rm_msgs/msg/RmSerial')},m=>{if(isPMode.value)return;noteTopic('/RmSerialData',m);const {nr,np,ny}=applySerialData(m);if(Math.abs(nr-prevImu.roll)>0.05)triggerFlash('roll');if(Math.abs(np-prevImu.pitch)>0.05)triggerFlash('pitch');if(Math.abs(ny-prevImu.yaw)>0.3)triggerFlash('yaw');prevImu.roll=nr;prevImu.pitch=np;prevImu.yaw=ny;recMsg('/RmSerialData',{Roll:nr,Pitch:np,Yaw:ny,Camp:imuData.camp,ShootFlag:imuData.shoot?1:0,BulletVec:imuData.bulletVec});updateChartsLive();update3D();});
      subTopic({name:'/aimscope_demo/serial',messageType:msgType('std_msgs/Float64MultiArray','std_msgs/msg/Float64MultiArray')},m=>{if(isPMode.value)return;noteTopic('/aimscope_demo/serial',m);const {nr,np,ny}=applySerialData(m);if(Math.abs(nr-prevImu.roll)>0.05)triggerFlash('roll');if(Math.abs(np-prevImu.pitch)>0.05)triggerFlash('pitch');if(Math.abs(ny-prevImu.yaw)>0.3)triggerFlash('yaw');prevImu.roll=nr;prevImu.pitch=np;prevImu.yaw=ny;recMsg('/RmSerialData',{Roll:nr,Pitch:np,Yaw:ny,Camp:imuData.camp,ShootFlag:imuData.shoot?1:0,BulletVec:imuData.bulletVec});updateChartsLive();update3D();});
      subTopic({name:'/debugpub',messageType:msgType('std_msgs/Float64','std_msgs/msg/Float64')},m=>{if(isPMode.value)return;noteTopic('/debugpub',m);debugData.dbg0=m.data;recMsg('/debugpub',{data:m.data});});
      subTopic({name:'/debugpub1',messageType:msgType('std_msgs/Float64','std_msgs/msg/Float64')},m=>{if(isPMode.value)return;noteTopic('/debugpub1',m);debugData.dbg1=m.data;recMsg('/debugpub1',{data:m.data});});
      subTopic({name:'/debugpub2',messageType:msgType('std_msgs/Float64','std_msgs/msg/Float64')},m=>{if(isPMode.value)return;noteTopic('/debugpub2',m);debugData.dbg2=m.data;recMsg('/debugpub2',{data:m.data});});
      subTopic({name:'/armor_array',messageType:msgType('rm_msgs/ArmorArray','rm_msgs/msg/ArmorArray')},m=>{if(isPMode.value)return;noteTopic('/armor_array',m);recMsg('/armor_array',m);});
      subTopic({name:'/hikrobot_camera/rgb/compressed',messageType:msgType('sensor_msgs/CompressedImage','sensor_msgs/msg/CompressedImage'),throttle_rate:0},m=>{if(isPMode.value)return;noteTopic('/hikrobot_camera/rgb/compressed',m);rfc++;if(activeView.value==='raw')queueCanvasFrame('raw',m.data);else rawImgReceived.value=true;if(isRecording.value&&recordIncludeImages.value){recImgN++;if(recImgN%5===0&&typeof m.data==='string')recMsg('/hikrobot_camera/rgb/compressed',{data:m.data,header:m.header,format:m.format});}});
      subTopic({name:'/image_debug/compressed',messageType:msgType('sensor_msgs/CompressedImage','sensor_msgs/msg/CompressedImage'),throttle_rate:0},m=>{if(isPMode.value)return;noteTopic('/image_debug/compressed',m);rsc++;if(activeView.value==='result')queueCanvasFrame('result',m.data);else resultImgReceived.value=true;if(isRecording.value&&recordIncludeImages.value){if(recImgN%5===0&&typeof m.data==='string')recMsg('/image_debug/compressed',{data:m.data,header:m.header,format:m.format});}});
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
      s.src = 'vendor/three.min.js';
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
      connectROS();startFps();startDiagnostics();startTs();
      document.addEventListener('keydown',onKD);
      nextTick(()=>{ initCharts(); });
      // v3.0: preload data for tabs
      if (ReplayAPI) loadReplaySessions();
      if (ParamAPI) loadParamConfigs();
    });
    onUnmounted(()=>{
      disconnectROS();if(tsT)clearInterval(tsT);if(fpsT)clearInterval(fpsT);if(diagT)clearInterval(diagT);
      if(recTI)clearInterval(recTI);if(pbRAF)cancelAnimationFrame(pbRAF);
      if(replayPlayTimer)clearInterval(replayPlayTimer);
      if(paramEditor)paramEditor.destroy();
      cancelScheduledChartRender();
      document.removeEventListener('keydown',onKD);document.removeEventListener('visibilitychange',onVisibilityChange);destroy3D();
      if(chartIMU)chartIMU.destroy();if(chartAngle)chartAngle.destroy();if(chartDebug)chartDebug.destroy();
    });
    watch(activeView,(nv,ov)=>{if(nv==='3d')nextTick(()=>init3D());else if(ov==='3d')destroy3D();});
    watch(theme,()=>{if(chartIMU)chartIMU.setTheme(theme.value==='dark');if(chartAngle)chartAngle.setTheme(theme.value==='dark');if(chartDebug)chartDebug.setTheme(theme.value==='dark');});

    // ---- 暴露给模板 ----
    return {
      // v2.x existing
      theme,toggleTheme,connStatus,connClass,connLastError,isRosConnected,
      rosUrl,rosUrlDraft,rosVersion,applyRosUrl,disconnectROS,connectROS,
      imuData,angleData,debugData,flashKeys,timestamp,displayFps,rawFps,resultFps,
      topicStatus,eventLog,alarmCount,diagLevel,diagText,imageStats,
      latencyWarnMs,latencyAlarmMs,
      formatHz,formatMs,formatAge,formatBytes,clearEvents,
      topicInspect,selectTopic,closeTopicInspector,copyTopicMessage,
      activeTopicLabel,activeTopicName,activeTopicType,activeTopicState,
      activeTopicCount,activeTopicUpdated,activeTopicSize,activeTopicText,
      fmtT,pbFrameInfo,pbMarkers,pbTargetInfo,reportPreview,
      activeView,rawImgReceived,resultImgReceived,threeReady,
      rawCanvas,resultCanvas,mainContent,threeContainer,init3D,
      isRecording,recordTimer,recordIncludeImages,toggleRec,recDirName,pickRecDir,
      addMarker,exportReport,exportSegment,
      isPlaying,isPaused,isPMode,pbCur,pbDur,pbSpeed,pbProgress,pbTimeDisp,
      loadPbInput,ppToggle,stopPb,exitPb,seekPbPct,seekRel,stepPbFrame,seekPb,
      showCharts,chartIMUCanvas,chartAngleCanvas,chartDebugCanvas,chartRanges,applyChartRange,

      // v3.0 tabs & auth
      activeTab,switchTab,
      showLogin,loginMode,authUser,loginForm,loginError,doLogin,doLogout,

      // v3.0 replay
      replaySessions,activeReplayId,uploadProgress,
      replayPlaying,replayCursor,replayDuration,replayTopics,replayTopicFilter,
      analysisEvents,
      triggerUpload,handleFileDrop,handleReplayUpload,
      selectReplaySession,seekReplayMs,replayPlayPause,

      // v3.0 params
      paramConfigs,activeParamId,activeParamName,paramViewMode,paramVersions,
      diffV1,diffV2,
      selectParamConfig,newParamConfig,saveParamConfig,
      viewParamVersion,rollbackParam,loadDiff,

      // v3.0 benchmark
      benchmarkRuns,activeBenchmarkId,activeBenchmark,showNewBenchmark,newBenchmark,
      selectBenchmark,createBenchmark,

      // v3.0 utils
      fmtMs,renderMarkdown,parseMetrics,
    };
  }});
  app.mount('#app');
});
