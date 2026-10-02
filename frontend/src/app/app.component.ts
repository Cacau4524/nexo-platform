import { ChangeDetectionStrategy, Component, HostListener, ViewEncapsulation, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ToastsComponent } from './shared/toasts.component';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

/**
 * Acessibilidade: preferências de exibição guardadas só no aparelho (localStorage = conveniência, nunca dado de negócio).
 * Aplicadas como atributos em <html>; os estilos globais estão no bloco `styles` abaixo (ViewEncapsulation.None).
 */
const KEY = 'nexo.a11y';
interface A11y { text: 0 | 1 | 2 | 3; contrast: boolean; motion: boolean; spacing: boolean; links: boolean; }
const DEFAULT: A11y = { text: 0, contrast: false, motion: false, spacing: false, links: false };

@Component({
  selector: 'nx-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [RouterOutlet, ToastsComponent],
  template: `
    <a class="a11y-skip" href="#conteudo" (click)="skip($event)">Ir para o conteúdo</a>
    <main id="conteudo" tabindex="-1"><router-outlet /></main>
    <nx-toasts />

    <button class="a11y-fab" type="button" (click)="open.set(!open())"
            [attr.aria-expanded]="open()" aria-controls="a11y-panel" aria-label="Acessibilidade">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5m0 0l-3 5.5m3-5.5l3 5.5"/>
      </svg>
    </button>

    @if (open()) {
      <div class="a11y-scrim" (click)="open.set(false)"></div>
      <section id="a11y-panel" class="a11y-panel" role="dialog" aria-label="Opções de acessibilidade">
        <header>
          <h2>Acessibilidade</h2>
          <button type="button" class="a11y-x" (click)="open.set(false)" aria-label="Fechar">✕</button>
        </header>

        <div class="a11y-row">
          <span id="a11y-text-l">Tamanho do texto</span>
          <div class="a11y-step" role="group" aria-labelledby="a11y-text-l">
            <button type="button" (click)="size(-1)" [disabled]="s().text === 0" aria-label="Diminuir texto">A−</button>
            <output aria-live="polite">{{ labels[s().text] }}</output>
            <button type="button" (click)="size(1)" [disabled]="s().text === 3" aria-label="Aumentar texto">A+</button>
          </div>
        </div>

        @for (o of opts; track o.k) {
          <div class="a11y-row">
            <span [id]="'a11y-' + o.k">{{ o.t }}<small>{{ o.d }}</small></span>
            <button type="button" class="a11y-sw" role="switch" [attr.aria-checked]="flag(o.k)"
                    [attr.aria-labelledby]="'a11y-' + o.k" (click)="toggle(o.k)"><i></i></button>
          </div>
        }

        <button type="button" class="a11y-reset" (click)="reset()">Restaurar padrão</button>
      </section>
    }
  `,
  styles: [`
    /* ---------- preferências aplicadas ao site todo ---------- */
    html[data-a11y-text='1'] body { zoom: 1.12; }
    html[data-a11y-text='2'] body { zoom: 1.25; }
    html[data-a11y-text='3'] body { zoom: 1.4; }
    html[data-a11y-spacing] body { line-height: 1.8; letter-spacing: .04em; word-spacing: .12em; }
    html[data-a11y-spacing] p, html[data-a11y-spacing] li { max-width: 72ch; }
    html[data-a11y-links] a { text-decoration: underline !important; text-underline-offset: 3px; text-decoration-thickness: 2px; }
    html[data-a11y-motion] *, html[data-a11y-motion] *::before, html[data-a11y-motion] *::after {
      animation-duration: .001ms !important; animation-iteration-count: 1 !important;
      transition-duration: .001ms !important; scroll-behavior: auto !important;
    }
    html[data-a11y-contrast][data-theme='light'] {
      --bg: #FFFFFF; --surface: #FFFFFF; --surface-2: #FFFFFF; --ink: #000000; --ink-2: #000000; --muted: #1F1F1F;
      --faint: #3A3A3A; --line: #000000; --line-strong: #000000; --accent: #1F1FA8; --accent-ink: #14147A;
      --accent-strong: #14147A; --btn-primary-bg: #000000; --btn-primary-ink: #FFFFFF;
    }
    html[data-a11y-contrast][data-theme='dark'] {
      --bg: #000000; --surface: #000000; --surface-2: #000000; --ink: #FFFFFF; --ink-2: #FFFFFF; --muted: #E6E6E6;
      --faint: #CFCFCF; --line: #FFFFFF; --line-strong: #FFFFFF; --accent: #B9B9FF; --accent-ink: #D6D6FF;
      --accent-strong: #D6D6FF; --btn-primary-bg: #FFFFFF; --btn-primary-ink: #000000;
    }
    html[data-a11y-contrast] .card, html[data-a11y-contrast] .input { border-width: 2px; }
    :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    main#conteudo:focus { outline: none; }

    /* ---------- botão e painel ---------- */
    .a11y-skip { position: fixed; left: 12px; top: -60px; z-index: 300; padding: 12px 16px; border-radius: 10px;
      background: var(--btn-primary-bg); color: var(--btn-primary-ink); font-weight: 600; }
    .a11y-skip:focus { top: calc(12px + var(--safe-top)); }
    .a11y-fab { position: fixed; right: 14px; bottom: calc(86px + var(--safe-bottom)); z-index: 200;
      width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--line-strong); cursor: pointer;
      background: var(--surface); color: var(--ink); box-shadow: var(--shadow-md);
      display: flex; align-items: center; justify-content: center; }
    .a11y-fab:hover { background: var(--accent-soft); }
    .a11y-scrim { position: fixed; inset: 0; z-index: 210; background: var(--scrim); }
    .a11y-panel { position: fixed; z-index: 220; right: 12px; left: 12px; bottom: calc(12px + var(--safe-bottom));
      max-width: 380px; margin-left: auto; max-height: 82dvh; overflow: auto; padding: 18px;
      background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: var(--r-xl);
      box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 4px; }
    .a11y-panel header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .a11y-panel h2 { font-size: 18px; }
    .a11y-x { width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--ink-soft); color: var(--ink); cursor: pointer; font-size: 16px; }
    .a11y-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); font-weight: 600; font-size: 14.5px; }
    .a11y-row small { display: block; margin-top: 2px; font-weight: 400; font-size: 12.5px; color: var(--muted); }
    .a11y-step { display: flex; align-items: center; gap: 8px; }
    .a11y-step button { min-width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font-weight: 700; font-size: 15px; cursor: pointer; }
    .a11y-step button:disabled { opacity: .4; cursor: default; }
    .a11y-step output { min-width: 58px; text-align: center; font-size: 13px; color: var(--muted); font-weight: 500; }
    .a11y-sw { flex: none; width: 52px; height: 30px; border-radius: 99px; border: 1px solid var(--line-strong); background: var(--ink-soft); padding: 2px; cursor: pointer; transition: background .15s; }
    .a11y-sw i { display: block; width: 24px; height: 24px; border-radius: 50%; background: var(--faint); transition: transform .15s; }
    .a11y-sw[aria-checked='true'] { background: var(--accent); border-color: var(--accent); }
    .a11y-sw[aria-checked='true'] i { transform: translateX(22px); background: var(--on-accent); }
    .a11y-reset { margin-top: 8px; min-height: 44px; border-radius: 10px; border: 1px solid var(--line-strong); background: none; color: var(--ink); font-weight: 600; cursor: pointer; }
    @media (min-width: 900px) { .a11y-fab { bottom: 18px; } }
  `],
})
export class AppComponent {
  readonly labels = ['Normal', 'Grande', 'Maior', 'Máximo'];
  readonly opts = [
    { k: 'contrast', t: 'Alto contraste', d: 'Cores mais fortes e bordas nítidas' },
    { k: 'spacing', t: 'Espaçamento de texto', d: 'Mais espaço entre linhas e letras' },
    { k: 'links', t: 'Destacar links', d: 'Sublinha todos os links' },
    { k: 'motion', t: 'Reduzir animações', d: 'Menos movimento na tela' },
  ] as const;

