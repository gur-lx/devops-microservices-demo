// Shared helpers for the login and access management pages.
window.portal = {
  // Calls auth-service through the gateway. Resolves with the JSON body
  // (or null for 204) and throws an Error with the server's message.
  async api(path, options = {}) {
    const res = await fetch(`/api/auth${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (res.status === 204) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || `request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body;
  },

  showMessage(element, text, kind) {
    element.textContent = text;
    element.className = kind ? 'auth-message is-' + kind : 'auth-message';
  },
};
