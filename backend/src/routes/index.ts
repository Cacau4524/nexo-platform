import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middlewares/auth';
import * as auth from '../controllers/authController';
import * as org from '../controllers/orgController';
import * as data from '../controllers/dataController';
import { env } from '../config/env';
import { aiConfigured } from '../config/env';

const router = Router();

// Express 4 não captura erros de handlers async: este wrapper encaminha ao middleware de erro.
type H = (req: Request, res: Response) => unknown | Promise<unknown>;
const h = (fn: H): RequestHandler => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const limiter = (limit: number, windowMin: number, message: string, skipOk = false) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: skipOk,
  message: { error: 'rate_limited', message },
});
const loginLimiter = limiter(10, 15, 'Muitas tentativas de login. Aguarde alguns minutos.', true);
const lookupLimiter = limiter(30, 15, 'Muitas consultas. Aguarde alguns minutos.');
const signupLimiter = limiter(10, 60, 'Muitos cadastros a partir desta rede. Tente mais tarde.');
const writeLimiter = limiter(60, 15, 'Muitas requisições. Aguarde alguns minutos.');
const aiLimiter = limiter(10, 15, 'Muitas análises solicitadas. Aguarde alguns minutos.');
const exportLimiter = limiter(10, 15, 'Muitas exportações. Aguarde alguns minutos.');

const anyRole = [authenticate];
const managers = [authenticate, requireRole('manager')];
const employees = [authenticate, requireRole('employee')];

// ---------------------------------------------------------------- público
router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.get('/config', (_req, res) => res.json({ minGroupSize: env.minGroupSize, allowCompanySignup: env.allowCompanySignup, aiConfigured: aiConfigured() }));

router.post('/auth/company', lookupLimiter, h(auth.findCompany));
router.post('/auth/register-company', signupLimiter, h(auth.registerCompany));
router.post('/auth/register', signupLimiter, h(auth.register));
router.post('/auth/login', loginLimiter, h(auth.login));

// ---------------------------------------------------------------- qualquer perfil autenticado (sempre no escopo do PRÓPRIO usuário)
router.get('/auth/me', ...anyRole, h(auth.me));
router.put('/me/profile', ...anyRole, writeLimiter, h(auth.updateProfile));
router.put('/me/password', ...anyRole, limiter(10, 15, 'Muitas tentativas. Aguarde alguns minutos.'), h(auth.changePassword));
router.put('/me/theme', ...anyRole, writeLimiter, h(auth.setTheme));
router.get('/me/export', ...anyRole, exportLimiter, h(data.exportMe));
router.delete('/me/checkins', ...anyRole, writeLimiter, h(data.deleteMe));
router.get('/company', ...anyRole, h(org.getCompany));

// ---------------------------------------------------------------- colaborador
router.get('/checkins/questions', ...employees, h(data.questions));
router.get('/checkins/status', ...employees, h(data.checkinStatus));
router.post('/checkins', ...employees, writeLimiter, h(data.createCheckin));
router.get('/checkins', ...anyRole, h(data.myCheckins)); // histórico do próprio usuário

// ---------------------------------------------------------------- gestor (dados agregados, sempre da própria empresa)
router.put('/company', ...managers, writeLimiter, h(org.updateCompany));

router.get('/employees/stats', ...managers, h(org.employeeStats));
router.get('/employees', ...managers, h(org.listEmployees));
router.post('/employees', ...managers, writeLimiter, h(org.createEmployee));
router.put('/employees/:id', ...managers, writeLimiter, h(org.updateEmployee));

router.get('/sectors', ...managers, h(org.structure));
router.post('/sectors', ...managers, writeLimiter, h(org.createSector));
router.put('/sectors/:id', ...managers, writeLimiter, h(org.renameSector));
router.delete('/sectors/:id', ...managers, writeLimiter, h(org.deleteSector));

router.get('/teams', ...managers, h(org.listTeams));
router.post('/teams', ...managers, writeLimiter, h(org.createTeam));
router.put('/teams/:id', ...managers, writeLimiter, h(org.renameTeam));
router.delete('/teams/:id', ...managers, writeLimiter, h(org.deleteTeam));

router.get('/dashboard', ...managers, h(data.dashboard));
router.get('/history', ...managers, h(data.history));
router.get('/notifications', ...managers, h(data.notifications));

router.post('/ai/analyze', ...managers, aiLimiter, h(data.analyze));
router.get('/ai/insights', ...managers, h(data.listInsights));
router.get('/ai/insights/:id', ...managers, h(data.getInsight));

router.get('/interventions', ...managers, h(data.listInterventions));
router.post('/interventions', ...managers, writeLimiter, h(data.createIntervention));
router.put('/interventions/:id', ...managers, writeLimiter, h(data.updateIntervention));
router.get('/reports', ...managers, h(data.getReport));
router.post('/reports/export', ...managers, exportLimiter, h(data.exportReport));

export default router;
