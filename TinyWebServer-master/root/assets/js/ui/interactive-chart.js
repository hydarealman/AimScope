/* AimScope interactive canvas chart. */
(function(window) {
  const AimScope = window.AimScope = window.AimScope || {};

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
    this._renderRAF = 0;
    this._pendingOverride = null;
    this._init();
  }

  _init() {
    this.cvs.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    this.cvs.addEventListener('mousedown', e => this._onDown(e));
    window.addEventListener('mousemove', e => this._onMove(e));
    window.addEventListener('mouseup', () => this._onUp());
    this.cvs.addEventListener('dblclick', () => this._reset());
    this.cvs.style.cursor = 'crosshair';
    this._resizeObs = new ResizeObserver(() => { this.requestRender(); });
    this._resizeObs.observe(this.cvs);
    // 延迟首帧渲染，确保 DOM 布局完成
    requestAnimationFrame(() => { requestAnimationFrame(() => this.requestRender()); });
  }

  destroy() {
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
    if (this._renderRAF) { cancelAnimationFrame(this._renderRAF); this._renderRAF = 0; }
  }

  requestRender(override) {
    if (override) this._pendingOverride = Object.assign({}, this._pendingOverride || {}, override);
    if (this._renderRAF) return;
    this._renderRAF = requestAnimationFrame(() => {
      const pending = this._pendingOverride;
      this._pendingOverride = null;
      this._renderRAF = 0;
      this.render(pending);
    });
  }

  setTheme(isDark) {
    this.opts.bg = isDark ? '#252536' : '#ffffff';
    this.opts.text = isDark ? '#999' : '#777';
    this.opts.grid = isDark ? '#333' : '#e5e7eb';
    this.requestRender();
  }

  setYRange(ymin, ymax) { this.opts.yMin = ymin; this.opts.yMax = ymax; this.opts.yAuto = false; this.requestRender(); }
  setWindow(s) { this.opts.windowSec = Math.max(1, Math.min(600, s)); this.requestRender(); }

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
    this.requestRender();
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
    this.requestRender();
  }

  _onUp() { this._drag.on = false; this.cvs.style.cursor = 'crosshair'; }

  _reset() {
    this.opts.yAuto = true;
    this.opts.yMin = this._origYMin; this.opts.yMax = this._origYMax;
    this.opts.windowSec = this._origWindow;
    this.requestRender();
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

  AimScope.InteractiveChart = InteractiveChart;
})(window);
