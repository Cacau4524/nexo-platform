import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(kind: Toast['kind'], message: string) {
    const toast: Toast = { id: this.nextId++, kind, message };
    this.toasts.update(list => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), 4600);
  }

  success(message: string) { this.show('success', message); }
  error(message: string) { this.show('error', message); }
  info(message: string) { this.show('info', message); }

  dismiss(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
}
