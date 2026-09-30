/**
 * Base da API. Em desenvolvimento (localhost) aponta para a porta 3001;
 * em produção usa o mesmo domínio (`/api`), atrás de um proxy reverso com HTTPS.
 */
const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
export const API_BASE = host === 'localhost' || host === '127.0.0.1' ? `http://${host}:3001/api` : '/api';
