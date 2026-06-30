/**
 * AimScope v3.0 — Replay API Client
 * Upload rosbag files, query parsed data, list replay sessions
 */
(function() {
  const API_BASE = '/api/replay';

  function getToken() {
    return localStorage.getItem('aimscope-token') || '';
  }

  function authHeaders(extra) {
    const token = getToken();
    const h = Object.assign({}, extra);
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  async function request(url, options) {
    const opts = options || {};
    opts.headers = authHeaders(opts.headers);
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const err = await resp.json().catch(function() { return { error: resp.statusText }; });
      throw new Error(err.error || resp.statusText);
    }
    return resp.json();
  }

  window.AimScope = window.AimScope || {};
  window.AimScope.ReplayAPI = {
    /** List all replay sessions */
    list: function() {
      return request(API_BASE + '/sessions');
    },

    /** Get session details */
    get: function(id) {
      return request(API_BASE + '/' + id);
    },

    /** Upload a file with progress callback (FormData via XHR) */
    upload: function(file, onProgress) {
      var formData = new FormData();
      formData.append('file', file);
      var token = getToken();
      var headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;

      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/upload');
        Object.keys(headers).forEach(function(k) {
          xhr.setRequestHeader(k, headers[k]);
        });

        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = function() {
          try {
            var data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error || 'Upload failed'));
          } catch (e) {
            reject(new Error('Invalid response'));
          }
        };

        xhr.onerror = function() {
          reject(new Error('Network error'));
        };

        xhr.send(formData);
      });
    },

    /** Query topic data for a time range */
    queryData: function(sessionId, topic, from, to) {
      return request(
        API_BASE + '/' + sessionId + '/data?topic=' + encodeURIComponent(topic) +
        '&from=' + (from || 0) + '&to=' + (to || 5000)
      );
    },

    /** Get analysis events for a time range */
    queryEvents: function(sessionId, from, to) {
      return request(
        API_BASE + '/' + sessionId + '/events?from=' + (from || 0) + '&to=' + (to || 5000)
      );
    },

    /** Get parse progress */
    progress: function(id) {
      return request(API_BASE + '/' + id + '/progress');
    },

    /** Delete a replay session */
    delete: function(id) {
      return request(API_BASE + '/' + id, { method: 'DELETE' });
    }
  };
})();
