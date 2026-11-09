/** Motor de regras com adaptador Storage. Na aplicação web atual, a API executa
 * este motor sobre um snapshot dentro de transação SQL no servidor.
 * O navegador usa ApiService; os adaptadores locais permanecem para testes e legado. */
import { BusinessRuleError } from './errors';
import type {
  Appointment,
  EducationalRequest,
  HistoryEvent,
  RequestPriority,
  WorkOrder,
  WorkOrderStatus,
} from '../types';
import {
  INITIAL_REQUESTS,
  INITIAL_SCHOOLS,
  INITIAL_SEI_LOGS,
  INITIAL_APPOINTMENTS,
} from '../services/mockData';
import {
  calculateMetrics,
  formatProtocolNumber,
  parseProtocolNumber,
  isValidStatusTransition,
  isRequestEligibleForSei,
  parseHistoricalProtocol,
  STATUS_CONFIG,
  CATEGORY_LABELS,
} from '../utils/helpers';
import {
  appointmentSchema,
  categoryClassificationSchema,
  deadlineRulesSchema,
  requestFormSchema,
  stateSchema,
  storedRequestSchema,
  workOrderSchema,
  type StoredState,
} from './schemas';
import {
  calculateCategoryDeadline,
  maskApplicantName,
  maskPhone,
  recifeDateKey,
} from './governance';
import {
  DEFAULT_DEADLINE_RULES,
  SERVICE_CATALOG,
  WORK_ORDER_LABELS,
  WORK_ORDER_TRANSITIONS,
} from './serviceCatalog';

export const STATE_KEY = 'redeatende_state_v4';
const UPDATE_EVENT = 'redeatende:data_updated';
const id = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const copy = <T>(value: T): T => structuredClone(value);
const demoState = (): StoredState =>
  copy({
    schemaVersion: 4,
    catalogRevision: 1,
    requests: INITIAL_REQUESTS,
    schools: INITIAL_SCHOOLS,
    seiLogs: INITIAL_SEI_LOGS,
    appointments: INITIAL_APPOINTMENTS,
    nextSequenceByYear: {},
    submissions: {},
    workOrders: [],
    notifications: [],
    deadlineRules: DEFAULT_DEADLINE_RULES,
    ruleHistory: [],
  });
type CreateInput = Omit<
  EducationalRequest,
  'id' | 'protocol' | 'createdAt' | 'updatedAt' | 'history' | 'status'
>;
export interface DispatchOptions {
  visibility?: 'publica' | 'interna';
  publicResponsible?: boolean;
  priorityReason?: string;
  categoryReason?: string;
  deadlineReason?: string;
}

