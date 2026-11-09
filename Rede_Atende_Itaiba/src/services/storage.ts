/** Cliente tipado da API. Cache somente em memória e somente da projeção autorizada. */
import type { StorageService as RequestEngine } from '../domain/RequestEngine';
import type { StoredState } from '../domain/schemas';
import type {
  EducationalRequest,
  RequestPage,
  RequestPriority,
  SchoolUnit,
  DashboardMetrics,
  InternalNotification,
} from '../types';
import { DEFAULT_DEADLINE_RULES } from '../domain/serviceCatalog';
import type { managementReport } from '../domain/reporting';
import { calculateMetrics } from '../utils/helpers';
export type AppRole = 'cidadao' | 'operador' | 'gestor' | 'auditor';
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
}
export interface Attachment {
  id: string;
  requestId: string;
  name: string;
  mime: string;
  size: number;
}
const empty = (): StoredState & { attachments: Attachment[]; holidays: string[] } => ({
  schemaVersion: 4,
  catalogRevision: 1,
  requests: [],
  schools: [],
  appointments: [],
  workOrders: [],
  seiLogs: [],
  notifications: [],
  deadlineRules: DEFAULT_DEADLINE_RULES,
  ruleHistory: [],
  nextSequenceByYear: {},
  submissions: {},
  attachments: [],
  holidays: [],
});
export class ApiService {
  constructor(private timeoutMs = 20000) {}
  private generation = 0;
  private refreshSequence = 0;
  private loadedWorkspace = '';
  private state: ReturnType<typeof empty> & {
    metrics?: DashboardMetrics;
    report?: ReturnType<typeof managementReport>;
    operational?: {
      ordersOpen: number;
      ordersCompleted: number;
      ratings: number;
      satisfaction: number | null;
    };
    lists?: Record<string, { page: number; pages: number; total: number; pageSize: number }>;
    unread?: number;
    integratedRequests?: EducationalRequest[];
    integrationTotals?: { eligible: number; integrated: number; logs: number };
  } = empty();
  private operationKeys = new Map<string, string>();
  private csrf = '';
  private callbacks = new Set<() => void>();
  private inflight = new Map<string, Promise<unknown>>();
  private uploadKeys = new WeakMap<File, string>();
  user: AppUser | null = null;
  connectionError = '';
  private emit() {
    for (const callback of this.callbacks) callback();
  }
  subscribe(callback: () => void) {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const generation = this.generation;
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort();
    if (options.signal?.aborted) forwardAbort();
    else options.signal?.addEventListener('abort', forwardAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await fetch(`/api/v1${path}`, {
        ...options,
        signal: controller.signal,
        credentials: 'same-origin',
        headers: {
          ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          'X-Requested-With': 'RedeAtende',
          ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
          ...options.headers,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Falha no atendimento.' }));
        if (response.status === 401 && generation === this.generation) {
          this.generation++;
          this.user = null;
          this.csrf = '';
          this.operationKeys.clear();
          this.state = empty();
          this.emit();
        }
        throw new Error(body.error ?? 'Não foi possível concluir a operação.');
      }
      this.connectionError = '';
      return (await response.json()) as T;
    } catch (error) {
      if (timedOut) {
        this.connectionError =
          'Tempo de resposta esgotado. Não foi possível confirmar a operação. Consulte o acompanhamento ou tente novamente sem alterar os dados.';
        this.emit();
        throw new Error(this.connectionError);
      }
      if (error instanceof TypeError) {
        this.connectionError =
          'Sem conexão com o servidor. Envios não são confirmados offline. Reconecte para continuar.';
        this.emit();
        throw new Error(this.connectionError);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', forwardAbort);
    }
  }
  async init(signal?: AbortSignal) {
    await this.refreshAuth();
    await this.refresh(signal);
  }
  async refreshAuth() {
    const generation = this.generation;
    const s = await this.request<{ user: AppUser | null; csrf: string }>('/auth/me');
    if (generation !== this.generation) return;
    if (s.user?.id !== this.user?.id) {
      this.generation++;
      this.operationKeys.clear();
      this.state = empty();
    }
    this.user = s.user;
    this.csrf = s.csrf;
  }
  workspaceReady() {
    return this.loadedWorkspace === this.workspacePath();
  }
  workspacePath() {
    if (typeof window === 'undefined' || !this.user) return '/bootstrap';
    const route = window.location.pathname,
      params = new URLSearchParams(window.location.search),
      views: Record<string, string> = {
        '/admin': 'dashboard',
        '/admin/demandas': 'demands',
        '/admin/triagem': 'triage',
        '/admin/ordens': 'orders',
        '/admin/agenda': 'agenda',
        '/admin/prazos': 'deadlines',
        '/admin/relatorios': 'reports',
        '/admin/integracoes': 'integrations',
        '/admin/unidades': 'schools',
        '/acompanhar': 'track',
      };
    if (this.user.role === 'cidadao' && route.startsWith('/admin')) return '/bootstrap';
    if (route === '/admin/demandas') return '/bootstrap?view=demands';
    const query = new URLSearchParams({
      view: views[route] ?? 'home',
      page: params.get('pagina') ?? '1',
    });
    if (params.get('demandaId')) query.set('requestId', params.get('demandaId')!);
    if (params.get('protocolo')) query.set('protocol', params.get('protocolo')!);
    if (params.get('busca')) query.set('search', params.get('busca')!);
    if (params.get('situacao')) query.set('status', params.get('situacao')!);
    if (route === '/admin/integracoes')
      for (const [source, target] of [
        ['pendentesPagina', 'eligiblePage'],
        ['integradosPagina', 'integratedPage'],
        ['historicoPagina', 'logPage'],
      ])
        query.set(target, params.get(source) ?? '1');
    return '/bootstrap?' + query;
  }
  async refresh(signal?: AbortSignal) {
    const generation = this.generation,
      sequence = ++this.refreshSequence,
      path = this.workspacePath();
    const state = await this.request<typeof this.state>(path, { signal });
    if (
      generation !== this.generation ||
      sequence !== this.refreshSequence ||
      path !== this.workspacePath()
    )
      return;
    this.state = state;
    this.loadedWorkspace = path;
    this.emit();
  }

  async login(email: string, password: string) {
    this.generation++;
    const s = await this.request<{ user: AppUser; csrf: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.generation++;
    this.state = empty();
    this.user = s.user;
    this.csrf = s.csrf;
    await this.refresh();
  }
  async register(name: string, email: string, password: string) {
    this.generation++;
    const s = await this.request<{ user: AppUser; csrf: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, academicAcknowledged: true }),
    });
    this.generation++;
    this.state = empty();
    this.user = s.user;
    this.csrf = s.csrf;
    await this.refresh();
  }
  async logout() {
    this.generation++;
    await this.request('/auth/logout', { method: 'POST', body: '{}' });
    this.generation++;
    this.user = null;
    this.csrf = '';
    this.operationKeys.clear();
    this.state = empty();
    this.emit();
    await this.refresh();
  }
  private async refreshConfirmedChange() {
    try {
      await this.refresh();
    } catch {
      this.connectionError =
        'A operação foi confirmada pelo servidor, mas a tela ainda não foi atualizada. Reconecte ou recarregue para consultar os dados atuais.';
      this.emit();
    }
  }
  private async change<T>(
    path: string,
    method: string,
    data: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const key = this.generation + ':' + path + JSON.stringify(data);
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const work = (async () => {
      const result = await this.request<T>(path, { method, body: JSON.stringify(data), headers });
      this.refreshSequence++;
      await this.refreshConfirmedChange();
      return result;
    })();
    this.inflight.set(key, work);
    try {
      return await work;
    } finally {
      this.inflight.delete(key);
    }
  }
  getRequests() {
    return this.state.requests;
  }
  async searchRequests(filters: Record<string, string | number | undefined>, signal?: AbortSignal) {
    const generation = this.generation,
      query = new URLSearchParams({ view: 'summary' });
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined && value !== '') query.set(key, String(value));
    const page = await this.request<RequestPage>('/requests/search?' + query, { signal });
    if (generation === this.generation) {
      const items = new Map(this.state.requests.map((r) => [r.id, r]));
      for (const item of page.items) {
        const prior = items.get(item.id);
        if (!prior || item.updatedAt >= prior.updatedAt) items.set(item.id, item);
      }
      this.state.requests = [...items.values()].slice(-100);
    }
    return page;
  }
  getRequestById(id: string) {
    return this.state.requests.find((r) => r.id === id);
  }
  getRequestByProtocol(protocol: string) {
    return this.state.requests.find(
      (r) => r.protocol.toUpperCase() === protocol.trim().toUpperCase(),
    );
  }
  getPublicRequestByProtocol(protocol: string) {
    return this.getRequestByProtocol(protocol);
  }
  getSchools() {
    return this.state.schools;
  }
  getAppointments() {
    return this.state.appointments;
  }
  getWorkOrders(requestId?: string) {
    return this.state.workOrders.filter((w) => !requestId || w.requestId === requestId);
  }
  getIntegratedRequests() {
    return this.state.integratedRequests ?? [];
  }
  getIntegrationTotals() {
    return this.state.integrationTotals ?? { eligible: 0, integrated: 0, logs: 0 };
  }
  getSeiLogs() {
    return this.state.seiLogs;
  }
  getDeadlineRules() {
    return this.state.deadlineRules;
  }
  getRuleHistory() {
    return this.state.ruleHistory;
  }
  getDashboardMetrics() {
    return this.state.metrics ?? calculateMetrics(this.state.requests);
  }
  getManagementReport() {
    return this.state.report;
  }
  getOperationalMetrics() {
    return (
      this.state.operational ?? {
        ordersOpen: 0,
        ordersCompleted: 0,
        ratings: 0,
        satisfaction: null,
      }
    );
  }
  getPage(collection = 'requests') {
    return this.state.lists?.[collection] ?? { page: 1, pages: 1, total: 0, pageSize: 20 };
  }
  getUnreadCount() {
    return this.state.unread ?? this.state.notifications.filter((n) => !n.readAt).length;
  }
  getHolidays() {
    return this.state.holidays;
  }
  getNotifications(audience: 'comunidade' | 'gestao', requestId?: string): InternalNotification[] {
    return this.state.notifications.filter(
      (n) => n.audience === audience && (!requestId || n.requestId === requestId),
    );
  }
  getAttachments(requestId: string) {
    return this.state.attachments.filter((a) => a.requestId === requestId);
  }
  createRequest(data: Parameters<RequestEngine['createRequest']>[0], key: string) {
    return this.change<EducationalRequest>('/requests', 'POST', data, { 'Idempotency-Key': key });
  }
  updateRequest(
    id: string,
    updates: Parameters<RequestEngine['updateRequest']>[1],
    note?: string,
    _author?: string,
    _role?: string,
    isReopening = false,
    options: Parameters<RequestEngine['updateRequest']>[6] = {},
    expectedUpdatedAt?: string,
  ) {
    return this.change<EducationalRequest>(`/requests/${id}`, 'PATCH', {
      updates,
      note,
      isReopening,
      options,
      expectedUpdatedAt: expectedUpdatedAt ?? this.getRequestById(id)?.updatedAt,
    });
  }
  simulateSeiDispatch(id: string) {
    return this.change<{ success: boolean; seiNumber: string }>(
      `/requests/${id}/sei-simulation`,
      'POST',
      {},
    );
  }
  createAppointment(data: Parameters<RequestEngine['createAppointment']>[0]) {
    return this.createOperation<ReturnType<RequestEngine['createAppointment']>>(
      '/appointments',
      data,
    );
  }
  updateAppointment(id: string, data: Parameters<RequestEngine['updateAppointment']>[1]) {
    const body = {
      ...data,
      ...(Object.hasOwn(data, 'requestId') && data.requestId === undefined
        ? { requestId: null }
        : {}),
      ...(Object.hasOwn(data, 'notes') && data.notes === undefined ? { notes: null } : {}),
    };
    return this.change<ReturnType<RequestEngine['updateAppointment']>>(
      `/appointments/${id}`,
      'PATCH',
      body,
    );
  }
  cancelAppointment(id: string, reason: string) {
    return this.change<ReturnType<RequestEngine['cancelAppointment']>>(
      `/appointments/${id}`,
      'PATCH',
      { cancellationReason: reason },
    );
  }
  private async createOperation<T>(path: string, data: unknown) {
    const intent = this.generation + ':' + path + JSON.stringify(data);
    let key = this.operationKeys.get(intent);
    if (!key) {
      key =
        globalThis.crypto?.randomUUID?.() ??
        `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.operationKeys.set(intent, key);
    }
    const result = await this.change<T>(path, 'POST', data, { 'Idempotency-Key': key });
    this.operationKeys.delete(intent);
    return result;
  }
  createWorkOrder(data: Parameters<RequestEngine['createWorkOrder']>[0]) {
    return this.createOperation<ReturnType<RequestEngine['createWorkOrder']>>('/work-orders', data);
  }
  updateWorkOrder(...[id, status, note]: Parameters<RequestEngine['updateWorkOrder']>) {
    return this.change<ReturnType<RequestEngine['updateWorkOrder']>>(
      `/work-orders/${id}`,
      'PATCH',
      { status, note },
    );
  }
  replyToInformation(id: string, informationId: string, response: string) {
    return this.change<EducationalRequest>(`/requests/${id}/replies`, 'POST', {
      informationId,
      response,
    });
  }
  rateRequest(id: string, rating: number, comment = '') {
    return this.change(`/requests/${id}/rating`, 'POST', { rating, comment });
  }
  markNotificationRead(id: string) {
    return this.change(`/notifications/${id}/read`, 'POST', {});
  }
  configureDeadlineRules(rules: Record<RequestPriority, number>, reason: string) {
    return this.change('/deadline-rules', 'PUT', { rules, reason });
  }
  configureHolidays(dates: string[], reason: string) {
    return this.change('/holidays', 'PUT', { dates, reason });
  }
  async loadDemoScenario(kind: 'merenda' | 'transporte') {
    return (await this.change<{ protocol: string }>('/admin/scenarios', 'POST', { kind })).protocol;
  }
  async uploadAttachment(id: string, file: File) {
    let key = this.uploadKeys.get(file);
    if (!key) {
      key =
        globalThis.crypto?.randomUUID?.() ??
        `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.uploadKeys.set(file, key);
    }
    const data = new FormData();
    data.append('file', file);
    const result = await this.request<Attachment>(`/requests/${id}/attachments`, {
      method: 'POST',
      body: data,
      headers: { 'Idempotency-Key': key },
    });
    await this.refreshConfirmedChange();
    return result;
  }
  async updateSchool(school: SchoolUnit) {
    const { id, activeRequestsCount: _, ...data } = school;
    return this.change<SchoolUnit>(`/schools/${id}`, 'PATCH', data);
  }
  async importLegacy(data: unknown) {
    return this.change<{ imported: number }>('/admin/import', 'POST', data);
  }
  async exportCsv() {
    const response = await fetch('/api/v1/reports.csv', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível exportar o relatório.');
    return response.text();
  }
}
export const storageService = new ApiService();
