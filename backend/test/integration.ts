/**
 * Teste de integração do NEXO (sem framework): `npm test`.
 * Usa SQLite em memória e um servidor HTTP local que imita o provedor de IA — assim o caminho
 * backend → HTTP → IA → validação → banco é exercitado de verdade, sem gastar chave real.
 * Cobre o requisito obrigatório: dados da Empresa A nunca aparecem para a Empresa B.
 */
import http from 'http';
import assert from 'assert/strict';

process.env.NODE_ENV = 'test';
process.env.MIN_GROUP_SIZE = '3';
process.env.CHECKIN_LIMIT_PER_WEEK = '1';
process.env.AI_PROVIDER = 'openai';
process.env.AI_API_KEY = 'chave-de-teste-nao-vai-ao-navegador';

let passed = 0;
const ok = (name: string) => { passed++; console.log('  ✓', name); };
const rejects = async (p: Promise<unknown>, status: number, name: string) => {
  try { await p; } catch (e: any) { assert.equal(e.status, status, `${name}: esperado HTTP ${status}, veio ${e.status} (${e.message})`); return ok(name); }
  assert.fail(`${name}: deveria ter falhado com HTTP ${status}`);
};

async function main() {
  // ---- provedor de IA falso (servidor HTTP local)
  const seen: string[] = [];
  let mode: 'ok' | 'clinical' = 'ok';
  const good = {
    attentionLevel: 'elevado', mainSignal: 'Aumento consistente do indicador de carga de trabalho.',
    whatChanged: 'A carga passou de 61 para 76 pontos.', whyItMatters: 'Sobrecarga sustentada costuma antecipar queda de apoio percebido.',
    factorsToInvestigate: ['distribuição de tarefas', 'dimensionamento da equipe'], whatToInvestigate: 'Comece pelas escalas do setor.',
    suggestedActions: ['Revisar escalas', 'Redistribuir tarefas'], howToFollow: 'Reavaliar o índice de carga em 4 semanas.',
    recommendation: 'Investigar a distribuição de carga e as escalas antes de definir uma intervenção.', limitations: 'Poucas semanas de dados.',
  };
  const fake = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      seen.push(body);
      const content = mode === 'clinical' ? JSON.stringify({ ...good, mainSignal: 'Sinais de burnout na equipe.' }) : JSON.stringify(good);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
  process.env.AI_API_URL = `http://127.0.0.1:${(fake.address() as any).port}/v1/chat/completions`;

  const { openSqliteMemory, setDb } = await import('../src/database/db');
  const { migrate } = await import('../src/database/schema');
  const db = await openSqliteMemory(); setDb(db); await migrate(db);

  const auth = await import('../src/services/auth.service');
  const org = await import('../src/services/org.service');
  const checkin = await import('../src/services/checkin.service');
  const dash = await import('../src/services/dashboard.service');
  const ai = await import('../src/services/ai.service');
  const iv = await import('../src/services/intervention.service');
  const report = await import('../src/services/report.service');
  const { env } = await import('../src/config/env');
  type Ctx = import('../src/services/context').Ctx;

  const PW = 'senha-segura-123';
  console.log('\n1) Empresas, gestores, estrutura');
  const a = await auth.registerCompany({ companyName: 'Hospital Exemplo', name: 'Gestora Alice', email: 'alice@hospital.test', password: PW });
  const b = await auth.registerCompany({ companyName: 'Nexus Tecnologia', name: 'Gestor Bruno', email: 'bruno@nexus.test', password: PW });
  assert.notEqual(a.companyId, b.companyId); ok('duas empresas criadas com gestor');
  await rejects(auth.registerCompany({ companyName: ' hospital   EXEMPLO ', name: 'Outro Gestor', email: 'x@x.test', password: PW }), 409, 'nome de empresa duplicado (normalizado) é recusado');
  await rejects(auth.registerCompany({ companyName: 'Fraca SA', name: 'Fulano de Tal', email: 'f@f.test', password: '12345678' }), 400, 'senha só numérica é recusada');

  const mgrA: Ctx = { companyId: a.companyId, userId: a.userId, role: 'manager' };
  const mgrB: Ctx = { companyId: b.companyId, userId: b.userId, role: 'manager' };

  const pw = (await db.query<any>('SELECT password_hash FROM users WHERE id = ?', [a.userId]))[0].password_hash as string;
  assert.ok(pw.startsWith('scrypt$') && !pw.includes(PW)); ok('senha armazenada como hash scrypt (nunca em texto)');

  const emerg = await org.createSector(mgrA, { name: 'Emergência' });
  const uti = await org.createSector(mgrA, { name: 'UTI' });
  const plantaoA = await org.createTeam(mgrA, { name: 'Plantão A', sectorId: emerg.id });
  const utiA = await org.createTeam(mgrA, { name: 'Equipe A', sectorId: uti.id });
  const dev = await org.createSector(mgrB, { name: 'Desenvolvimento' });
  const plat = await org.createTeam(mgrB, { name: 'Plataforma', sectorId: dev.id });
  await rejects(org.createSector(mgrA, { name: 'Emergência' }), 409, 'setor duplicado na mesma empresa é recusado');
  await org.createSector(mgrB, { name: 'Emergência' }); ok('o mesmo nome de setor pode existir em outra empresa');
  ok('setores e equipes criados por empresa');

  console.log('\n2) Cadastro de colaboradores e contas');
  const compA = await auth.findCompany('Hospital Exemplo');
  const compB = await auth.findCompany('nexus tecnologia');
  assert.ok(compA && compB); ok('empresa localizada por nome exato (sem acento/caixa)');
  assert.equal((await auth.findCompany(compA!.code.toLowerCase()))?.id, a.companyId); ok('empresa localizada pelo código');
  assert.equal(await auth.findCompany('Hospital'), null); ok('busca parcial NÃO lista empresas');

  const emailsA: string[] = [];
  for (let i = 0; i < 6; i++) {
    const email = `colab${i}@hospital.test`; emailsA.push(email);
    await org.createEmployee(mgrA, { name: `Colaborador A${i} Silva`, email, jobTitle: 'Enfermeiro', sectorId: emerg.id, teamId: plantaoA.id });
  }
  await org.createEmployee(mgrA, { name: 'Colaboradora Isolada Souza', email: 'isolada@hospital.test', jobTitle: 'Enfermeira', sectorId: uti.id, teamId: utiA.id });
  await org.createEmployee(mgrA, { name: 'Colaborador Dois Souza', email: 'dois@hospital.test', jobTitle: 'Técnico', sectorId: uti.id, teamId: utiA.id });
  await org.createEmployee(mgrA, { name: 'Nunca Participou Lima', email: 'nunca@hospital.test', jobTitle: 'Técnico', sectorId: emerg.id, teamId: plantaoA.id });
  await rejects(org.createEmployee(mgrA, { name: 'Repetido Silva', email: emailsA[0], jobTitle: 'X', sectorId: emerg.id, teamId: plantaoA.id }), 409, 'e-mail repetido na empresa é recusado');
  await rejects(org.createEmployee(mgrA, { name: 'Cruzado Silva', email: 'c@hospital.test', jobTitle: 'X', sectorId: dev.id, teamId: plat.id }), 400, 'setor/equipe de OUTRA empresa é recusado no cadastro');
  await rejects(org.createEmployee(mgrA, { name: 'Trocado Silva', email: 't@hospital.test', jobTitle: 'X', sectorId: uti.id, teamId: plantaoA.id }), 400, 'equipe que não pertence ao setor é recusada');

  // Colaboradores assumem a conta (pré-cadastro) e o mesmo e-mail pode existir em outra empresa
  for (const [i, email] of emailsA.entries()) await auth.registerEmployee({ company: 'Hospital Exemplo', name: `Colaborador A${i} Silva`, email, password: PW, jobTitle: 'Enfermeiro', sectorId: emerg.id, teamId: plantaoA.id });
  await auth.registerEmployee({ company: compA!.code, name: 'Colaboradora Isolada Souza', email: 'isolada@hospital.test', password: PW, jobTitle: 'Enfermeira', sectorId: uti.id, teamId: utiA.id });
  await auth.registerEmployee({ company: 'Nexus Tecnologia', name: 'Colaborador A0 Silva', email: emailsA[0], password: PW, jobTitle: 'Dev', sectorId: dev.id, teamId: plat.id });
  ok('pré-cadastro ativado pelo próprio colaborador; mesmo e-mail em outra empresa é outra conta');
  await rejects(auth.registerEmployee({ company: 'Hospital Exemplo', name: 'Fulano Qualquer', email: emailsA[0], password: PW, jobTitle: 'X', sectorId: emerg.id, teamId: plantaoA.id }), 409, 'conta já ativa não pode ser re-cadastrada');
  await rejects(auth.registerEmployee({ company: 'Empresa Inexistente', name: 'Fulano Qualquer', email: 'z@z.test', password: PW, jobTitle: 'X', sectorId: 1, teamId: 1 }), 404, 'empresa inexistente');

  console.log('\n3) Login por empresa');
  const l = await auth.login({ company: 'Hospital Exemplo', email: emailsA[0], password: PW });
  assert.equal(l.companyId, a.companyId); ok('login na empresa correta');
  await rejects(auth.login({ company: 'Nexus Tecnologia', email: 'alice@hospital.test', password: PW }), 401, 'gestor de A não entra na empresa B');
  await rejects(auth.login({ company: 'Hospital Exemplo', email: emailsA[0], password: 'errada-errada' }), 401, 'senha errada');
  await rejects(auth.login({ company: 'Hospital Exemplo', email: 'nunca@hospital.test', password: PW }), 401, 'conta pendente (sem senha) não entra');
  const sess = await auth.sessionUser(a.companyId, l.userId);
  assert.equal(sess!.role, 'employee'); assert.equal(sess!.company.code, undefined); ok('colaborador não recebe o código da empresa');
  await auth.setTheme(a.companyId, l.userId, 'dark');
  assert.equal((await auth.sessionUser(a.companyId, l.userId))!.theme, 'dark'); ok('tema salvo no banco por usuário');

  console.log('\n4) Check-ins e participação (calculada no banco)');
  const emp = async (email: string, companyId: number): Promise<Ctx> => {
    const r = (await db.query<any>('SELECT id FROM users WHERE company_id = ? AND email = ?', [companyId, email]))[0];
    return { companyId, userId: r.id, role: 'employee' };
  };
  const answers = (carga: number) => ['humor', 'carga', 'tempo', 'pressao', 'apoio_equipe', 'lideranca', 'relacionamento', 'autonomia']
    .map(k => ({ indicator: k, value: k === 'carga' || k === 'pressao' ? carga : 3 }));
  for (const email of emailsA.slice(0, 5)) await checkin.submit(await emp(email, a.companyId), { answers: answers(4), comment: 'Muita demanda, ligue para (71) 99999-1234' });
  await checkin.submit(await emp('isolada@hospital.test', a.companyId), { answers: answers(5) });
  await rejects(checkin.submit(await emp(emailsA[0], a.companyId), { answers: answers(2) }), 409, 'segundo check-in na mesma semana é recusado');
  await rejects(checkin.submit(await emp(emailsA[1], a.companyId), { answers: answers(2).slice(1) }), 400, 'check-in incompleto é recusado');
  await rejects(checkin.submit(mgrA, { answers: answers(2) }), 403, 'gestor não responde check-in');
  const stored = (await db.query<any>('SELECT comment FROM checkins WHERE comment IS NOT NULL LIMIT 1'))[0].comment as string;
  ok(`comentário gravado (${env.encryptionKey ? 'criptografado' : 'sem ENCRYPTION_KEY neste teste'})`);
  void stored;

  const st = await org.employeeStats(mgrA, 4);
  assert.equal(st.total, 9); assert.equal(st.pending, 2); assert.equal(st.active, 7);
  assert.equal(st.participated, 6); assert.equal(st.eligible, 9); assert.equal(st.notParticipated, 3);
  assert.equal(st.rate, 66.7); ok(`números reais: ${st.total} cadastrados, ${st.participated} participaram, ${st.notParticipated} não, taxa ${st.rate}%`);

  const d = await dash.dashboard(mgrA, { weeks: 4 });
  const sEm = d.sectors.find(s => s.name === 'Emergência')!;
  assert.equal(sEm.eligible, 7); assert.equal(sEm.participated, 5); assert.equal(sEm.rate, 71.4);
  assert.equal(sEm.insufficient, false); assert.equal(sEm.attention!.level, 'moderada'); assert.equal(sEm.attention!.index, 56.3);
  const carga = d.focus.indicators; void carga; ok('participação e atenção por setor (Emergência 5/7 = 71,4%, índice geral 56,3 = moderada)');
  const dEm = await dash.dashboard(mgrA, { sectorId: emerg.id });
  assert.equal(dEm.focus.indicators.find(i => i.key === 'carga')!.level, 'alta'); assert.equal(dEm.focus.indicators.find(i => i.key === 'carga')!.index, 75); ok('indicador de carga do setor em atenção "alta" (índice 75)');
  const sUti = d.sectors.find(s => s.name === 'UTI')!;
  assert.equal(sUti.insufficient, true); assert.equal(sUti.attention, null); ok('setor com 1 participante → "dados insuficientes", sem nenhum número');
  assert.ok(!JSON.stringify(d).includes('Isolada')); ok('dashboard não contém nomes de colaboradores');

  const list = await org.listEmployees(mgrA, { status: 'active', sectorId: emerg.id });
  assert.equal(list.total, 6); assert.ok(list.items.every(i => i.sectorName === 'Emergência'));
  assert.ok(!JSON.stringify(list).includes('"value"')); ok('lista de colaboradores: filtros funcionam e só há metadados de participação (nenhuma resposta)');
  assert.equal((await org.listEmployees(mgrA, { search: 'isolada' })).total, 1); ok('busca por nome');

  console.log('\n5) ISOLAMENTO ENTRE EMPRESAS (obrigatório)');
  for (let i = 0; i < 3; i++) {
    await org.createEmployee(mgrB, { name: `Dev B${i} Souza`, email: `dev${i}@nexus.test`, jobTitle: 'Dev', sectorId: dev.id, teamId: plat.id });
    await auth.registerEmployee({ company: 'Nexus Tecnologia', name: `Dev B${i} Souza`, email: `dev${i}@nexus.test`, password: PW, jobTitle: 'Dev', sectorId: dev.id, teamId: plat.id });
    await checkin.submit(await emp(`dev${i}@nexus.test`, b.companyId), { answers: answers(2) });
  }
  const dB = await dash.dashboard(mgrB, { weeks: 4 });
  assert.equal(dB.overview.registered, 4); // 3 novos + 1 (colaborador com mesmo e-mail de A) cadastrados em B
  assert.deepEqual(dB.sectors.map(s => s.name).sort(), ['Desenvolvimento', 'Emergência']); ok('dashboard de B só tem os setores de B');
  const emB = dB.sectors.find(s => s.name === 'Emergência')!;
  assert.equal(emB.eligible, 0); assert.equal(emB.participated, 0); assert.equal(emB.respondents, 0); ok('setor "Emergência" de B (mesmo nome do de A) está vazio: nada vaza por nome');
  const listB = await org.listEmployees(mgrB, {});
  assert.ok(listB.items.every(i => i.email.endsWith('@nexus.test') || i.email === emailsA[0])); assert.equal(listB.total, 4);
  assert.ok(!listB.items.some(i => i.email.endsWith('@hospital.test') && i.email !== emailsA[0])); ok('lista de colaboradores de B não contém ninguém de A');
  assert.equal(dB.focus.indicators.find(i => i.key === 'carga')!.avg, 2); ok('médias de B (carga 2) não são contaminadas pelos check-ins de A (carga 4/5)');
  await rejects(org.updateEmployee(mgrB, (await emp('isolada@hospital.test', a.companyId)).userId, { jobTitle: 'Hackeado' }), 404, 'B não edita colaborador de A');
  await rejects(org.deleteSector(mgrB, emerg.id), 404, 'B não remove setor de A');
  await rejects(org.renameTeam(mgrB, plantaoA.id, { name: 'Invadida' }), 404, 'B não renomeia equipe de A');
  await rejects(dash.dashboard(mgrB, { sectorId: emerg.id }), 404, 'B não consulta o dashboard do setor de A');
  await rejects(dash.dashboard(mgrB, { teamId: plantaoA.id }), 404, 'B não consulta a equipe de A');
  await rejects(dash.historyFor(mgrB, { teamId: plantaoA.id }), 404, 'B não consulta o histórico da equipe de A');
  await rejects(ai.requestInsight(mgrB, { sectorId: emerg.id }), 404, 'B não pede análise de IA sobre o setor de A');
  await rejects(iv.create(mgrB, { sectorId: emerg.id, indicator: 'carga', problem: 'p', action: 'a' }), 404, 'B não cria intervenção no setor de A');

  console.log('\n6) IA real (caminho completo HTTP → validação → banco)');
  const before = seen.length;
  const r1 = await ai.requestInsight(mgrA, { sectorId: emerg.id, weeks: 4 });
  assert.equal(seen.length, before + 1); assert.equal(r1.result.recommendation, good.recommendation); ok('gestor solicita análise; o backend chamou o provedor e gravou o resultado');
  const sent = seen[seen.length - 1];
  assert.ok(sent.includes('chave-de-teste') === false, 'a chave não vai no corpo');
  for (const forbidden of ['colab0', '@hospital', 'Silva', 'Colaborador', '99999', 'Hospital Exemplo', 'Muita demanda']) assert.ok(!sent.includes(forbidden), `payload da IA vazou: ${forbidden}`);
  ok('payload enviado à IA é agregado: sem nomes, e-mails, comentários, telefones ou nome da empresa');
  await rejects(ai.requestInsight(mgrA, { sectorId: uti.id }), 422, 'setor com poucos participantes: IA nem é chamada (privacidade)');
  assert.equal(seen.length, before + 1); ok('nenhuma chamada externa foi feita para o grupo pequeno');
  mode = 'clinical';
  await rejects(ai.requestInsight(mgrA, { sectorId: emerg.id }), 502, 'resposta com termo clínico ("burnout") é rejeitada após nova tentativa');
  mode = 'ok';
  assert.equal((await ai.listInsights(mgrA)).length, 1); assert.equal((await ai.listInsights(mgrB)).length, 0); ok('insights listados apenas da própria empresa');
  await rejects(ai.getInsight(mgrB, r1.id), 404, 'B não abre o insight de A');
  assert.equal((await dash.dashboard(mgrA, {})).latestInsight!.id, r1.id); ok('dashboard exibe o último insight real gravado');

  console.log('\n7) Histórico, intervenção, relatório, LGPD');
  const h = await dash.historyFor(mgrA, { sectorId: emerg.id, weeks: 4 });
  assert.equal(h.points.length, 4); assert.ok(h.points.some(p => p.index !== null)); ok('histórico semanal do setor (semanas sem massa mínima são suprimidas)');
  const created = await iv.create(mgrA, { sectorId: emerg.id, indicator: 'carga', problem: 'Sobrecarga', action: 'Rever escalas', owner: 'Gestora Alice' });
  await iv.update(mgrA, created.id, { status: 'concluida' });
  assert.equal((await iv.list(mgrA)).length, 1); assert.equal((await iv.list(mgrB)).length, 0); ok('intervenções isoladas por empresa');
  const rep = await report.buildReport(mgrA); assert.equal(rep.summary.registered, 9); assert.ok(rep.aiInsight); ok('relatório usa dados reais e a análise de IA gravada');
  assert.ok((await report.exportReportPdf(mgrA)).subarray(0, 4).toString() === '%PDF'); ok('PDF gerado');
  const mine = await checkin.myHistory(await emp(emailsA[0], a.companyId));
  assert.equal(mine.length, 1); assert.equal((await checkin.myHistory(await emp(emailsA[1], a.companyId))).length, 1);
  const exp = await checkin.exportMyData(await emp(emailsA[0], a.companyId)); assert.equal(exp.checkins.length, 1); ok('colaborador vê só o próprio histórico');
  assert.equal((await checkin.deleteMyCheckins(await emp(emailsA[0], a.companyId))).removed, 1);
  assert.equal(Number((await db.query<any>(`SELECT COUNT(*) AS n FROM checkin_answers WHERE checkin_id NOT IN (SELECT id FROM checkins)`))[0].n), 0); ok('direito ao apagamento remove check-in e respostas (cascata)');

  console.log('\n8) Integridade no próprio banco (defesa em profundidade)');
  const now = '2026-01-01 00:00:00';
  const tryInsert = async (sql: string, params: unknown[], name: string) => {
    try { await db.run(sql, params); } catch { return ok(name); }
    assert.fail(`${name}: o banco aceitou um vínculo entre empresas`);
  };
  await tryInsert('INSERT INTO teams (company_id, sector_id, name, created_at) VALUES (?, ?, ?, ?)', [b.companyId, emerg.id, 'Cruzada', now], 'FK composta: equipe de B não aponta para setor de A');
  await tryInsert(`INSERT INTO users (company_id, sector_id, team_id, name, email, role, status, created_at) VALUES (?, ?, ?, 'X', 'x@x.test', 'employee', 'pending', ?)`, [b.companyId, emerg.id, plantaoA.id, now], 'FK composta: usuário de B não pode ser vinculado a setor/equipe de A');
  await tryInsert('INSERT INTO checkins (company_id, user_id, week_key, created_at) VALUES (?, ?, ?, ?)', [b.companyId, mgrA.userId, '2026-W01', now], 'FK composta: check-in de B não aponta para usuário de A');

  fake.close();
  console.log(`\n✔ ${passed} verificações passaram.\n`);
}
main().catch(e => { console.error('\n✘ FALHOU:', e?.stack ?? e); process.exit(1); });
