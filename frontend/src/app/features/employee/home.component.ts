import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CheckinStatus } from '../../core/models';

@Component({
  selector: 'nx-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Olá, {{ firstName() }} 👋</h1>
        <p class="sub">{{ auth.user()?.sectorName }} · {{ auth.user()?.teamName }}</p>
      </div>

      <div class="card card-pad hero rise">
        <h2>Como está seu dia hoje?</h2>
        @if (loading()) {
          <div class="skeleton" style="height: 48px; margin-top: 14px;"></div>
        } @else {
         @if (status(); as s) {
          @if (s.answeredThisWeek && !s.canAnswer) {
            <p class="sub">Você já enviou seu check-in desta semana. Obrigado pela participação!</p>
            <a routerLink="/app/historico" class="btn btn-ghost btn-block">Ver meu histórico</a>
          } @else {
            <p class="sub">Leva cerca de 2 minutos. Suas respostas viram indicadores do ambiente de trabalho, sempre agregados.</p>
            <a routerLink="/app/checkin" class="btn btn-accent btn-block">{{ s.answeredThisWeek ? 'Fazer outro check-in' : 'Fazer check-in' }}</a>
          }
          @if (s.lastCheckinAt) {
            <p class="small muted">Último envio: {{ s.lastCheckinAt | date: "dd/MM/yyyy 'às' HH:mm" }} · {{ s.totalCheckins }} no total</p>
          }
         }
        }
        @if (error()) { <div class="notice notice-error">{{ error() }}</div> }
      </div>

      <div class="card card-pad">
        <span class="section-title">Orientações gerais</span>
        <ul class="tips">
          <li>Faça pausas curtas ao longo do dia e respeite seus intervalos.</li>
          <li>Se a carga estiver alta, converse com sua liderança sobre prioridades e prazos.</li>
          <li>Apoie e peça apoio à equipe: isso protege o ambiente de todos.</li>
          <li>Se estiver com sofrimento emocional, procure um profissional de saúde. O CVV atende 24h pelo telefone 188.</li>
        </ul>
        <p class="small muted">Estas orientações são gerais e não substituem avaliação profissional. O NEXO não faz diagnósticos.</p>
      </div>

      <a routerLink="/app/privacidade" class="card card-pad link-card">
        <div><strong>Como meus dados são usados?</strong><div class="small muted">Seu gestor vê apenas grupos agregados, nunca suas respostas.</div></div>
        <span aria-hidden="true">›</span>
      </a>
    </div>
  `,
  styles: [`
    .hero { display: flex; flex-direction: column; gap: 12px; background: linear-gradient(135deg, var(--accent-soft), var(--surface)); }
    .tips { margin: 10px 0; padding-left: 20px; color: var(--ink-2); display: flex; flex-direction: column; gap: 8px; }
    .link-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .link-card span { font-size: 22px; color: var(--muted); }
  `],
})
export class HomeComponent {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);
  status = signal<CheckinStatus | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  firstName = computed(() => (this.auth.user()?.name ?? '').split(' ')[0]);

  constructor() {
    this.api.get<CheckinStatus>('/checkins/status')
      .then(s => this.status.set(s))
      .catch(e => this.error.set(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => this.loading.set(false));
  }
}
