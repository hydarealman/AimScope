/* AimScope panel resize handles. */
// ============================================================
// 列 resize 手柄逻辑
// ============================================================
(function() {
  let dragging = null, dragKind = '', startX = 0, startY = 0, startSize = 0;
  document.addEventListener('mousedown', function(e) {
    const el = e.target.closest('.col-resize,.row-resize');
    if (!el) return;
    dragKind = el.classList.contains('row-resize') ? 'row' : 'col';
    dragging = dragKind === 'row' ? el.dataset.row : el.dataset.col;
    startX = e.clientX;
    startY = e.clientY;
    el.classList.add('active');
    const root = document.documentElement;
    if (dragging === 'sidebar') startSize = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-w'));
    if (dragging === 'img') startSize = parseInt(getComputedStyle(root).getPropertyValue('--img-w'));
    if (dragging === 'diag') startSize = parseInt(getComputedStyle(root).getPropertyValue('--diag-h'));
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const root = document.documentElement;
    if (dragging === 'sidebar') root.style.setProperty('--sidebar-w', Math.max(160, Math.min(400, startSize + dx)) + 'px');
    if (dragging === 'img') {
      const sidebarW = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-w')) || 216;
      const maxImgW = Math.max(420, window.innerWidth - sidebarW - 4 - 4 - 360);
      root.style.setProperty('--img-w', Math.max(420, Math.min(maxImgW, startSize + dx)) + 'px');
    }
    if (dragging === 'diag') {
      const maxDiagH = Math.max(180, window.innerHeight - 260);
      root.style.setProperty('--diag-h', Math.max(150, Math.min(maxDiagH, startSize + dy)) + 'px');
    }
  });
  document.addEventListener('mouseup', function() {
    if (dragging) {
      document.querySelectorAll('.col-resize,.row-resize').forEach(el => el.classList.remove('active'));
      dragging = null;
      dragKind = '';
      // ResizeObserver 会自动触发图表重绘
    }
  });
})();
