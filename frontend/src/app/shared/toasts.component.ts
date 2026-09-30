import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'nx-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast-' + t.kind">
          <span class="dot"></span>
          <span class="msg">{{ t.message }}</span>
          <button class="close" (click)="toast.dismiss(t.id)" aria-label="Fechar">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toasts {
      position: fixed; bottom: 24px; right: 24px; z-index: 1000;
      display: flex; flex-direction: column; gap: 10px; max-width: 380px;
    }
    .toast {
      display: flex; align-items: center; gap: 10px;
      background: var(--btn-primary-bg); color: var(--btn-primary-ink);
      padding: 12px 14px; border-radius: var(--r-md);
      box-shadow: var(--shadow-lg);
      animation: nx-toast-in .3s var(--ease);
      font-size: 13.5px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .toast-success .dot { background: #4ADE80; }
    .toast-error .dot { background: #F87171; }
    .toast-info .dot { background: #818CF8; }
    .msg { flex: 1; }
    .close {
      background: none; border: none; color: inherit; opacity: .6;
      font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1;
    }
    .close:hover { opacity: 1; }
    @media (max-width: 959px) { .toasts { left: 16px; right: 16px; bottom: calc(88px + var(--safe-bottom)); max-width: none; } }
  `],
})
export class ToastsComponent {
  toast = inject(ToastService);
}
