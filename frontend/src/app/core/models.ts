export type Role = 'employee' | 'manager';
export type Level = 'baixa' | 'moderada' | 'alta';
export type ThemeMode = 'light' | 'dark';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  phone?: string | null;
  sectorId: number | null;
  sectorName: string | null;
  teamId: number | null;
  teamName: string | null;
  theme: ThemeMode | null;
  company: { name: string; code?: string };
}

export interface AuthResponse { token: string; user: SessionUser; }

export interface TeamRef { id: number; name: string; }
export interface SectorRef { id: number; name: string; teams: TeamRef[]; }
export interface CompanyPublic { name: string; code: string; selfSignup: boolean; sectors: SectorRef[]; }

export interface Part { eligible: number; participated: number; notParticipated: number; rate: number; }
export interface Attention { index: number; level: Level; }

export interface IndicatorStat {
  key: string; label: string; risk: boolean; avg: number; index: number; level: Level;
  prevIndex: number | null; delta: number | null;
}

/** Resumo de um grupo (setor/equipe): pode vir sem números quando há poucos participantes. */
export interface GroupBrief extends Part {
  id: number; name: string; sectorId?: number;
  insufficient: boolean; respondents: number; attention: Attention | null;
  previousIndex: number | null; topFactor: string | null;
}

export interface WeekPoint {
  week: string; label: string; respondents: number; suppressed: boolean; index: number | null;
  values: Record<string, number>;
}

export interface InsightResult {
  attentionLevel: 'baixo' | 'moderado' | 'elevado';
  mainSignal: string; whatChanged: string; whyItMatters: string;
  factorsToInvestigate: string[]; whatToInvestigate: string; suggestedActions: string[];
  howToFollow: string; recommendation: string; limitations: string;
}

export interface Insight {
  id: number; createdAt: string | null; weeks: number; weekFrom: string; weekTo: string;
  scope: { type: 'company' | 'sector' | 'team'; sectorId: number | null; teamId: number | null; label: string };
  participants: number; attentionLevel: string; provider: string; model: string;
  result: InsightResult;
}

export interface Trust { score: number; label: string; message: string; }

export interface DashboardData {
  company: { name: string };
  period: { weeks: number; from: string; to: string };
  minGroupSize: number;
  scope: { type: 'company' | 'sector' | 'team'; label: string; sectorId: number | null; teamId: number | null };
  overview: {
    total: number; registered: number; active: number; pending: number; inactive: number;
    participated: number; notParticipated: number; rate: number; sectors: number; teams: number;
  };
  focus: {
    participation: Part; insufficient: boolean; respondents: number; attention: Attention | null;
    previousIndex: number | null; topFactor: string | null; indicators: IndicatorStat[];
  };
  sectors: GroupBrief[];
  teams: GroupBrief[];
  history: WeekPoint[];
  trust: Trust;
  latestInsight: Insight | null;
  activeInterventions: number;
}

export interface EmployeeStats {
  weeks: number; total: number; active: number; pending: number; inactive: number;
  eligible: number; participated: number; notParticipated: number; rate: number;
}

export type EmployeeStatus = 'active' | 'pending' | 'inactive';
export interface EmployeeItem {
  id: number; name: string; email: string; jobTitle: string | null; phone: string | null;
  sectorId: number | null; sectorName: string | null; teamId: number | null; teamName: string | null;
  status: EmployeeStatus; createdAt: string | null; lastCheckinAt: string | null;
  participation: { weeksDone: number; weeksTotal: number };
}
export interface EmployeeList { total: number; page: number; pageSize: number; items: EmployeeItem[]; }

export interface StructureTeam extends Part { id: number; name: string; sectorId: number; }
export interface StructureSector extends Part { id: number; name: string; teams: StructureTeam[]; }
export interface Structure { weeks: number; sectors: StructureSector[]; }

export interface CompanyInfo {
  name: string; createdAt: string | null; sectors: number; teams: number; code?: string; selfSignup?: boolean;
}

export interface Question { key: string; label: string; prompt: string; low: string; high: string; kind: 'mood' | 'scale'; }
export interface CheckinStatus {
  weekKey: string; answeredThisWeek: boolean; canAnswer: boolean; lastCheckinAt: string | null; totalCheckins: number;
}
export interface CheckinHistoryItem {
  id: number; weekKey: string; createdAt: string | null;
  answers: { indicator: string; value: number }[]; comment?: string;
}

export type InterventionStatus = 'planejada' | 'em_andamento' | 'concluida';
export interface Intervention {
  id: number; sectorId: number | null; teamId: number | null; scopeLabel: string;
  indicator: string; indicatorLabel: string; problem: string; action: string; owner: string;
  dueDate: string; status: InterventionStatus; createdAt: string;
  result: { before: number; after: number; variationPct: number; observedAt: string } | null;
}

export interface ReportData {
  title: string; company: string; period: string; week: string; minGroupSize: number; insufficient: boolean;
  summary: {
    attentionIndex: number | null; attentionLevel: Level | null; participation: number; registered: number;
    participated: number; attentionFactors: number; activeInterventions: number;
  };
  movements: { key: string; text: string; delta: number }[];
  aiInsight: { createdAt: string | null; scope: string; recommendation: string; actions: string[] } | null;
  trust: Trust;
  interventions: { scope: string; indicator: string; action: string; owner: string; dueDate: string; status: string }[];
}

export interface NotificationItem { type: string; title: string; message: string; date: string; }

/** Rótulos dos indicadores (espelham o backend; a lista completa vem de /checkins/questions). */
export const INDICATOR_LABELS: Record<string, string> = {
  humor: 'Disposição no dia', carga: 'Carga de trabalho', tempo: 'Tempo para as atividades',
  pressao: 'Pressão no trabalho', apoio_equipe: 'Apoio da equipe', lideranca: 'Suporte da liderança',
  relacionamento: 'Relação com a equipe', autonomia: 'Autonomia',
};
export const LEVEL_LABEL: Record<Level, string> = { baixa: 'Baixa', moderada: 'Moderada', alta: 'Elevada' };
