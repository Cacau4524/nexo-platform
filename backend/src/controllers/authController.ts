import { Request, Response } from 'express';
import * as auth from '../services/auth.service';
import { signToken, ctxOf } from '../middlewares/auth';
import { HttpError } from '../utils/validate';

async function session(companyId: number, userId: number) {
  const user = await auth.sessionUser(companyId, userId);
  if (!user) throw new HttpError(401, 'auth_invalid', 'Sessão inválida.');
  return { token: signToken(userId), user };
}

/** Passo 1: "Qual é a sua empresa?" — devolve só o necessário para o cadastro (nome e estrutura). */
export const findCompany = async (req: Request, res: Response) => {
  const c = await auth.findCompany(req.body?.company ?? req.body?.query);
  if (!c) throw new HttpError(404, 'company_not_found', 'Não encontramos essa empresa. Confira o nome ou o código com seu gestor.');
  res.json({ company: await auth.companyPublicInfo(c) });
};

export const registerCompany = async (req: Request, res: Response) => {
  const r = await auth.registerCompany(req.body ?? {});
  res.status(201).json(await session(r.companyId, r.userId));
};

export const register = async (req: Request, res: Response) => {
  const r = await auth.registerEmployee(req.body ?? {});
  res.status(201).json(await session(r.companyId, r.userId));
};

export const login = async (req: Request, res: Response) => {
  const r = await auth.login(req.body ?? {}, req.ip);
  res.json(await session(r.companyId, r.userId));
};

export const me = async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  const user = await auth.sessionUser(ctx.companyId, ctx.userId);
  if (!user) throw new HttpError(401, 'auth_invalid', 'Sessão inválida.');
  res.json({ user });
};

export const setTheme = async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  await auth.setTheme(ctx.companyId, ctx.userId, req.body?.theme);
  res.json({ theme: req.body.theme });
};
