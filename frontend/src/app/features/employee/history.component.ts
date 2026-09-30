import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { CheckinHistoryItem, INDICATOR_LABELS } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'nx-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Meu histórico</h1>
        <p class="sub">Somente você vê estas respostas. Elas entram nos indicadores da empresa apenas de forma agregada.</p>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 160px"></div>
      } @else {
        @for (c of items(); track c.id) {
          <div class="card card-pad">
            <div class="row between">
              <strong>{{ c.createdAt | date: "dd/MM/yyyy 'às' HH:mm" }}</strong>
              <span class="tag tag-none">{{ c.weekKey }}</span>
            </div>
            <div class="bars">
              @for (a of c.answers; track a.indicator) {
                <div class="bar-row">
                  <span class="lbl">{{ label(a.indicator) }}</span>
                  <span class="bar"><span class="b-fill" [style.width.%]="a.value * 20"></span></span>
                  <span class="val">{{ a.value }}/5</span>
                </div>
              }
            </div>
            @if (c.comment) { <p class="small muted cm">“{{ c.comment }}”</p> }
          </div>
        } @empty {
          <div class="card card-pad"><p class="sub">Você ainda não enviou nenhum check-in.</p></div>
        }

        <div class="card card-pad lgpd">
          <span class="section-title">Seus dados (LGPD)</span>
          <div class="row-wrap">
            <button class="btn btn-ghost btn-sm" type="button" (click)="exportData()">Exportar meus dados</button>
            <button class="btn btn-danger btn-sm" type="button" (click)="askDelete()">Apagar meu histórico</button>
          </div>
        </div>
      }
    </div>

    @if (confirming()) {
      <div class="scrim" (click)="confirming.set(false)">
        <div class="sheet" role="alertdialog" (click)="$event.stopPropagation()">
          <h2>Apagar todo o seu histórico?</h2>
          <p class="sub" style="margin: 8px 0 16px">Seus check-ins e respostas serão removidos definitivamente. Isso não pode ser desfeito.</p>
          <div class="row-wrap"><button class="btn btn-ghost" type="button" (click)="confirming.set(false)">Cancelar</button>
            <button class="btn btn-danger" type="button" (click)="remove()">Apagar definitivamente</button></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .bars { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .bar-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 36px; align-items: center; gap: 8px; font-size: 13px; }
    .lbl { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { height: 8px; background: var(--ink-soft); border-radius: 999px; overflow: hidden; }
    .b-fill { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
    .val { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
    .cm { margin-top: 10px; }
    .lgpd { display: flex; flex-direction: column; gap: 12px; }
  `],
})
export class HistoryComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  items = signal<CheckinHistoryItem[]>([]);
  loading = signal(true);
  confirming = signal(false);

  constructor() { void this.load(); }

  label(key: string): string { return INDICATOR_LABELS[key] ?? key; }

  private async load() {
    try { this.items.set((await this.api.get<{ history: CheckinHistoryItem[] }>('/checkins')).history); }
    catch (e) { this.toast.error(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { this.loading.set(false); }
  }

  async exportData() {
    try {
      const blob = await this.api.blob('GET', '/me/export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'meus-dados-nexo.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Falha ao exportar.'); }
  }

  askDelete() { this.confirming.set(true); }

  async remove() {
    this.confirming.set(false);
    try {
      await this.api.delete('/me/checkins');
      this.items.set([]);
      this.toast.success('Seu histórico foi apagado.');
    } catch (e) { this.toast.error(e instanceof Error ? e.message : 'Falha ao apagar.'); }
  }
}
