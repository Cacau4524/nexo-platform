import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nx-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="nx-logo" [class.light]="light()">
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        @if (!light()) { <rect width="32" height="32" rx="8" fill="#1B1C20"/> }
        <g [attr.stroke]="light() ? '#A5A3F0' : '#6E6BE8'" stroke-width="1.8" stroke-linecap="round">
          <circle cx="10.5" cy="21.5" r="2.6"/>
          <circle cx="21.5" cy="21.5" r="2.6"/>
          <circle cx="16" cy="9.5" r="2.6"/>
          <path d="M14.2 11.6 11.9 19"/>
          <path d="M17.8 11.6 20.1 19"/>
          <path d="M13.1 21.5 18.9 21.5"/>
        </g>
      </svg>
      @if (showWord()) { <span class="word">NEXO</span> }
    </span>
  `,
  styles: [`
    .nx-logo { display: inline-flex; align-items: center; gap: 9px; }
    .word { font-weight: 800; letter-spacing: .08em; font-size: 15px; color: var(--ink); }
    .light .word { color: #fff; }
  `],
  imports: [],
})
export class LogoComponent {
  size = input(28);
  light = input(false);
  showWord = input(true);
}
