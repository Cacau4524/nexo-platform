import { Request, Response } from 'express';
import * as checkin from '../services/checkin.service';
import * as dash from '../services/dashboard.service';
import * as ai from '../services/ai.service';
import * as iv from '../services/intervention.service';
import * as report from '../services/report.service';
import { ctxOf } from '../middlewares/auth';
import { id } from '../utils/validate';

// ---- check-ins (colaborador)
export const questions = (_req: Request, res: Response) => res.json({ questions: checkin.questions() });
export const createCheckin = async (req: Request, res: Response) => res.status(201).json({ checkin: await checkin.submit(ctxOf(req), req.body ?? {}) });
export const checkinStatus = async (req: Request, res: Response) => res.json(await checkin.status(ctxOf(req)));
export const myCheckins = async (req: Request, res: Response) => res.json({ history: await checkin.myHistory(ctxOf(req)) });
export const exportMe = async (req: Request, res: Response) => {
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-nexo.json"');
  res.json(await checkin.exportMyData(ctxOf(req)));
};
export const deleteMe = async (req: Request, res: Response) => res.json(await checkin.deleteMyCheckins(ctxOf(req)));

// ---- dashboard (gestor)
export const dashboard = async (req: Request, res: Response) => res.json(await dash.dashboard(ctxOf(req), req.query as Record<string, unknown>));
export const history = async (req: Request, res: Response) => res.json(await dash.historyFor(ctxOf(req), req.query as Record<string, unknown>));
export const notifications = async (req: Request, res: Response) => res.json({ notifications: await dash.notifications(ctxOf(req)) });

// ---- IA (gestor)
export const analyze = async (req: Request, res: Response) => res.status(201).json({ insight: await ai.requestInsight(ctxOf(req), req.body ?? {}) });
export const listInsights = async (req: Request, res: Response) => res.json({ insights: await ai.listInsights(ctxOf(req), Number(req.query.limit) || 20) });
export const getInsight = async (req: Request, res: Response) => res.json({ insight: await ai.getInsight(ctxOf(req), id(req.params.id)) });

// ---- intervenções e relatórios (gestor)
export const listInterventions = async (req: Request, res: Response) => res.json({ interventions: await iv.list(ctxOf(req)) });
export const createIntervention = async (req: Request, res: Response) => res.status(201).json(await iv.create(ctxOf(req), req.body ?? {}));
export const updateIntervention = async (req: Request, res: Response) => res.json(await iv.update(ctxOf(req), id(req.params.id), req.body ?? {}));
export const getReport = async (req: Request, res: Response) => res.json(await report.buildReport(ctxOf(req)));
export const exportReport = async (req: Request, res: Response) => {
  const pdf = await report.exportReportPdf(ctxOf(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment; filename="nexo-relatorio-executivo.pdf"');
  res.send(pdf);
};
