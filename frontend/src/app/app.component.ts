import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ToastsComponent } from './shared/toasts.component';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'nx-root',
  imports: [RouterOutlet, ToastsComponent],
  template: `
    <router-outlet />
    <nx-toasts />
  `,
})
export class AppComponent {
  constructor() {
    inject(AuthService).setRouter(inject(Router));
    inject(ThemeService); // garante que o tema seja aplicado na abertura
  }
}
