import { Request, Response } from 'express';
import * as org from '../services/org.service';
import { ctxOf } from '../middlewares/auth';
import { id, optId } from '../utils/validate';

export const getCompany = async (req: Request, res: Response) => res.json({ company: await org.getCompany(ctxOf(req)) });
export const updateCompany = async (req: Request, res: Response) => res.json({ company: await org.updateCompany(ctxOf(req), req.body ?? {}) });

export const structure = async (req: Request, res: Response) => res.json(await org.structure(ctxOf(req), req.query.weeks));
export const createSector = async (req: Request, res: Response) => res.status(201).json({ sector: await org.createSector(ctxOf(req), req.body ?? {}) });
export const renameSector = async (req: Request, res: Response) => res.json({ sector: await org.renameSector(ctxOf(req), id(req.params.id), req.body ?? {}) });
export const deleteSector = async (req: Request, res: Response) => { await org.deleteSector(ctxOf(req), id(req.params.id)); res.status(204).end(); };

export const listTeams = async (req: Request, res: Response) => res.json({ teams: await org.listTeams(ctxOf(req), optId(req.query.sectorId, 'setor')) });
export const createTeam = async (req: Request, res: Response) => res.status(201).json({ team: await org.createTeam(ctxOf(req), req.body ?? {}) });
export const renameTeam = async (req: Request, res: Response) => res.json({ team: await org.renameTeam(ctxOf(req), id(req.params.id), req.body ?? {}) });
export const deleteTeam = async (req: Request, res: Response) => { await org.deleteTeam(ctxOf(req), id(req.params.id)); res.status(204).end(); };

export const employeeStats = async (req: Request, res: Response) => res.json(await org.employeeStats(ctxOf(req), req.query.weeks));
export const listEmployees = async (req: Request, res: Response) => res.json(await org.listEmployees(ctxOf(req), req.query as Record<string, unknown>));
export const createEmployee = async (req: Request, res: Response) => res.status(201).json(await org.createEmployee(ctxOf(req), req.body ?? {}));
export const updateEmployee = async (req: Request, res: Response) => res.json(await org.updateEmployee(ctxOf(req), id(req.params.id), req.body ?? {}));
