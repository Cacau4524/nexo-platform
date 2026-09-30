import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnDestroy, SimpleChanges, effect, inject, input, viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ThemeService } from '../core/theme.service';
Chart.register(...registerables);

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Gráfico Chart.js que acompanha o tema (cores de texto/grade vêm das variáveis CSS) e o tamanho da tela. */
@Component({
  selector: 'nx-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="chart-wrap" [style.height.px]="height()"><canvas #cv></canvas></div>`,
  styles: [`.chart-wrap { position: relative; width: 100%; }`],
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  config = input.required<ChartConfiguration>();
  height = input(240);

  private theme = inject(ThemeService);
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private chart: Chart | null = null;
  private ready = false;

  constructor() {
    // Ao alternar o tema, recria o gráfico com as cores novas.
    effect(() => {
      this.theme.mode();
      if (this.ready) this.build();
    });
  }

  ngAfterViewInit() { this.ready = true; this.build(); }

  ngOnChanges(changes: SimpleChanges) {
    if (this.ready && changes['config'] && !changes['config'].firstChange) this.build();
  }

  ngOnDestroy() { this.chart?.destroy(); }

  private build() {
    this.chart?.destroy();
    const cfg = this.config();
    Chart.defaults.color = css('--muted', '#666870');
    Chart.defaults.borderColor = css('--line', '#E7E7E2');
    Chart.defaults.font.family = "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif";
    this.chart = new Chart(this.canvas().nativeElement, {
      ...cfg,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        ...((cfg.options as object) ?? {}),
      },
    });
  }
}
