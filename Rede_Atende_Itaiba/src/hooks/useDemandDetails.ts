import { useCallback, useEffect, useRef, useState } from 'react';
import type { EducationalRequest } from '../types';
import { storageService } from '../services/storage';
/** Apenas a escolha mais recente pode abrir o detalhe. A leitura anterior é cancelada. */
export function useDemandDetails(onError: (message: string) => void) {
  const pending = useRef<AbortController | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<EducationalRequest | null>(null);
  const [loadingId, setLoadingId] = useState('');
  useEffect(() => () => pending.current?.abort(), []);
  const openDetails = useCallback(
    async (request: EducationalRequest, trigger: HTMLElement) => {
      trigger.focus();
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setLoadingId(request.id);
      onError('');
      try {
        const detail = await storageService.request<EducationalRequest>('/requests/' + request.id, {
          signal: controller.signal,
        });
        if (pending.current === controller && !controller.signal.aborted)
          setSelectedRequest(detail);
      } catch (error) {
        if (pending.current === controller && !controller.signal.aborted)
          onError((error as Error).message);
      } finally {
        if (pending.current === controller) setLoadingId('');
      }
    },
    [onError],
  );
  const closeDetails = () => {
    pending.current?.abort();
    setSelectedRequest(null);
  };
  return { selectedRequest, loadingId, openDetails, closeDetails };
}
