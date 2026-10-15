// src/api.js

const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const defaultApiUrl = isLocalhost ? 'http://localhost:4000/api' : '/api';
const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/$/, '');

// Fired when the backend rejects our session token so the app can sign the user out.
export const AUTH_EXPIRED_EVENT = 'policylens:auth-expired';

const buildUrl = (endpoint) => `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

const getHeaders = (options = {}) => {
  const headers = { ...options.headers };

  const token = localStorage.getItem('token');
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Only add Content-Type if we're not sending FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const buildFetchOptions = (options) => {
  const fetchOptions = { ...options, headers: getHeaders(options) };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  return fetchOptions;
};

const handleUnauthorized = (response, hadToken) => {
  // Only treat 401 as "session expired" when we actually sent a session token.
  if (response.status === 401 && hadToken) {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
};

export const fetchApi = async (endpoint, options = {}) => {
  try {
    const hadToken = Boolean(localStorage.getItem('token'));
    const response = await fetch(buildUrl(endpoint), buildFetchOptions(options));

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      handleUnauthorized(response, hadToken && !options.headers?.Authorization);
      const errorMessage = (typeof data === 'string' ? data : data?.error || data?.message) || 'An error occurred';
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    if (import.meta.env.DEV) console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
};

export const streamApi = async (endpoint, options = {}, onToken) => {
  const hadToken = Boolean(localStorage.getItem('token'));
  const response = await fetch(buildUrl(endpoint), buildFetchOptions(options));

  if (!response.ok) {
    handleUnauthorized(response, hadToken);
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Stream error');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // stream: true keeps multi-byte characters intact across chunk boundaries
    const chunkValue = decoder.decode(value, { stream: true });
    if (chunkValue) onToken(chunkValue);
  }
  const tail = decoder.decode();
  if (tail) onToken(tail);
};
