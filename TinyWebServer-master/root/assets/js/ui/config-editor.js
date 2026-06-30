/**
 * AimScope v3.0 — Config Editor
 * Lightweight YAML/JSON editor with line numbers and basic syntax highlighting.
 * No external dependencies.
 */
(function() {
  window.AimScope = window.AimScope || {};

  /**
   * Create a config editor inside a container element.
   * opts: { value, mode('yaml'|'json'), readonly, onChange, onSave }
   * Returns: { getValue(), setValue(v), focus(), destroy() }
   */
  AimScope.ConfigEditor = function(container, opts) {
    opts = opts || {};
    var mode = opts.mode || 'yaml';
    var isReadonly = !!opts.readonly;
    var value = opts.value || '';

    // Build DOM
    container.style.overflow = 'hidden';

    var wrapper = document.createElement('div');
    wrapper.className = 'ce-wrapper';

    var gutter = document.createElement('div');
    gutter.className = 'ce-gutter';

    var textarea = document.createElement('textarea');
    textarea.className = 'ce-textarea';
    textarea.spellcheck = false;
    textarea.wrap = 'off';
    if (isReadonly) textarea.readOnly = true;

    var highlight = document.createElement('div');
    highlight.className = 'ce-highlight';
    highlight.setAttribute('aria-hidden', 'true');

    wrapper.appendChild(gutter);
    wrapper.appendChild(highlight);
    wrapper.appendChild(textarea);
    container.appendChild(wrapper);

    // Style injection (once)
    if (!AimScope.ConfigEditor._stylesInjected) {
      AimScope.ConfigEditor._stylesInjected = true;
      var style = document.createElement('style');
      style.textContent = [
        '.ce-wrapper { position:relative; display:flex; height:100%; background:var(--bg); border-radius:var(--radius); }',
        '.ce-gutter { flex:0 0 48px; overflow:hidden; padding:10px 0; text-align:right; font-family:var(--mono); font-size:12px; line-height:1.6; color:var(--text3); background:var(--bg2); border-right:1px solid var(--border); user-select:none; }',
        '.ce-gutter div { padding-right:10px; }',
        '.ce-textarea { flex:1; padding:10px 14px; border:none; outline:none; resize:none; font-family:var(--mono); font-size:12px; line-height:1.6; color:var(--text); background:transparent; white-space:pre; overflow:auto; tab-size:2; -moz-tab-size:2; }',
        '.ce-textarea:focus { box-shadow:inset 0 0 0 1px var(--accent); }',
        '.ce-highlight { position:absolute; top:0; left:48px; right:0; bottom:0; padding:10px 14px; font-family:var(--mono); font-size:12px; line-height:1.6; pointer-events:none; white-space:pre; overflow:hidden; color:transparent; }',
        '.ce-highlight .hl-key { color:var(--accent); }',
        '.ce-highlight .hl-str { color:var(--green); }',
        '.ce-highlight .hl-num { color:var(--orange); }',
        '.ce-highlight .hl-com { color:var(--text3); font-style:italic; }',
        '.ce-highlight .hl-bool { color:#a78bfa; }',
        '.ce-toolbar { display:flex; gap:6px; padding:6px 10px; background:var(--bg2); border-bottom:1px solid var(--border); align-items:center; }',
        '.ce-toolbar span { font-size:11px; color:var(--text2); }',
        '.ce-toolbar button { padding:4px 12px; border:1px solid var(--border); border-radius:4px; background:var(--bg3); color:var(--text); cursor:pointer; font-size:12px; }',
        '.ce-toolbar button:hover { border-color:var(--accent); color:var(--accent); }',
        '.ce-toolbar button.ce-save { background:var(--accent); color:#fff; border-color:var(--accent); }',
      ].join('\n');
      document.head.appendChild(style);
    }

    // Line numbers
    function updateGutter() {
      var lines = textarea.value.split('\n');
      var count = lines.length;
      var cur = gutter.children.length;
      while (cur < count) {
        var div = document.createElement('div');
        div.textContent = cur + 1;
        gutter.appendChild(div);
        cur++;
      }
      while (cur > count) {
        gutter.removeChild(gutter.lastChild);
        cur--;
      }
      // Update existing
      for (var i = 0; i < count; i++) {
        gutter.children[i].textContent = i + 1;
      }
    }

    // Simple YAML/JSON syntax highlighting
    function highlightText(text) {
      var html = '';
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        // Comments (YAML only)
        if (mode === 'yaml') {
          var commentIdx = line.indexOf('#');
          if (commentIdx >= 0 && !isInsideString(line, commentIdx)) {
            var before = line.slice(0, commentIdx);
            var after = line.slice(commentIdx);
            line = escapeHtml(before) + '<span class="hl-com">' + escapeHtml(after) + '</span>';
          } else {
            line = escapeHtml(line);
          }
        } else {
          line = escapeHtml(line);
        }
        // Highlight keys (YAML: key:, JSON: "key":)
        if (mode === 'yaml') {
          line = line.replace(/^(\s*)([\w.-]+)(\s*:)/gm, '$1<span class="hl-key">$2</span>$3');
        } else {
          line = line.replace(/(&quot;[^&]+&quot;)\s*:/g, '<span class="hl-key">$1</span>:');
        }
        // Strings
        line = line.replace(/(&quot;[^&]*&quot;)/g, '<span class="hl-str">$1</span>');
        line = line.replace(/('(?:[^'\\]|\\.)*')/g, '<span class="hl-str">$1</span>');
        // Numbers
        line = line.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
        // Booleans
        line = line.replace(/\b(true|false|yes|no|on|off|null|~)\b/gi, '<span class="hl-bool">$1</span>');
        html += (i > 0 ? '\n' : '') + line;
      }
      return html;
    }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isInsideString(line, pos) {
      var inSingle = false, inDouble = false;
      for (var i = 0; i < pos; i++) {
        if (line[i] === "'" && !inDouble) inSingle = !inSingle;
        if (line[i] === '"' && !inSingle) inDouble = !inDouble;
      }
      return inSingle || inDouble;
    }

    function refresh() {
      updateGutter();
      highlight.innerHTML = highlightText(textarea.value || '');
    }

    // Sync scroll
    textarea.addEventListener('scroll', function() {
      gutter.scrollTop = textarea.scrollTop;
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    });

    textarea.addEventListener('input', function() {
      refresh();
      if (opts.onChange) opts.onChange(textarea.value);
    });

    textarea.addEventListener('keydown', function(e) {
      // Tab key support
      if (e.key === 'Tab' && !isReadonly) {
        e.preventDefault();
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        refresh();
        if (opts.onChange) opts.onChange(textarea.value);
      }
      // Ctrl+S save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (opts.onSave) opts.onSave(textarea.value);
      }
    });

    // Initial render
    textarea.value = value;
    refresh();

    return {
      getValue: function() { return textarea.value; },
      setValue: function(v) {
        textarea.value = v;
        refresh();
      },
      focus: function() { textarea.focus(); },
      setMode: function(m) { mode = m; refresh(); },
      setReadonly: function(r) {
        isReadonly = r;
        textarea.readOnly = r;
      },
      destroy: function() {
        container.removeChild(wrapper);
      }
    };
  };
})();