  open = signal(false);
  s = signal<A11y>(this.load());

  constructor() {
    inject(AuthService).setRouter(inject(Router));
    inject(ThemeService); // garante que o tema seja aplicado na abertura
    this.apply();
  }

  flag(k: string): boolean { return !!(this.s() as unknown as Record<string, unknown>)[k]; }

  size(d: number) { this.set({ ...this.s(), text: Math.min(3, Math.max(0, this.s().text + d)) as A11y['text'] }); }
  toggle(k: string) { this.set({ ...this.s(), [k]: !this.flag(k) }); }
  reset() { this.set({ ...DEFAULT }); }

  skip(e: Event) { e.preventDefault(); document.getElementById('conteudo')?.focus(); }

  @HostListener('document:keydown.escape') onEsc() { this.open.set(false); }

  private set(v: A11y) {
    this.s.set(v);
    this.apply();
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* sem armazenamento */ }
  }

  private apply() {
    const v = this.s(), el = document.documentElement;
    const put = (n: string, on: boolean, val = '') => on ? el.setAttribute(n, val) : el.removeAttribute(n);
    put('data-a11y-text', v.text > 0, String(v.text));
    put('data-a11y-contrast', v.contrast);
    put('data-a11y-spacing', v.spacing);
    put('data-a11y-links', v.links);
    put('data-a11y-motion', v.motion);
  }

  private load(): A11y {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (r && typeof r === 'object') return { ...DEFAULT, ...r };
    } catch { /* ignora */ }
    if (typeof matchMedia === 'function') {
      return { ...DEFAULT, motion: matchMedia('(prefers-reduced-motion: reduce)').matches, contrast: matchMedia('(prefers-contrast: more)').matches };
    }
    return { ...DEFAULT };
  }
}
