/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Badges Acessíveis com Ícones e Cores
 */

import React from 'react';
import { RequestPriority, RequestStatus } from '../../types';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../../utils/helpers';
import { Inbox, Search, Send, Wrench, CheckCircle2, HelpCircle, AlertCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: RequestStatus;
  size?: 'sm' | 'md';
}

const STATUS_ICONS: Record<RequestStatus, React.ComponentType<{ className?: string }>> = {
  recebida: Inbox,
  em_triagem: Search,
  encaminhada: Send,
  em_atendimento: Wrench,
  concluida: CheckCircle2,
  aguardando_informacoes: HelpCircle,
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.recebida;
  const Icon = STATUS_ICONS[status] || AlertCircle;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.bgClass} ${config.colorClass} ${config.borderClass} ${sizeClasses} transition-colors`}
      role="status"
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};

interface PriorityBadgeProps {
  priority: RequestPriority;
  size?: 'sm' | 'md';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'md' }) => {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.baixa;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border ${config.bgClass} ${config.colorClass} ${config.borderClass} ${sizeClasses}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
