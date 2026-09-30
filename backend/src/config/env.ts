import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

// --- JWT secret ---------------------------------------------------------
// Em produção o segredo é obrigatório e precisa ser forte. Em desenvolvimento
// usamos um valor local (com aviso) para não quebrar o fluxo de quem clona o projeto.
let jwtSecret = process.env.JWT_SECRET || '';
if (isProd) {
  if (jwtSecret.length < 32) {
    console.error('[NEXO] FATAL: defina JWT_SECRET com pelo menos 32 caracteres em produção.');
    process.exit(1);
  }
} else if (!jwtSecret) {
  jwtSecret = 'nexo-dev-only-secret-' + crypto.createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16);
  console.warn('[NEXO] AVISO: JWT_SECRET não definido. Usando segredo local de desenvolvimento.');
}

// --- Chave de criptografia dos comentários (AES-256-GCM) -----------------
// 32 bytes em hex (64 caracteres). Gere com: openssl rand -hex 32
const encKeyHex = process.env.ENCRYPTION_KEY || '';
if (encKeyHex && !/^[0-9a-fA-F]{64}$/.test(encKeyHex)) {
  console.error('[NEXO] FATAL: ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes).');
  process.exit(1);
}
if (isProd && !encKeyHex) {
  console.warn('[NEXO] AVISO: ENCRYPTION_KEY não definido — comentários serão gravados sem criptografia.');
}

const aiKey = process.env.AI_API_KEY || process.env.LLM_API_KEY || '';
const aiProvider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
if (!['anthropic', 'openai'].includes(aiProvider)) {
  console.error('[NEXO] FATAL: AI_PROVIDER deve ser "anthropic" ou "openai" (qualquer API compatível com OpenAI).');
  process.exit(1);
}

const dbClient = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
if (!['sqlite', 'mysql'].includes(dbClient)) {
  console.error('[NEXO] FATAL: DB_CLIENT deve ser "sqlite" ou "mysql".');
  process.exit(1);
}

export const env = {
  isProd,
  port: num(process.env.PORT, 3001),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // Lista de origens permitidas, separadas por vírgula.
  corsOrigins: (process.env.CORS_ORIGIN || (isProd ? '' : 'http://localhost:4200,http://127.0.0.1:4200'))
    .split(',').map(s => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Se false, novas empresas só podem ser criadas por quem administra o servidor (seed/SQL).
  allowCompanySignup: process.env.ALLOW_COMPANY_SIGNUP ? process.env.ALLOW_COMPANY_SIGNUP === 'true' : true,
  // Privacidade: nº mínimo de PESSOAS para exibir qualquer dado agregado de um grupo.
  minGroupSize: Math.max(3, num(process.env.MIN_GROUP_SIZE, 5)),
  // Limite de check-ins por pessoa por semana (0 = sem limite; padrão: 1 em produção, sem limite em desenvolvimento).
  checkinsPerWeek: num(process.env.CHECKIN_LIMIT_PER_WEEK, isProd ? 1 : 0),
  // Retenção do texto livre dos comentários, em dias (0 = não apagar).
  commentRetentionDays: num(process.env.COMMENT_RETENTION_DAYS, 180),
  encryptionKey: encKeyHex ? Buffer.from(encKeyHex, 'hex') : null,
  db: {
    client: dbClient as 'sqlite' | 'mysql',
    sqlitePath: process.env.SQLITE_PATH || './data/nexo.db',
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: num(process.env.MYSQL_PORT, 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'nexo_app',
    },
  },
  // IA: a chave existe SOMENTE aqui (variável de ambiente do servidor). Nunca é enviada ao navegador.
  ai: {
    provider: aiProvider as 'anthropic' | 'openai',
    apiKey: aiKey,
    apiUrl: process.env.AI_API_URL || process.env.LLM_API_URL || '',
    model: process.env.AI_MODEL || process.env.LLM_MODEL || (aiProvider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'),
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 45000),
    maxPerHour: num(process.env.AI_MAX_PER_HOUR, 20),
    // Análise opcional do texto livre de comentários (desligada por padrão: mais privacidade).
    commentAnalysis: process.env.AI_ANALYZE_COMMENTS === 'true',
  },
};

export const aiConfigured = () => !!env.ai.apiKey;
