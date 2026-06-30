/**
 * AimScope v3.0 — Parameter Management API Client
 * Communicates with SpringBoot backend /api/params/*
 */
(function() {
  const API_BASE = '/api/params';

  // Get auth token from localStorage
  function getToken() {
    return localStorage.getItem('aimscope-token') || '';
  }

  function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  async function request(url, options = {}) {
    const resp = await fetch(url, {
      headers: authHeaders(),
      ...options
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || resp.statusText);
    }
    return resp.json();
  }

  window.AimScope = window.AimScope || {};
  window.AimScope.ParamAPI = {
    /** List all parameter configs */
    list() {
      return request(API_BASE);
    },

    /** Get a single config with current content */
    get(id) {
      return request(API_BASE + '/' + id);
    },

    /** Create a new config */
    create({ name, description, fileType, content }) {
      return request(API_BASE, {
        method: 'POST',
        body: JSON.stringify({ name, description, fileType, content })
      });
    },

    /** Update config (creates new version) */
    update(id, { content, message }) {
      return request(API_BASE + '/' + id, {
        method: 'PUT',
        body: JSON.stringify({ content, message })
      });
    },

    /** Get version history */
    versions(id) {
      return request(API_BASE + '/' + id + '/versions');
    },

    /** Get a specific version */
    getVersion(id, versionNum) {
      return request(API_BASE + '/' + id + '/versions/' + versionNum);
    },

    /** Rollback to a specific version */
    rollback(id, versionNum) {
      return request(API_BASE + '/' + id + '/rollback/' + versionNum, { method: 'POST' });
    },

    /** Diff two versions */
    diff(id, v1, v2) {
      return request(API_BASE + '/' + id + '/diff?v1=' + v1 + '&v2=' + v2);
    }
  };
})();
