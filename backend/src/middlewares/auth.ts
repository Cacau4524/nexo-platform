import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { loadAuthUser } from '../services/auth.service';
import type { Ctx } from '../services/context';

export interface AuthedRequest extends Request { ctx?: Ctx }

const JWT = { algorithm: 'HS256' as const, issuer: 'nexo', audience: 'nexo-app' };

/** O token carrega SOMENTE o id do usuário. Empresa e perfil são sempre lidos do banco a cada requisição. */
export function signToken(userId: number): string {
  return jwt.sign({}, env.jwtSecret, { ...JWT, subject: String(userId), expiresIn: env.jwtExpiresIn } as SignOptions);
}

export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'auth_required', message: 'Autenticação necessária.' });
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ['HS256'], issuer: JWT.issuer, audience: JWT.audience }) as JwtPayload;
    const user = await loadAuthUser(Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'auth_invalid', message: 'Sessão inválida. Faça login novamente.' });
    req.ctx = { companyId: user.companyId, userId: user.id, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'auth_invalid', message: 'Sessão expirada. Faça login novamente.' });
  }
}

export function requireRole(...roles: Ctx['role'][]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.ctx) return res.status(401).json({ error: 'auth_required', message: 'Autenticação necessária.' });
    if (!roles.includes(req.ctx.role)) return res.status(403).json({ error: 'forbidden', message: 'Seu perfil não tem acesso a este recurso.' });
    next();
  };
}

/** Único ponto de onde os controllers obtêm o tenant. Nunca vem de body, query ou params. */
export function ctxOf(req: Request): Ctx {
  const ctx = (req as AuthedRequest).ctx;
  if (!ctx) throw new Error('Requisição sem contexto autenticado.');
  return ctx;
}
