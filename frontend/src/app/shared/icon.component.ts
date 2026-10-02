import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Conjunto de ícones da navegação: sistema outline consistente, grade de 24 px, traço 2 e cantos arredondados.
 * Uso: <nx-icon name="people" /> — herda a cor do texto (currentColor).
 */
export type IconName =
  | 'overview' | 'people' | 'sectors' | 'insights' | 'interventions' | 'reports' | 'privacy'
  | 'sun' | 'moon' | 'logout' | 'home' | 'checkin' | 'history' | 'menu' | 'profile';

const PATHS: Record<IconName, string> = {
  overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.9a3.2 3.2 0 0 1 0 6.2"/><path d="M18 14.4c1.8.6 3 2.2 3 5.1"/>',
  sectors: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7.5h2M13 7.5h2M9 11.5h2M13 11.5h2"/><path d="M10 21v-4h4v4"/>',
  insights: '<path d="M10 3.5l1.8 4.7 4.7 1.8-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8z"/><path d="M18 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  interventions: '<path d="M14.5 6.2a4 4 0 0 0 4.9 4.9l-9.3 9.3a2.1 2.1 0 0 1-3-3z"/><path d="M13 8.5l-2-2-2.5 2.5 2 2"/><path d="M6.5 3.5l3 3M4 7l2.5-2.5"/>',
  reports: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 17v-3M12 17v-5M15 17v-2"/>',
  privacy: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.2"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  moon: '<path d="M20 14.2A8 8 0 0 1 9.8 4 8 8 0 1 0 20 14.2z"/>',
  logout: '<path d="M14 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4"/><path d="M3.5 12h11M11 8l4 4-4 4"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.5"/><path d="M10 20.5v-5h4v5"/>',
  checkin: '<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M12.5 6.5l5 5"/>',
  history: '<path d="M3.5 4v16.5h17"/><path d="M7.5 15l3.5-4 3 2.5 4.5-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  profile: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>',
};

@Component({
  selector: 'nx-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" [innerHTML]="html()"></svg>
  `,
  styles: [`:host { display: inline-flex; line-height: 0; flex: none; } svg { display: block; }`],
})
export class IconComponent {
  name = input.required<IconName>();
  size = input(22);
  private san = inject(DomSanitizer);
  /** Os desenhos são constantes deste arquivo (nunca vêm do usuário); sem o bypass o Angular remove <path>/<rect> do SVG. */
  html = computed(() => this.san.bypassSecurityTrustHtml(PATHS[this.name()]));
}
