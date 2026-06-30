/**
 * AimScope v3.0 — Auth API Client
 * Login/register/me endpoints for JWT authentication
 */
(function() {
  const API_BASE = '/api/auth';

  function getToken() {
    return localStorage.getItem('aimscope-token') || '';
  }

  function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  async function request(url, options = {}) {
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({ error: resp.statusText }));
    if (!resp.ok) throw new Error(data.error || resp.statusText);
    return data;
  }

  window.AimScope = window.AimScope || {};
  window.AimScope.AuthAPI = {
    /** Login — returns {token, role, username} */
    async login(username, password) {
      const data = await request(API_BASE + '/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (data.token) {
        localStorage.setItem('aimscope-token', data.token);
        localStorage.setItem('aimscope-user', JSON.stringify({
          username: data.username,
          role: data.role
        }));
      }
      return data;
    },

    /** Register (requires ENGINEER role token in real setup) */
    async register(username, password, role) {
      const data = await request(API_BASE + '/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, role: role || 'TESTER' }),
        headers: authHeaders()
      });
      return data;
    },

    /** Get current user info */
    async me() {
      const data = await request(API_BASE + '/me', {
        headers: authHeaders()
      });
      return data;
    },

    /** Logout — clear local state */
    logout() {
      localStorage.removeItem('aimscope-token');
      localStorage.removeItem('aimscope-user');
    },

    /** Check if logged in */
    isLoggedIn() {
      return !!getToken();
    },

    /** Get stored user info */
    getUser() {
      try {
        return JSON.parse(localStorage.getItem('aimscope-user') || 'null');
      } catch (e) {
        return null;
      }
    },

    /** Get user role */
    getRole() {
      const user = this.getUser();
      return user ? user.role : null;
    }
  };
})();