export class StorageService {
  constructor(
    private suppliedStorage?: Storage,
    private clock: () => Date = () => new Date(),
    private holidays: string[] = [],
    private nextOrderNumber?: number,
  ) {}
  private storage(): Storage {
    try {
      const storage = this.suppliedStorage ?? window.localStorage;
      if (!storage) throw new Error();
      return storage;
    } catch {
      throw new Error(
        'O armazenamento deste navegador está indisponível. Permita dados locais e tente novamente.',
      );
    }
  }
  private write(state: StoredState): void {
    try {
      const serialized = JSON.stringify(stateSchema.parse(state));
      this.storage().setItem(STATE_KEY, serialized);
    } catch {
      throw new Error(
        'Não foi possível gravar no armazenamento do navegador. Nenhuma alteração desta operação foi salva. Verifique espaço e permissões.',
      );
    }
  }
  private validate(state: StoredState): StoredState {
    const ids = new Set<string>();
    const protocols = new Set<string>();
    for (const request of state.requests) {
      const parsed = parseHistoricalProtocol(
        request.protocol,
        Number(recifeDateKey(request.createdAt).slice(0, 4)),
      );
      if (!parsed.valid) throw new Error('Protocolo inválido na base.');
      const protocol = `${parsed.year}-${parsed.seq}`;
      if (ids.has(request.id) || protocols.has(protocol))
        throw new Error('Há identificadores ou protocolos duplicados na base.');
      ids.add(request.id);
      protocols.add(protocol);
    }
    if (new Set(state.appointments.map((a) => a.id)).size !== state.appointments.length)
      throw new Error('Há agendamentos duplicados.');
    if (state.appointments.some((a) => a.requestId && !ids.has(a.requestId)))
      throw new Error('Há agendamento vinculado a solicitação inexistente.');
    if (
      new Set(state.workOrders.map((w) => w.id)).size !== state.workOrders.length ||
      new Set(state.workOrders.map((w) => w.number)).size !== state.workOrders.length
    )
      throw new Error('Há ordens de serviço duplicadas.');
    if (state.workOrders.some((w) => !ids.has(w.requestId)))
      throw new Error('Ordem vinculada a solicitação inexistente.');
    return state;
  }
  public init(): void {
    this.read();
  }
  private read(): StoredState {
    const storage = this.storage();
    const raw = storage.getItem(STATE_KEY);
    if (raw !== null) {
      try {
        const state = this.validate(stateSchema.parse(JSON.parse(raw)));
        if (state.catalogRevision === 0) {
          for (const school of INITIAL_SCHOOLS) {
            const index = state.schools.findIndex((s) => s.id === school.id);
            if (index < 0) state.schools.push(copy(school));
            else if (state.schools[index].name.startsWith('Escola Demonstrativa')) {
              state.schools[index] = copy(school);
              for (const request of state.requests.filter((r) => r.schoolId === school.id))
                request.schoolName = school.name;
              for (const appointment of state.appointments.filter((a) => a.schoolId === school.id))
                appointment.schoolName = school.name;
            }
          }
          for (const request of state.requests) {
            if (request.status === 'aguardando_informacoes' && !request.informationRequests?.length)
              request.informationRequests = [
                {
                  id: id('info'),
                  prompt:
                    request.history.at(-1)?.note || 'Informe os detalhes solicitados pela equipe.',
                  createdAt: request.updatedAt,
                },
              ];
          }
          state.catalogRevision = 1;
          this.write(state);
        }
        return state;
      } catch {
        throw new Error(
          'Os dados locais estão inválidos ou duplicados. Eles foram preservados. Restaure a base demonstrativa somente se desejar descartá-los.',
        );
      }
    }
    let state = demoState();
    // Migra o primeiro conjunto existente e preserva todas as chaves originais.
    for (const prefix of ['redeatende', 'educonecta']) {
      let migrated = false;
      for (const version of prefix === 'redeatende' ? [3, 2] : [1]) {
        const key = (name: string) => `${prefix}_${name}_v${version}`;
        const legacy = storage.getItem(key('requests'));
        if (legacy === null) continue;
        try {
          state.requests = JSON.parse(legacy);
          const schools = storage.getItem(key('schools'));
          const logs = storage.getItem(key('sei_logs'));
          const appointments = storage.getItem(key('appointments'));
          state.schools = schools === null ? state.schools : JSON.parse(schools);
          state.seiLogs = logs === null ? [] : JSON.parse(logs);
          state.appointments = appointments === null ? [] : JSON.parse(appointments);
          const seq = storage.getItem(key('next_seq'));
          if (seq && /^\d+$/.test(seq) && Number(seq) >= 1 && Number(seq) <= 1000000) {
            const years = state.requests
              .map((r) => Number(recifeDateKey(r.createdAt).slice(0, 4)))
              .filter(Number.isFinite);
            const year = years.length
              ? Math.max(...years)
              : Number(recifeDateKey(this.clock()).slice(0, 4));
            state.nextSequenceByYear[String(year)] = Number(seq);
          }
          state = this.validate(stateSchema.parse(state));
        } catch {
          throw new Error(
            'Não foi possível migrar os dados antigos. Os originais foram preservados; não foi criada uma base substituta.',
          );
        }
        migrated = true;
        break;
      }
      if (migrated) break;
    }
    this.write(this.validate(state));
    return state;
  }
  private emit(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(UPDATE_EVENT));
  }
  public subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const storageListener = (event: StorageEvent) => {
      if (event.key === STATE_KEY || event.key === null) callback();
    };
    window.addEventListener(UPDATE_EVENT, callback);
    window.addEventListener('storage', storageListener);
    return () => {
      window.removeEventListener(UPDATE_EVENT, callback);
      window.removeEventListener('storage', storageListener);
    };
  }
  public getRequests() {
    return this.read().requests;
  }
  public getRequestById(requestId: string) {
    return this.getRequests().find((r) => r.id === requestId);
  }
  /** Projeção de apresentação. Não representa autorização: a base demonstrativa é local e sem login. */
  public getPublicRequestByProtocol(protocol: string) {
    const request = this.getRequestByProtocol(protocol);
    if (!request) return undefined;
    const publicRequest = copy(request);
    publicRequest.applicantName = maskApplicantName(request.applicantName);
    publicRequest.applicantContact = maskPhone(request.applicantContact);
    // Textos livres podem conter CPFs, nomes, endereços e outros dados não detectáveis por regex.
    // Evitar mostrá-los numa consulta sem autenticação, inclusive no HTML de impressão.
    publicRequest.subject = 'Solicitação educacional em acompanhamento';
    publicRequest.description = 'Descrição detalhada restrita à gestão demonstrativa.';
    publicRequest.locationDetails = undefined;
    publicRequest.categoryDetails =
      request.category === 'infraestrutura' &&
      ['Elétrico', 'Hidráulico', 'Cobertura', 'Mobiliário', 'Acessibilidade', 'Outro'].includes(
        request.categoryDetails?.natureza || '',
      )
        ? { natureza: request.categoryDetails!.natureza }
        : undefined;
    publicRequest.attachmentName = undefined;
    publicRequest.attachmentSize = undefined;
    publicRequest.resolution = request.resolution
      ? 'A providência final foi registrada pela equipe de atendimento.'
      : undefined;
    publicRequest.satisfaction = request.satisfaction
      ? {
          rating: request.satisfaction.rating,
          comment: '',
          createdAt: request.satisfaction.createdAt,
        }
      : undefined;
    publicRequest.informationRequests = request.informationRequests?.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      respondedAt: item.respondedAt,
      prompt: 'A equipe solicitou informações complementares. Não informe dados pessoais reais.',
      response: item.response ? 'Complementação recebida pela equipe.' : undefined,
    }));
    delete publicRequest.priorityReason;
    delete publicRequest.deadlineReason;
    if (!publicRequest.publicResponsible) delete publicRequest.assignedTechnician;
    publicRequest.history = publicRequest.history
      .filter((h) => h.visibility !== 'interna')
      .map(({ changes: _changes, ...event }) => ({
        ...event,
        author: event.role === 'cidadao' ? 'Comunidade escolar' : 'Equipe de atendimento',
        note:
          event.role === 'cidadao'
            ? 'Solicitação registrada no ambiente demonstrativo.'
            : 'Movimentação registrada pela equipe de atendimento (parecer reservado).',
      }));
    return publicRequest;
  }
  public getRequestByProtocol(protocol: string) {
    return this.getRequests().find(
      (r) => r.protocol.trim().toUpperCase() === protocol.trim().toUpperCase(),
    );
  }
  public getSchools() {
    const state = this.read();
    return state.schools.map((s) => ({
      ...s,
      activeRequestsCount: state.requests.filter(
        (r) => r.schoolId === s.id && r.status !== 'concluida',
      ).length,
    }));
  }
  public getDashboardMetrics() {
    return calculateMetrics(this.getRequests(), this.clock().getTime());
  }
  public getSeiLogs() {
    return this.read().seiLogs;
  }
  public getAppointments() {
    return this.read().appointments;
  }
  public createRequest(data: CreateInput, submissionKey?: string): EducationalRequest {
    const state = this.read();
    if (submissionKey && state.submissions[submissionKey]) {
      const saved = state.requests.find((r) => r.id === state.submissions[submissionKey]);
      if (saved) return saved;
    }
    const parsed = requestFormSchema.safeParse(data);
    if (!parsed.success) throw new BusinessRuleError(parsed.error.issues[0].message);
    const school = state.schools.find((s) => s.id === parsed.data.schoolId);
    if (!school) throw new BusinessRuleError('Unidade escolar inexistente.');
    const now = this.clock();
    const year = Number(recifeDateKey(now).slice(0, 4));
    const highest = state.requests.reduce((max, r) => {
      const p = parseHistoricalProtocol(r.protocol, Number(recifeDateKey(r.createdAt).slice(0, 4)));
      return p.valid && p.year === year ? Math.max(max, p.seq ?? 0) : max;
    }, 0);
    const sequence = Math.max(highest + 1, state.nextSequenceByYear[String(year)] ?? 1);
    const protocol = formatProtocolNumber(sequence, year);
    const timestamp = now.toISOString();
    const request = storedRequestSchema.parse({
      ...parsed.data,
      categoryDetails: Object.fromEntries(
        SERVICE_CATALOG[parsed.data.category].fields.map((field) => [
          field.key,
          parsed.data.categoryDetails?.[field.key] || '',
        ]),
      ),
      schoolName: school.name,
      attachmentName: data.attachmentName,
      attachmentSize: data.attachmentSize,
      deadline:
        state.ruleHistory.length > 0
          ? new Date(
              now.getTime() + state.deadlineRules[parsed.data.priority] * 86400000,
            ).toISOString()
          : calculateCategoryDeadline(
              now,
              parsed.data.category,
              parsed.data.categoryDetails,
              this.holidays,
            ),
      deadlineReason:
        state.ruleHistory.length > 0
          ? 'Previsão interna da SEDUC demonstrativa ajustada por configuração administrativa por prioridade, em dias corridos.'
          : 'SLA acadêmico sugerido por categoria, em horas corridas ou dias úteis (calendário configurável de Recife). Não é prazo legal oficial.',
      id: id('req'),
      protocol,
      status: 'recebida',
      createdAt: timestamp,
      updatedAt: timestamp,
      history: [
        {
          id: id('hist'),
          timestamp,
          status: 'recebida',
          author: parsed.data.applicantName,
          role: 'cidadao',
          note: 'Solicitação registrada no Rede Atende (demonstração acadêmica).',
        },
      ],
    });
    state.requests.unshift(request);
    state.nextSequenceByYear[String(year)] = sequence + 1;
    if (submissionKey) state.submissions[submissionKey] = request.id;
    this.notify(state, request, 'gestao', 'Nova solicitação recebida para triagem.');
    this.write(state);
    this.emit();
    return JSON.parse(JSON.stringify(request)) as EducationalRequest;
  }
  private history(
    request: EducationalRequest,
    note: string,
    author: string,
    role: HistoryEvent['role'],
    previousStatus = request.status,
  ) {
    const timestamp = new Date(
      Math.max(this.clock().getTime(), Date.parse(request.updatedAt) + 1),
    ).toISOString();
    request.updatedAt = timestamp;
    request.history.push({
      id: id('hist'),
      timestamp,
      status: request.status,
      previousStatus,
      author,
      role,
      note,
      department: request.assignedDepartment,
    });
  }
  public updateRequest(
    requestId: string,
    updates: Partial<EducationalRequest>,
    note?: string,
    author = 'Equipe de Triagem (Demonstração)',
    authorRole: HistoryEvent['role'] = 'triagem_seduc',
    isReopening = false,
    options: DispatchOptions = {},
  ): EducationalRequest {
    const editable = [
      'status',
      'priority',
      'assignedDepartment',
      'assignedTechnician',
      'deadline',
      'category',
      'categoryDetails',
    ];
    if (Object.keys(updates).some((key) => !editable.includes(key)))
      throw new BusinessRuleError(
        'Campo protegido: protocolo, identificação, SEI e histórico não podem ser alterados por despacho.',
      );
    const state = this.read();
    const request = state.requests.find((r) => r.id === requestId);
    if (!request) throw new BusinessRuleError('Solicitação não encontrada.');
    const previousStatus = request.status;
    if (updates.status && !isValidStatusTransition(previousStatus, updates.status, isReopening))
      throw new BusinessRuleError('Transição de status inválida.');
    const candidate = storedRequestSchema.safeParse({ ...request, ...updates });
    if (!candidate.success)
      throw new BusinessRuleError(
        'Dados de despacho inválidos. Verifique status, prioridade e prazo.',
      );
    const next: EducationalRequest = candidate.data;
    const reclassified = next.category !== request.category;
    if ('categoryDetails' in updates && !reclassified)
      throw new BusinessRuleError(
        'Selecione uma categoria diferente para corrigir a classificação.',
      );
    if (reclassified) {
      if (!['triagem_seduc', 'secretario_educacao'].includes(authorRole))
        throw new BusinessRuleError('Este perfil não pode corrigir a categoria.');
      if (previousStatus === 'concluida')
        throw new BusinessRuleError('Reabra a solicitação antes de corrigir a categoria.');
      if (
        !options.categoryReason?.trim() ||
        options.categoryReason.trim().length < 5 ||
        options.categoryReason.length > 2000
      )
        throw new BusinessRuleError(
          'Informe o motivo da correção de categoria (5 a 2000 caracteres).',
        );
      const classification = categoryClassificationSchema.safeParse({
        category: next.category,
        categoryDetails: updates.categoryDetails,
      });
      if (!classification.success)
        throw new BusinessRuleError(
          classification.error.issues.map((issue) => issue.message).join(' '),
        );
      next.categoryDetails = Object.fromEntries(
        SERVICE_CATALOG[next.category].fields.map((field) => [
          field.key,
          classification.data.categoryDetails[field.key] ?? '',
        ]),
      );
      // Prazo, prioridade e encaminhamento são preservados; ajustes só por despacho explícito.
      this.history(next, options.categoryReason.trim(), author, authorRole, previousStatus);
      const archived = next.history.at(-1)!;
      archived.action = 'category.internal';
      archived.visibility = 'interna';
      archived.changes = {
        category: { before: request.category, after: next.category },
        categoryDetails: {
          before: JSON.stringify(request.categoryDetails ?? {}),
          after: JSON.stringify(next.categoryDetails),
        },
      };
    }
    if (previousStatus === 'concluida' && next.status !== 'concluida') {
      if (!isReopening || !note?.trim() || note.trim().length < 5)
        throw new BusinessRuleError('Informe o motivo da reabertura (pelo menos 5 caracteres).');
      next.resolution = undefined;
    }
    if (updates.priority && updates.priority !== request.priority) {
      const reason =
        options.priorityReason === undefined ? note?.trim() : options.priorityReason.trim();
      if (!reason || reason.length < 5)
        throw new BusinessRuleError('Justifique a alteração de prioridade.');
      next.priorityReason = reason;
    }
    if ('deadline' in updates && updates.deadline !== request.deadline) {
      const reason =
        options.deadlineReason === undefined ? note?.trim() : options.deadlineReason.trim();
      if (!reason || reason.length < 5)
        throw new BusinessRuleError('Informe o motivo da alteração de prazo.');
      if (updates.deadline && Date.parse(updates.deadline) <= this.clock().getTime())
        throw new BusinessRuleError('Defina uma previsão futura.');
      next.deadlineReason = reason;
    }
    if (next.status === 'aguardando_informacoes' && previousStatus !== next.status) {
      if (!note?.trim() || note.trim().length < 5)
        throw new BusinessRuleError('Descreva as informações complementares necessárias.');
      const openInformation = request.informationRequests?.find((i) => !i.respondedAt);
      next.informationRequests = openInformation
        ? (request.informationRequests ?? []).map((i) =>
            i.id === openInformation.id ? { ...i, prompt: note.trim() } : i,
          )
        : [
            ...(request.informationRequests ?? []),
            {
              id: id('info'),
              prompt: note.trim(),
              createdAt: this.clock().toISOString(),
            },
          ];
    }
    if (next.status === 'concluida' && previousStatus !== 'concluida') {
      if (!note?.trim() || note.trim().length < 5)
        throw new BusinessRuleError('Registre a providência final antes de concluir.');
      if (
        state.workOrders.some(
          (w) =>
            w.requestId === requestId &&
            w.required &&
            !['concluida', 'cancelada'].includes(w.status),
        )
      )
        throw new BusinessRuleError('Existem ordens de serviço obrigatórias pendentes.');
      if (
        state.appointments.some(
          (a) => a.requestId === requestId && ['Agendada', 'Confirmada'].includes(a.status),
        )
      )
        throw new BusinessRuleError(
          'Existem atendimentos agendados pendentes. Realize ou cancele com justificativa.',
        );
      if (next.informationRequests?.some((i) => !i.respondedAt))
        throw new BusinessRuleError('Existem informações complementares pendentes.');
      next.resolution = note.trim();
    }
    if (options.publicResponsible !== undefined) next.publicResponsible = options.publicResponsible;
    if (
      ['encaminhada', 'em_atendimento', 'concluida'].includes(next.status) &&
      (!next.assignedDepartment?.trim() || !next.assignedTechnician?.trim())
    )
      throw new BusinessRuleError('Defina setor e responsável antes de encaminhar ou atender.');
    if (!author.trim() || (note?.length ?? 0) > 4000)
      throw new BusinessRuleError('Autor ou observação inválidos.');
    this.history(
      next,
      note?.trim() ||
        (reclassified
          ? `Categoria corrigida de ${CATEGORY_LABELS[request.category]} para ${CATEGORY_LABELS[next.category]}. Prazo e encaminhamento preservados, salvo alteração explícita neste despacho.`
          : 'Despacho demonstrativo: prioridade, responsável, setor ou prazo atualizado.'),
      author,
      authorRole,
      previousStatus,
    );
    const event = next.history.at(-1)!;
    event.visibility =
      next.status !== previousStatus ? 'publica' : (options.visibility ?? 'publica');
    event.action = 'despacho';
    event.changes = Object.fromEntries(
      Object.keys(updates)
        .filter((key) => key !== 'categoryDetails')
        .filter(
          (key) => request[key as keyof typeof request] !== next[key as keyof EducationalRequest],
        )
        .map((key) => [
          key,
          {
            before: String(request[key as keyof typeof request] ?? ''),
            after: String(next[key as keyof EducationalRequest] ?? ''),
          },
        ]),
    );
    if (reclassified) {
      this.history(
        next,
        `Categoria corrigida: ${CATEGORY_LABELS[request.category]} → ${CATEGORY_LABELS[next.category]}.`,
        author,
        authorRole,
      );
      next.history.at(-1)!.action = 'category.public';
      next.history.at(-1)!.visibility = 'publica';
    }

    state.requests[state.requests.findIndex((r) => r.id === requestId)] = next;
    if (event.visibility === 'publica' || reclassified)
      this.notify(
        state,
        next,
        'comunidade',
        next.status !== previousStatus
          ? `Situação atualizada: ${this.statusMessage(next)}.`
          : 'Há uma nova resposta pública no acompanhamento.',
      );
    this.write(state);
    this.emit();
    return next;
  }
  public simulateSeiDispatch(requestId: string): {
    success: boolean;
    seiNumber: string;
  } {
    const state = this.read();
    const request = state.requests.find((r) => r.id === requestId);
    if (!request) throw new BusinessRuleError('Solicitação não encontrada para simulação SEI.');
    const eligibility = isRequestEligibleForSei(request);
    if (!eligibility.eligible) throw new BusinessRuleError(eligibility.reason);
    if (
      state.seiLogs.some(
        (log) => log.protocol === request.protocol && log.action === 'processo_criado',
      )
    )
      throw new BusinessRuleError('Já existe registro SEI simulado para este protocolo.');
    const parsed = parseProtocolNumber(request.protocol);
    const seiNumber = `SIM-SEI-${parsed.valid ? `${parsed.year}-${String(parsed.seq).padStart(6, '0')}` : id('LEGADO')}`;
    request.seiIntegrated = true;
    request.seiProcessNumber = seiNumber;
    this.history(
      request,
      `Processo fictício ${seiNumber}. Nenhum processo real foi criado ou enviado ao SEI.`,
      'Sistema Rede Atende (Simulação)',
      'sistema',
    );
    state.seiLogs.unshift({
      id: id('sei'),
      timestamp: this.clock().toISOString(),
      protocol: request.protocol,
      action: 'processo_criado',
      seiNumber,
      organ: `DEMONSTRAÇÃO / ${request.assignedDepartment || 'Triagem'}`,
      statusText: 'Processo fictício criado localmente.',
    });
    this.notify(
      state,
      request,
      'comunidade',
      'Encaminhamento administrativo simulado registrado. Nenhum processo real foi criado.',
    );
    this.write(state);
    this.emit();
    return { success: true, seiNumber };
  }
  private validateAppointment(
    state: StoredState,
    appointment: Appointment,
    checkFuture: boolean,
  ): Appointment {
    const result = appointmentSchema.safeParse(appointment);
    if (!result.success)
      throw new BusinessRuleError(
        'Dados do agendamento inválidos. Informe tipo, responsável, data e horário.',
      );
    const a = result.data;
    const date = new Date(`${a.date}T${a.time}:00-03:00`);
    if (!Number.isFinite(date.getTime()) || recifeDateKey(date) !== a.date)
      throw new BusinessRuleError('Data de agendamento inválida.');
    if (checkFuture && date.getTime() <= this.clock().getTime())
      throw new BusinessRuleError('Escolha uma data e um horário futuros.');
    const request = a.requestId ? state.requests.find((r) => r.id === a.requestId) : undefined;
    if (a.requestId && !request)
      throw new BusinessRuleError('Não é possível vincular solicitação inexistente.');
    if (request?.status === 'concluida' && !['Realizada', 'Cancelada'].includes(a.status))
      throw new BusinessRuleError('Reabra a solicitação antes de agendar novas atividades.');
    const school = state.schools.find((s) => s.id === (request?.schoolId ?? a.schoolId));
    if (!school) throw new BusinessRuleError('Unidade escolar inexistente.');
    a.schoolId = school.id;
    a.schoolName = school.name;
    a.protocolRef = request?.protocol ?? 'DEMANDA-GERAL';
    if (
      state.appointments.some(
        (other) =>
          other.id !== a.id &&
          !['Cancelada', 'Realizada'].includes(other.status) &&
          Math.abs(
            Date.parse(`${other.date}T${other.time}:00-03:00`) -
              Date.parse(`${a.date}T${a.time}:00-03:00`),
          ) <
            60 * 60 * 1000 &&
          other.technician.trim().toLowerCase() === a.technician.toLowerCase(),
      ) &&
      !['Cancelada', 'Realizada'].includes(a.status)
    )
      throw new BusinessRuleError(
        'Este responsável já possui atendimento no mesmo horário ou em intervalo conflitante de 60 minutos.',
      );
    return a;
  }
  private appointmentHistory(state: StoredState, appointment: Appointment, action: string) {
    if (!appointment.requestId) return;
    const request = state.requests.find((r) => r.id === appointment.requestId);
    if (!request) throw new BusinessRuleError('Solicitação vinculada inexistente.');
    this.history(
      request,
      `Agenda: ${action} — ${appointment.type}, ${appointment.date} às ${appointment.time}, ${appointment.technician}. Situação: ${appointment.status}.${appointment.notes ? ` Observação: ${appointment.notes}` : ''}${appointment.cancellationReason ? ` Motivo do cancelamento: ${appointment.cancellationReason}` : ''}`,
      'Central de Agenda (Demonstração)',
      'triagem_seduc',
    );
    request.history.at(-1)!.action = 'agenda';
    this.notify(
      state,
      request,
      'comunidade',
      `Agenda atualizada: ${appointment.type}, ${appointment.date} às ${appointment.time}. ${appointment.status}.`,
    );
  }
  public createAppointment(data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Appointment {
    const state = this.read();
    const now = this.clock().toISOString();
    if (data.status !== 'Agendada')
      throw new BusinessRuleError('Um novo atendimento deve iniciar como Agendada.');
    const appointment = this.validateAppointment(
      state,
      { ...data, id: id('ag'), createdAt: now, updatedAt: now },
      true,
    );
    this.appointmentHistory(state, appointment, 'agendamento criado');
    state.appointments.unshift(appointment);
    this.write(state);
    this.emit();
    return appointment;
  }
  public updateAppointment(appointmentId: string, updates: Partial<Appointment>): Appointment {
    const state = this.read();
    const index = state.appointments.findIndex((a) => a.id === appointmentId);
    if (index < 0) throw new BusinessRuleError('Agendamento não encontrado.');
    const current = state.appointments[index];
    if (
      current.workOrderId &&
      (('requestId' in updates && updates.requestId !== current.requestId) ||
        ('schoolId' in updates && updates.schoolId !== current.schoolId))
    )
      throw new BusinessRuleError('O vínculo desta vistoria pertence à ordem de serviço.');
    if (['Cancelada', 'Realizada'].includes(current.status))
      throw new BusinessRuleError('Um atendimento encerrado não pode ser modificado.');
    if (
      Object.keys(updates).some(
        (k) =>
          ![
            'requestId',
            'schoolId',
            'type',
            'technician',
            'date',
            'time',
            'status',
            'notes',
            'cancellationReason',
          ].includes(k),
      )
    )
      throw new BusinessRuleError('Campo protegido no agendamento.');
    if ('cancellationReason' in updates && updates.status !== 'Cancelada')
      throw new BusinessRuleError('O motivo de cancelamento exige encerrar o agendamento.');
    if (updates.status === 'Agendada' && current.status === 'Confirmada')
      throw new BusinessRuleError('Transição de agenda inválida.');
    const rescheduled =
      (updates.date !== undefined && updates.date !== current.date) ||
      (updates.time !== undefined && updates.time !== current.time);
    const appointment = this.validateAppointment(
      state,
      { ...current, ...updates, updatedAt: this.clock().toISOString() },
      rescheduled,
    );
    if (
      appointment.status === 'Cancelada' &&
      !appointment.notes?.trim() &&
      !appointment.cancellationReason?.trim()
    )
      throw new BusinessRuleError('Informe o motivo do cancelamento.');
    if (current.requestId && current.requestId !== appointment.requestId)
      this.appointmentHistory(state, current, 'vínculo removido');
    this.appointmentHistory(state, appointment, 'agendamento atualizado');
    state.appointments[index] = appointment;
    this.write(state);
    this.emit();
    return appointment;
  }
  public cancelAppointment(appointmentId: string, reason?: string) {
    if (!reason?.trim() || reason.trim().length < 5)
      throw new BusinessRuleError('Informe o motivo do cancelamento (pelo menos 5 caracteres).');
    return this.updateAppointment(appointmentId, {
      status: 'Cancelada',
      cancellationReason: reason.trim(),
    });
  }
  private statusMessage(request: EducationalRequest) {
    return STATUS_CONFIG[request.status].label;
  }
  private notify(
    state: StoredState,
    request: EducationalRequest,
    audience: 'comunidade' | 'gestao',
    message: string,
  ) {
    state.notifications.unshift({
      id: id('not'),
      requestId: request.id,
      audience,
      message,
      createdAt: this.clock().toISOString(),
    });
  }
  public getNotifications(audience: 'comunidade' | 'gestao', requestId?: string) {
    return this.read().notifications.filter(
      (n) => n.audience === audience && (!requestId || n.requestId === requestId),
    );
  }
  public markNotificationRead(notificationId: string) {
    const state = this.read();
    const notification = state.notifications.find((n) => n.id === notificationId);
    if (!notification) throw new BusinessRuleError('Notificação inexistente.');
    notification.readAt = this.clock().toISOString();
    this.write(state);
    this.emit();
  }
  public replyToInformation(requestId: string, informationId: string, response: string) {
    const state = this.read();
    const request = state.requests.find((r) => r.id === requestId);
    if (!request || request.status !== 'aguardando_informacoes')
      throw new BusinessRuleError('Esta solicitação não está aguardando informações.');
    const information = request.informationRequests?.find((i) => i.id === informationId);
    if (!information || information.respondedAt)
      throw new BusinessRuleError('Pedido de informação inexistente ou já respondido.');
    const clean = response.trim();
    if (clean.length < 5 || clean.length > 2000)
      throw new BusinessRuleError('A resposta deve ter entre 5 e 2000 caracteres.');
    information.response = clean;
    information.respondedAt = this.clock().toISOString();
    const previous = request.status;
    request.status = 'em_triagem';
    this.history(
      request,
      `Informações complementares enviadas: ${clean}`,
      request.applicantName,
      'cidadao',
      previous,
    );
    this.notify(
      state,
      request,
      'gestao',
      'O cidadão enviou informações complementares. Retome a triagem.',
    );
    this.notify(
      state,
      request,
      'comunidade',
      'Resposta recebida. A solicitação retornou à triagem.',
    );
    this.write(state);
    this.emit();
    return request;
  }
  public rateRequest(requestId: string, rating: number, comment = '') {
    const state = this.read();
    const request = state.requests.find((r) => r.id === requestId);
    if (!request || request.status !== 'concluida')
      throw new BusinessRuleError('A avaliação fica disponível após a conclusão.');
    if (request.satisfaction) throw new BusinessRuleError('Esta solicitação já foi avaliada.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 1000)
      throw new BusinessRuleError('Avaliação inválida. Escolha de 1 a 5.');
    request.satisfaction = {
      rating,
      comment: comment.trim(),
      createdAt: this.clock().toISOString(),
    };
    this.history(request, 'Avaliação de satisfação registrada.', 'Comunidade escolar', 'cidadao');
    this.notify(state, request, 'gestao', 'Há uma nova avaliação de satisfação.');
    this.write(state);
    this.emit();
  }
  public getDeadlineRules() {
    return this.read().deadlineRules;
  }
  public getRuleHistory() {
    return this.read().ruleHistory;
  }
  public configureDeadlineRules(rules: Record<RequestPriority, number>, reason: string) {
    const parsed = deadlineRulesSchema.safeParse(rules);
    if (!parsed.success || reason.trim().length < 5 || reason.length > 2000)
      throw new BusinessRuleError('Informe dias inteiros de 1 a 90 e justifique a configuração.');
    if (!(rules.urgente <= rules.alta && rules.alta <= rules.media && rules.media <= rules.baixa))
      throw new BusinessRuleError('Prazos devem respeitar a ordem das prioridades.');
    const state = this.read();
    state.ruleHistory.unshift({
      timestamp: this.clock().toISOString(),
      reason: reason.trim(),
      before: state.deadlineRules,
      after: parsed.data,
    });
    state.deadlineRules = parsed.data;
    this.write(state);
    this.emit();
  }
  public getWorkOrders(requestId?: string): WorkOrder[] {
    return this.read().workOrders.filter((w) => !requestId || w.requestId === requestId);
  }
  public createWorkOrder(data: {
    requestId: string;
    title: string;
    department: string;
    technician: string;
    required: boolean;
    inspectionDate?: string;
    inspectionTime?: string;
  }): WorkOrder {
    const state = this.read();
    const request = state.requests.find((r) => r.id === data.requestId);
    if (!request || !['em_triagem', 'encaminhada', 'em_atendimento'].includes(request.status))
      throw new BusinessRuleError(
        'A ordem requer solicitação em triagem, encaminhada ou em atendimento.',
      );
    const now = this.clock().toISOString();
    const nextNumber =
      this.nextOrderNumber ??
      Math.max(0, ...state.workOrders.map((w) => Number(w.number.split('-').at(-1)) || 0)) + 1;
    const order = workOrderSchema.parse({
      ...data,
      id: id('os'),
      number: `OS-DEMO-${String(nextNumber).padStart(6, '0')}`,
      status: 'aberta',
      createdAt: now,
      updatedAt: now,
      history: [
        {
          id: id('osh'),
          timestamp: now,
          status: 'aberta',
          note: 'Ordem de serviço criada.',
        },
      ],
    });
    if (data.inspectionDate || data.inspectionTime) {
      const appointment = this.validateAppointment(
        state,
        {
          id: id('ag'),
          requestId: request.id,
          protocolRef: request.protocol,
          schoolId: request.schoolId,
          schoolName: request.schoolName,
          type: `Vistoria: ${order.title}`,
          technician: order.technician,
          date: data.inspectionDate || '',
          time: data.inspectionTime || '',
          status: 'Agendada',
          createdAt: now,
          updatedAt: now,
          workOrderId: order.id,
        },
        true,
      );
      order.appointmentId = appointment.id;
      state.appointments.unshift(appointment);
      this.appointmentHistory(state, appointment, 'vistoria da ordem criada');
    }
    state.workOrders.unshift(order);
    this.history(
      request,
      `Ordem ${order.number} criada: ${order.title}. Setor: ${order.department}.`,
      'Equipe de Execução (Demonstração)',
      'gestor_escolar',
    );
    Object.assign(request.history.at(-1)!, {
      visibility: 'interna',
      action: 'work_order.internal',
      source: { kind: 'work_order', id: order.id, status: order.status },
    });
    this.history(
      request,
      `Ordem de serviço ${order.number} aberta para executar a atividade.`,
      'Equipe de atendimento',
      'gestor_escolar',
    );
    Object.assign(request.history.at(-1)!, {
      visibility: 'publica',
      action: 'work_order.public',
      source: { kind: 'work_order', id: order.id, status: order.status },
    });
    this.notify(
      state,
      request,
      'comunidade',
      `Ordem de serviço ${order.number} aberta para executar a atividade.`,
    );
    this.write(state);
    this.emit();
    return order;
  }
  public updateWorkOrder(orderId: string, status: WorkOrderStatus, note: string): WorkOrder {
    const state = this.read();
    const order = state.workOrders.find((w) => w.id === orderId);
    if (!order || !WORK_ORDER_TRANSITIONS[order.status].includes(status))
      throw new BusinessRuleError('Transição de ordem de serviço inválida.');
    const clean = note.trim();
    if (clean.length < 5 || clean.length > 4000)
      throw new BusinessRuleError(
        'Descreva o serviço ou justifique a pendência/cancelamento (5 a 4000 caracteres).',
      );
    const request = state.requests.find((r) => r.id === order.requestId)!;
    if (request.status === 'concluida')
      throw new BusinessRuleError('Reabra a solicitação antes de atualizar a ordem.');
    const appointment = order.appointmentId
      ? state.appointments.find((a) => a.id === order.appointmentId)
      : undefined;
    if (
      status === 'concluida' &&
      appointment &&
      ['Agendada', 'Confirmada'].includes(appointment.status)
    )
      throw new BusinessRuleError(
        'Registre a vistoria como realizada ou cancele com justificativa na agenda.',
      );
    if (status === 'concluida') order.performedService = clean;
    if (status === 'pendente') order.pendingReason = clean;
    if (status === 'cancelada') {
      order.cancellationReason = clean;
      if (appointment && ['Agendada', 'Confirmada'].includes(appointment.status)) {
        appointment.status = 'Cancelada';
        appointment.cancellationReason = clean;
        appointment.updatedAt = this.clock().toISOString();
        this.appointmentHistory(state, appointment, 'cancelamento pela ordem de serviço');
      }
    }
    order.status = status;
    order.updatedAt = this.clock().toISOString();
    order.history.push({
      id: id('osh'),
      timestamp: order.updatedAt,
      status,
      note: clean,
    });
    this.history(
      request,
      `${order.number} — ${WORK_ORDER_LABELS[status]}: ${clean}`,
      'Equipe de Execução (Demonstração)',
      'gestor_escolar',
    );
    Object.assign(request.history.at(-1)!, {
      visibility: 'interna',
      action: 'work_order.internal',
      source: { kind: 'work_order', id: order.id, status },
    });
    this.history(
      request,
      `${order.number}: ${WORK_ORDER_LABELS[status]}.`,
      'Equipe de atendimento',
      'gestor_escolar',
    );
    Object.assign(request.history.at(-1)!, {
      visibility: 'publica',
      action: 'work_order.public',
      source: { kind: 'work_order', id: order.id, status },
    });
    this.notify(state, request, 'comunidade', `${order.number}: ${WORK_ORDER_LABELS[status]}.`);
    this.write(state);
    this.emit();
    return order;
  }
  /** Cenários aditivos; validam todas as operações antes de gravar o conjunto. */
  public loadDemoScenario(kind: 'transporte' | 'merenda'): string {
    let raw = JSON.stringify(this.read());
    const stagedStorage: Storage = {
      length: 1,
      clear() {},
      removeItem() {},
      key() {
        return STATE_KEY;
      },
      getItem() {
        return raw;
      },
      setItem(_key, value) {
        raw = value;
      },
    };
    const staged = new StorageService(stagedStorage, this.clock, this.holidays);
    const protocol = staged.appendDemoScenario(kind);
    this.write(staged.read());
    this.emit();
    return protocol;
  }
  private appendDemoScenario(kind: 'transporte' | 'merenda'): string {
    const isTransport = kind === 'transporte';
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(
      this.clock(),
    );
    const request = this.createRequest({
      category: isTransport ? 'transporte_escolar' : 'alimentacao_merenda',
      schoolId: isTransport ? 'esc-002' : 'esc-003',
      schoolName: 'Preenchido pelo catálogo',
      subject: isTransport
        ? 'Rota escolar interrompida (cenário fictício)'
        : 'Reposição emergencial de merenda (cenário fictício)',
      description: isTransport
        ? 'Cenário acadêmico: estudantes ficaram desatendidos após falha de transporte em trecho fictício denominado Serra de Santana; dados não são ocorrências reais.'
        : 'Cenário acadêmico: a equipe identificou necessidade simulada de reposição de alimentos para evitar interrupção do serviço.',
      locationDetails: isTransport
        ? 'Trecho fictício Serra de Santana, associado ao Jirau apenas para simulação'
        : 'Cozinha escolar, Distrito de Negras (simulação)',
      applicantName: 'Solicitante Fictício',
      applicantContact: '',
      applicantRole: 'comunidade',
      priority: 'urgente',
      privacyAcknowledged: true,
      categoryDetails: isTransport
        ? { rota: 'Trecho fictício Serra de Santana', turno: 'Manhã' }
        : { natureza: 'Disponibilidade', turno: 'Manhã', data: today },
    });
    this.updateRequest(
      request.id,
      { status: 'em_triagem' },
      'Parecer técnico fictício: cenário classificado como prioridade elevada para demonstração.',
      'Equipe de Triagem (Demonstração)',
    );
    if (isTransport) {
      this.updateRequest(
        request.id,
        {
          status: 'encaminhada',
          assignedDepartment: 'Coordenação de Transporte Escolar e Frotas',
          assignedTechnician: 'Equipe de Transporte (Demonstração)',
        },
        'Parecer técnico fictício: verificar a disponibilidade da rota e garantir transporte escolar.',
        'Equipe de Triagem (Demonstração)',
      );
    }
    return request.protocol;
  }
  public resetToDefaults(): void {
    this.write(demoState());
    this.emit();
  }
}
