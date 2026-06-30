/**
 * AimScope v3.0 — Benchmark API Client
 * Create and view algorithm benchmark runs
 */
(function() {
  var API_BASE = '/api/benchmark';

  function getToken() {
    return localStorage.getItem('aimscope-token') || '';
  }

  function authHeaders() {
    var token = getToken();
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function request(url, options) {
    var opts = options || {};
    opts.headers = opts.headers || {};
    var auth = authHeaders();
    Object.keys(auth).forEach(function(k) {
      opts.headers[k] = auth[k];
    });
    return fetch(url, opts).then(function(resp) {
      return resp.json().catch(function() {
        return { error: resp.statusText };
      }).then(function(data) {
        if (!resp.ok) throw new Error(data.error || resp.statusText);
        return data;
      });
    });
  }

  window.AimScope = window.AimScope || {};
  window.AimScope.BenchmarkAPI = {
    /** List all benchmark runs */
    list: function() {
      return request(API_BASE);
    },

    /** Get a benchmark run detail (includes metrics and report) */
    get: function(id) {
      return request(API_BASE + '/' + id);
    },

    /** Create and start a new benchmark run */
    create: function(opts) {
      return request(API_BASE, {
        method: 'POST',
        body: JSON.stringify({
          name: opts.name,
          replayId: opts.replayId,
          configAId: opts.configAId,
          configBId: opts.configBId
        })
      });
    },

    /** Get comparison report (Markdown) */
    getReport: function(id) {
      return request(API_BASE + '/' + id + '/report');
    }
  };
})();
