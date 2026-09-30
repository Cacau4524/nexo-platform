import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE } from './config';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = API_BASE;

  private async handle<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        if (e.status === 401 && this.auth.isLoggedIn) this.auth.logout();
        const msg = (e.error && e.error.message) || 'Não foi possível concluir a operação.';
        if (e.status === 0) throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.', 0);
        throw new ApiError(msg, e.status);
      }
      throw e;
    }
  }

  get<T>(path: string): Promise<T> {
    return this.handle(firstValueFrom(this.http.get<T>(`${this.base}${path}`, { headers: this.auth.headers() })).then(r => r as T));
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.handle(firstValueFrom(this.http.post<T>(`${this.base}${path}`, body ?? {}, { headers: this.auth.headers() })).then(r => r as T));
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.handle(firstValueFrom(this.http.put<T>(`${this.base}${path}`, body ?? {}, { headers: this.auth.headers() })).then(r => r as T));
  }
  delete<T>(path: string): Promise<T> {
    return this.handle(firstValueFrom(this.http.delete<T>(`${this.base}${path}`, { headers: this.auth.headers() })).then(r => r as T));
  }
  /** Baixa um arquivo (PDF/JSON) já autenticado, sem expor o token em código de componente. */
  async blob(method: 'GET' | 'POST', path: string): Promise<Blob> {
    return this.handle(firstValueFrom(this.http.request(method, `${this.base}${path}`, { headers: this.auth.headers(), responseType: 'blob' })));
  }
}

/** Monta "?a=1&b=2" ignorando valores vazios. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return p.length ? '?' + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
}
