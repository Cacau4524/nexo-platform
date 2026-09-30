import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'nx-privacy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <h1>Privacidade por padrão</h1>
    <p class="sub">Como o NEXO trata as percepções da sua equipe.</p>

    <div class="card quote">
      <p>“O NEXO não tenta descobrir quem está doente. Ele busca entender
      <strong>o que no trabalho pode estar aumentando a pressão</strong> — e transforma essa
      percepção em prevenção.”</p>
    </div>

    <div class="grid">
      @for (item of items; track item.t) {
        <div class="card p">
          <span class="ico">{{ item.ok ? '✓' : '✕' }}</span>
          <div>
            <h3>{{ item.t }}</h3>
            <p>{{ item.d }}</p>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    h1 { font-size: 22px; }
    .sub { color: var(--muted); margin: 6px 0 20px; font-size: 13.5px; }
    .quote { padding: 24px 28px; margin-bottom: 18px; background: linear-gradient(135deg, var(--accent-soft), #fff); border-color: #D8D8F5; }
    .quote p { font-size: 16px; line-height: 1.65; color: var(--ink-2); font-weight: 500; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .p { display: flex; gap: 14px; padding: 20px 22px; }
    .ico {
      flex: none; width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 800;
      background: var(--at-baixa-bg); color: var(--at-baixa);
    }
    .p.neg .ico { background: var(--at-alta-bg); color: var(--at-alta); }
    .p h3 { font-size: 14px; }
    .p p { margin-top: 4px; font-size: 12.5px; color: var(--muted); line-height: 1.55; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class PrivacyComponent {
  items = [
    { ok: true, t: 'Respostas individuais protegidas', d: 'Somente você acessa suas próprias respostas e histórico.' },
    { ok: true, t: 'Dashboards gerenciais agregados', d: 'Gestores visualizam médias por grupo, nunca respostas de uma pessoa.' },
    { ok: true, t: 'Mínimo de participantes por grupo', d: 'Um setor ou equipe só aparece nos painéis quando há um número mínimo de participantes (padrão: 5). Abaixo disso, exibimos “dados insuficientes”.' },
    { ok: true, t: 'Cada empresa enxerga só os próprios dados', d: 'Os dados são separados por empresa no banco de dados. Nenhuma empresa acessa informações de outra.' },
    { ok: true, t: 'Nenhuma classificação psicológica individual', d: 'A análise trata apenas de temas do ambiente de trabalho.' },
    { ok: false, t: 'Nenhuma vigilância de mensagens', d: 'O NEXO não acessa e-mails, chats ou canais privados.' },
    { ok: false, t: 'Nenhuma tentativa de diagnóstico', d: 'A plataforma não diagnostica, não avalia e não rotula pessoas.' },
    { ok: false, t: 'Nenhuma recomendação de demissão', d: 'O sistema nunca sugere ações individuais punitivas.' },
    { ok: true, t: 'Transparência sobre a IA', d: 'Toda análise automática indica temas, intensidade e nível de confiança. Antes de qualquer análise externa, e-mails, telefones e documentos são removidos do texto.' },
    { ok: true, t: 'Comentários protegidos e temporários', d: 'Comentários são armazenados criptografados e apagados automaticamente após o período de retenção.' },
    { ok: true, t: 'Seus dados, seu controle', d: 'Em “Meu histórico” você pode exportar ou apagar tudo o que foi registrado sobre você.' },
  ];
}
