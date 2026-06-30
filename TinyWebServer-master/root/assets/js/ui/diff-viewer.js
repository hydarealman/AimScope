/**
 * AimScope v3.0 — Diff Viewer
 * Two-column side-by-side diff display.
 * No external dependencies.
 */
(function() {
  window.AimScope = window.AimScope || {};

  /**
   * Compute a simple line-based diff between two texts.
   * Returns array of { type: 'add'|'remove'|'same', lineA, lineB, text }
   */
  function computeDiff(oldText, newText) {
    var oldLines = (oldText || '').split('\n');
    var newLines = (newText || '').split('\n');
    var result = [];

    // Simple LCS-based diff for small files
    var m = oldLines.length;
    var n = newLines.length;

    // Build LCS table
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = [];
      for (var j = 0; j <= n; j++) {
        dp[i][j] = 0;
      }
    }
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack
    var diff = [];
    var i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diff.unshift({ type: 'same', oldLine: i, newLine: j, text: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'add', oldLine: null, newLine: j, text: newLines[j - 1] });
        j--;
      } else {
        diff.unshift({ type: 'remove', oldLine: i, newLine: null, text: oldLines[i - 1] });
        i--;
      }
    }

    return diff;
  }

  /**
   * Render diff into container.
   * opts: { oldText, newText, oldLabel, newLabel }
   * Returns: { destroy() }
   */
  AimScope.DiffViewer = function(container, opts) {
    opts = opts || {};
    var oldText = opts.oldText || '';
    var newText = opts.newText || '';

    // Style injection (once)
    if (!AimScope.DiffViewer._stylesInjected) {
      AimScope.DiffViewer._stylesInjected = true;
      var style = document.createElement('style');
      style.textContent = [
        '.dv-container { display:flex; height:100%; gap:0; font-family:var(--mono); font-size:12px; }',
        '.dv-panel { flex:1; overflow:auto; display:flex; flex-direction:column; min-width:0; }',
        '.dv-panel + .dv-panel { border-left:2px solid var(--border); }',
        '.dv-header { padding:6px 12px; font-size:11px; font-weight:600; background:var(--bg2); border-bottom:1px solid var(--border); color:var(--text2); position:sticky; top:0; z-index:1; }',
        '.dv-line { display:flex; line-height:1.5; min-height:1.5em; }',
        '.dv-ln { flex:0 0 44px; text-align:right; padding:0 8px; color:var(--text3); user-select:none; background:var(--bg2); border-right:1px solid var(--border); }',
        '.dv-content { flex:1; padding:0 10px; white-space:pre-wrap; word-break:break-all; }',
        '.dv-add .dv-content { background:rgba(34,197,94,0.1); color:var(--green); }',
        '.dv-remove .dv-content { background:rgba(239,68,68,0.1); color:var(--red); }',
        '.dv-empty .dv-content { background:var(--bg2); }',
        '.dv-add .dv-ln { background:rgba(34,197,94,0.15); color:var(--green); }',
        '.dv-remove .dv-ln { background:rgba(239,68,68,0.15); color:var(--red); }',
        '.dv-stats { padding:6px 12px; font-size:11px; color:var(--text2); border-bottom:1px solid var(--border); }',
        '.dv-stats .added { color:var(--green); margin-right:12px; }',
        '.dv-stats .removed { color:var(--red); }',
      ].join('\n');
      document.head.appendChild(style);
    }

    var diff = computeDiff(oldText, newText);

    // Count stats
    var added = 0, removed = 0;
    diff.forEach(function(d) {
      if (d.type === 'add') added++;
      else if (d.type === 'remove') removed++;
    });

    // Build DOM
    var wrapper = document.createElement('div');
    wrapper.className = 'dv-container';

    var statsBar = document.createElement('div');
    statsBar.style.cssText = 'position:absolute;top:0;left:0;right:0;';
    statsBar.className = 'dv-stats';

    // Left panel (old)
    var leftPanel = document.createElement('div');
    leftPanel.className = 'dv-panel';
    var leftHeader = document.createElement('div');
    leftHeader.className = 'dv-header';
    leftHeader.textContent = opts.oldLabel || '旧版本';
    leftPanel.appendChild(leftHeader);

    // Right panel (new)
    var rightPanel = document.createElement('div');
    rightPanel.className = 'dv-panel';
    var rightHeader = document.createElement('div');
    rightHeader.className = 'dv-header';
    rightHeader.textContent = opts.newLabel || '新版本';
    rightPanel.appendChild(rightHeader);

    // Build lines
    var leftScroll, rightScroll;
    var leftContent = document.createElement('div');
    leftContent.style.flex = '1';
    leftContent.style.overflow = 'auto';
    var rightContent = document.createElement('div');
    rightContent.style.flex = '1';
    rightContent.style.overflow = 'auto';

    diff.forEach(function(d) {
      // Left
      var leftLine = document.createElement('div');
      leftLine.className = 'dv-line';
      if (d.type === 'remove') leftLine.classList.add('dv-remove');
      if (d.type === 'add') leftLine.classList.add('dv-empty');

      var leftLn = document.createElement('span');
      leftLn.className = 'dv-ln';
      leftLn.textContent = d.oldLine || '';
      leftLine.appendChild(leftLn);

      var leftText = document.createElement('span');
      leftText.className = 'dv-content';
      leftText.textContent = d.type === 'add' ? '' : d.text;
      leftLine.appendChild(leftText);

      leftContent.appendChild(leftLine);

      // Right
      var rightLine = document.createElement('div');
      rightLine.className = 'dv-line';
      if (d.type === 'add') rightLine.classList.add('dv-add');
      if (d.type === 'remove') rightLine.classList.add('dv-empty');

      var rightLn = document.createElement('span');
      rightLn.className = 'dv-ln';
      rightLn.textContent = d.newLine || '';
      rightLine.appendChild(rightLn);

      var rightText = document.createElement('span');
      rightText.className = 'dv-content';
      rightText.textContent = d.type === 'remove' ? '' : d.text;
      rightLine.appendChild(rightText);

      rightContent.appendChild(rightLine);
    });

    // Sync scroll
    leftContent.addEventListener('scroll', function() {
      rightContent.scrollTop = leftContent.scrollTop;
    });
    rightContent.addEventListener('scroll', function() {
      leftContent.scrollTop = rightContent.scrollTop;
    });

    leftPanel.appendChild(leftContent);
    rightPanel.appendChild(rightContent);
    wrapper.appendChild(leftPanel);
    wrapper.appendChild(rightPanel);

    // Stats summary bar
    var summaryEl = document.createElement('div');
    summaryEl.className = 'dv-stats';
    summaryEl.innerHTML = '<span class="added">+ ' + added + ' 行</span><span class="removed">- ' + removed + ' 行</span>';
    summaryEl.style.cssText = 'position:sticky;top:0;z-index:1;';

    // Insert after headers
    leftContent.parentElement.insertBefore(summaryEl.cloneNode(true), leftContent);

    container.appendChild(wrapper);

    return {
      destroy: function() {
        container.removeChild(wrapper);
      }
    };
  };
})();
