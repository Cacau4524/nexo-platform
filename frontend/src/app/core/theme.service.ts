import { Injectable, signal } from '@angular/core';
import { ThemeMode } from './models';

/**
 * Tema claro/escuro. A preferência DEFINITIVA fica no banco (por usuário); o localStorage guarda apenas
 * um cache para a tela de login e para evitar "flash" na abertura — nunca dado essencial.
 */
const CACHE = 'nexo.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('light');

  constructor() {
    this.apply(this.initial(), false);
  }

  private initial(): ThemeMode {
    try {
      const c = localStorage.getItem(CACHE);
      if (c === 'light' || c === 'dark') return c;
    } catch { /* armazenamento indisponível */ }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** Aplica o tema (e opcionalmente guarda o cache local). */
  apply(mode: ThemeMode, cache = true) {
    this.mode.set(mode);
    document.documentElement.setAttribute('data-theme', mode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0E0F13' : '#F6F6F4');
    if (cache) {
      try { localStorage.setItem(CACHE, mode); } catch { /* ignora */ }
    }
  }

  next(): ThemeMode { return this.mode() === 'dark' ? 'light' : 'dark'; }
}
