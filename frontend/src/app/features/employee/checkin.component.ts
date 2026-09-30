import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CheckinStatus, Question } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];

@Component({
  selector: 'nx-checkin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="skeleton" style="height: 320px"></div>
    } @else if (blocked()) {
      <div class="card card-pad center">
        <h1>Check-in já enviado</h1>
        <p class="sub">Você já respondeu o check-in desta semana. Volte na próxima!</p>
        <a routerLink="/app/inicio" class="btn btn-primary btn-block">Voltar ao início</a>
      </div>
    } @else if (done()) {
      <div class="card card-pad center pop">
        <div class="ok">✓</div>
        <h1>Obrigado pela sua participação.</h1>
        <p class="sub">Suas respostas foram registradas e entram apenas em indicadores agregados do seu grupo. Ninguém do seu ambiente de trabalho vê o que você respondeu.</p>
        <div class="col">
          <a routerLink="/app/historico" class="btn btn-ghost btn-block">Ver meu histórico</a>
          <a routerLink="/app/inicio" class="btn btn-primary btn-block">Concluir</a>
        </div>
      </div>
    } @else if (error()) {
      <div class="notice notice-error">{{ error() }}</div>
    } @else {
      <div class="page">
        <div>
          <div class="progress" role="progressbar" [attr.aria-valuenow]="step() + 1" aria-valuemin="1" [attr.aria-valuemax]="total()">
            <div class="fill" [style.width.%]="progress()"></div>
          </div>
          <span class="small muted">{{ step() < questions().length ? 'Pergunta ' + (step() + 1) + ' de ' + questions().length : 'Quase lá' }}</span>
        </div>

        @if (current(); as q) {
          <div class="card card-pad q pop">
            <h1>{{ q.kind === 'mood' ? 'Como você está hoje?' : q.prompt }}</h1>
            @if (q.kind === 'mood') {
              <div class="moods">
                @for (n of scale; track n) {
                  <button type="button" class="mood" [class.sel]="value(q.key) === n" (click)="pick(q, n)" [attr.aria-label]="'Opção ' + n">
                    <span class="emoji">{{ moods[n - 1] }}</span>
                  </button>
                }
              </div>
            } @else {
              <div class="opts">
                @for (n of scale; track n) {
                  <button type="button" class="opt" [class.sel]="value(q.key) === n" (click)="pick(q, n)">{{ n }}</button>
                }
              </div>
            }
            <div class="ends"><span>{{ q.low }}</span><span>{{ q.high }}</span></div>
          </div>
          <div class="nav">
            <button class="btn btn-ghost" type="button" (click)="back()" [disabled]="step() === 0">Voltar</button>
            <button class="btn btn-primary" type="button" (click)="next()" [disabled]="!value(q.key)">Continuar</button>
          </div>
        } @else {
          <div class="card card-pad q pop">
            <h1>Quer acrescentar algo?</h1>
            <p class="sub">Opcional. Não escreva nomes ou dados pessoais: o texto é protegido, mas o foco são fatores do trabalho.</p>
            <textarea class="input" rows="4" maxlength="1000" [(ngModel)]="comment" name="comment" placeholder="Ex.: o que ajudaria seu dia a fluir melhor?"></textarea>
          </div>
          <div class="nav">
            <button class="btn btn-ghost" type="button" (click)="back()">Voltar</button>
            <button class="btn btn-accent" type="button" (click)="submit()" [disabled]="sending()">{{ sending() ? 'Enviando…' : 'Enviar' }}</button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .center { display: flex; flex-direction: column; gap: 14px; text-align: center; align-items: stretch; }
    .col { display: flex; flex-direction: column; gap: 10px; }
    .ok { width: 64px; height: 64px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800; background: var(--at-baixa-bg); color: var(--at-baixa); }
    .progress { height: 6px; background: var(--ink-soft); border-radius: 999px; overflow: hidden; margin-bottom: 6px; }
    .fill { height: 100%; background: var(--grad-accent); border-radius: 999px; transition: width .3s var(--ease); }
    .q { display: flex; flex-direction: column; gap: 18px; padding: 22px 18px; }
    .moods, .opts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .mood, .opt {
      min-height: 64px; border-radius: var(--r-md); border: 1.5px solid var(--line-strong); background: var(--surface);
      color: var(--ink); cursor: pointer; font-family: inherit; font-size: 20px; font-weight: 700; transition: transform .12s var(--ease), border-color .12s, background .12s;
    }
    .emoji { font-size: 30px; line-height: 1; }
    .mood:active, .opt:active { transform: scale(.95); }
    .sel { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
    .ends { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; color: var(--muted); }
    .nav { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
    @media (min-width: 720px) { .page, .center { max-width: 560px; margin: 0 auto; } .center { width: 100%; } }
  `],
})
export class CheckinComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly scale = [1, 2, 3, 4, 5];
  readonly moods = MOODS;

  questions = signal<Question[]>([]);
  answers = signal<Record<string, number>>({});
  step = signal(0);
  comment = '';
  loading = signal(true);
  sending = signal(false);
  done = signal(false);
  blocked = signal(false);
  error = signal<string | null>(null);

  total = computed(() => this.questions().length + 1);
  progress = computed(() => Math.round((this.step() / this.total()) * 100));
  current = computed<Question | null>(() => this.questions()[this.step()] ?? null);

  constructor() { void this.load(); }

  private async load() {
    try {
      const [q, s] = await Promise.all([
        this.api.get<{ questions: Question[] }>('/checkins/questions'),
        this.api.get<CheckinStatus>('/checkins/status'),
      ]);
      // A pergunta de humor vem primeiro ("Como você está hoje?").
      this.questions.set([...q.questions].sort((a, b) => (a.kind === 'mood' ? -1 : 0) - (b.kind === 'mood' ? -1 : 0)));
      this.blocked.set(!s.canAnswer);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro ao carregar o check-in.');
    } finally {
      this.loading.set(false);
    }
  }

  value(key: string): number { return this.answers()[key] ?? 0; }

  pick(q: Question, n: number) {
    this.answers.update(a => ({ ...a, [q.key]: n }));
    // Avança sozinho após um instante (fluxo rápido no celular).
    setTimeout(() => { if (this.current()?.key === q.key && this.value(q.key) === n) this.next(); }, 260);
  }

  next() { if (this.step() < this.total() - 1) this.step.update(s => s + 1); }
  back() { if (this.step() > 0) this.step.update(s => s - 1); }

  async submit() {
    this.sending.set(true);
    try {
      const a = this.answers();
      await this.api.post('/checkins', {
        answers: this.questions().map(q => ({ indicator: q.key, value: a[q.key] })),
        comment: this.comment.trim() || undefined,
      });
      this.done.set(true);
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Não foi possível enviar.');
    } finally {
      this.sending.set(false);
    }
  }
}
