import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { env, aiConfigured } from './config/env';
import { openDb } from './database/db';
import { migrate } from './database/schema';
import { purgeOldComments } from './services/checkin.service';
import { HttpError } from './utils/validate';

async function bootstrap() {
  const db = await openDb();
  await migrate(db);
  console.log(`[NEXO] Banco: ${db.dialect} · k-mín=${env.minGroupSize} · IA: ${aiConfigured() ? `${env.ai.provider}/${env.ai.model}` : 'NÃO configurada (defina AI_API_KEY)'}`);

  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({
    // Só origens explicitamente permitidas (CORS_ORIGIN). Requisições sem Origin (curl, mesma origem) passam.
    origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'rate_limited', message: 'Muitas requisições. Aguarde alguns minutos.' } }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.use('/api', routes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Recurso não encontrado.' });
  });

  app.use((err: Error & { status?: number; type?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    // JSON malformado / corpo grande demais são erro do cliente, não do servidor.
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json', message: 'Corpo da requisição inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'Requisição grande demais.' });
    // Log sem corpo/cabeçalhos/query (podem conter dados pessoais).
    console.error(`[NEXO] ${req.method} ${req.path} →`, env.isProd ? err.message : err.stack);
    res.status(500).json({ error: 'internal', message: 'Erro interno. Tente novamente em instantes.' });
  });

  // Retenção de comentários (LGPD): roda na subida e a cada 24h.
  const purge = () => purgeOldComments().catch(e => console.error('[NEXO] Falha na retenção:', (e as Error).message));
  void purge();
  setInterval(purge, 24 * 3600 * 1000).unref();

  const server = app.listen(env.port, () => console.log(`[NEXO] API disponível em http://localhost:${env.port}/api`));
  const shutdown = () => server.close(() => { void db.close().finally(() => process.exit(0)); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(e => { console.error('[NEXO] Falha ao iniciar:', e); process.exit(1); });
