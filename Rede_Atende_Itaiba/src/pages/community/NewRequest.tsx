/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Registro de Nova Solicitação
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PlusCircle, MapPin, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { storageService } from '../../services/storage';
import { RequestCategory, SchoolUnit, EducationalRequest } from '../../types';
import { CATEGORY_LABELS, formatBrazilianPhone } from '../../utils/helpers';
import { INITIAL_CITIZEN_PRIORITY, SERVICE_CATALOG } from '../../domain/serviceCatalog';
import { requestFormSchema, categories as CATEGORIES } from '../../domain/schemas';

import { useSafeAction, useUnsavedChanges } from '../../components/common/NavigationGuard';

import { RequestReceipt } from '../../components/community/RequestReceipt';
import { RequestAttachment } from '../../components/community/RequestAttachment';

type RequestFormData = z.infer<typeof requestFormSchema>;

export const NewRequest: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [schools, setSchools] = useState<SchoolUnit[]>(() => storageService.getSchools());
  useEffect(() => storageService.subscribe(() => setSchools(storageService.getSchools())), []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [createdRequest, setCreatedRequest] = useState<EducationalRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const submissionLock = useRef(false);
  const submissionKey = useRef(`form-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const runWhenSafe = useSafeAction();

  const queryCategory = searchParams.get('categoria') as RequestCategory;
  const initialCategory = CATEGORIES.includes(queryCategory) ? queryCategory : 'infraestrutura';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
    reset,
  } = useForm<z.input<typeof requestFormSchema>, unknown, RequestFormData>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      category: initialCategory,
      schoolId: '',
      categoryDetails: {},
      subject: '',
      description: '',
      locationDetails: '',
      applicantName: storageService.user?.name || 'Solicitante de demonstração',
      applicantContact: '',
      applicantRole: 'aluno',
      priority: INITIAL_CITIZEN_PRIORITY,
      privacyAcknowledged: false,
    },
  });

  useUnsavedChanges(
    Boolean(isSubmitting || pendingUpload || (!createdRequest && (isDirty || selectedFile))),
  );

  const category = watch('category');
  const categoryConfig = SERVICE_CATALOG[category];
  useEffect(() => {
    setValue('category', initialCategory);
  }, [initialCategory, setValue]);
  const selectAttachment = (file: File) => {
    setAttachmentError('');
    const validType = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type);
    if (
      !file.size ||
      file.size > 5 * 1024 * 1024 ||
      !validType ||
      !/\.(jpe?g|png|pdf)$/i.test(file.name)
    ) {
      setAttachmentError('Permitidos somente JPG, PNG ou PDF de até 5 MB e não vazios.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const onSubmit = async (data: RequestFormData) => {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const school = schools.find((s) => s.id === data.schoolId);
      if (!school) throw new Error('Selecione uma unidade escolar válida.');
      const schoolName = school.name;

      const newReq = await storageService.createRequest(
        {
          category: data.category,
          categoryDetails: Object.fromEntries(
            categoryConfig.fields.map((field) => [
              field.key,
              data.categoryDetails?.[field.key] || '',
            ]),
          ),
          schoolId: data.schoolId,
          schoolName,
          subject: data.subject,
          description: data.description,
          locationDetails: data.locationDetails,
          applicantName: data.applicantName,
          applicantContact: data.applicantContact,
          applicantRole: data.applicantRole,
          priority: INITIAL_CITIZEN_PRIORITY,
          privacyAcknowledged: data.privacyAcknowledged,
        },
        submissionKey.current,
      );

      if (selectedFile) {
        try {
          await storageService.uploadAttachment(newReq.id, selectedFile);
        } catch (error) {
          setPendingUpload(selectedFile);
          setUploadError(
            'Solicitação gravada, mas o anexo ainda não foi enviado: ' + (error as Error).message,
          );
        }
      }
      reset({
        category: data.category,
        schoolId: '',
        categoryDetails: {},
        subject: '',
        description: '',
        locationDetails: '',
        applicantName: storageService.user?.name || 'Solicitante de demonstração',
        applicantContact: '',
        applicantRole: 'aluno',
        priority: INITIAL_CITIZEN_PRIORITY,
        privacyAcknowledged: false,
      });
      setSelectedFile(null);
      setCreatedRequest(newReq);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível salvar a solicitação.');
    } finally {
      setIsSubmitting(false);
      submissionLock.current = false;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Cabeçalho do Formulário */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider">
          <PlusCircle className="w-4 h-4" />
          <span>Atendimento ao Cidadão de Itaíba — Rede Atende</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">
          Registrar Nova Solicitação Educacional
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Preencha os dados abaixo com clareza. O pedido ficará registrado somente nesta
          demonstração acadêmica, para triagem fictícia. Não haverá envio à Prefeitura.
        </p>
      </div>

      {/* Modal / Card de Confirmação com Protocolo Gerado */}
      {createdRequest ? (
        <RequestReceipt
          createdRequest={createdRequest}
          uploadError={uploadError}
          onAnother={() => {
            void runWhenSafe(async () => {
              submissionKey.current = `form-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              setCreatedRequest(null);
              setUploadError('');
              setPendingUpload(null);
            });
          }}
          onRetryUpload={async () => {
            if (!pendingUpload) return;
            const retryKey = submissionKey.current;
            try {
              await storageService.uploadAttachment(createdRequest.id, pendingUpload);
              if (submissionKey.current !== retryKey) return;
              setPendingUpload(null);
              setUploadError('');
            } catch (error) {
              if (submissionKey.current !== retryKey) return;
              setUploadError('Anexo pendente: ' + (error as Error).message);
            }
          }}
        />
      ) : (
        /* Formulário de Cadastro */
        <form
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          aria-busy={isSubmitting}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6"
        >
          <fieldset disabled={isSubmitting} className="space-y-6" aria-label="Dados da solicitação">
            <p className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-xl p-3">
              Use dados fictícios, sem documentos pessoais ou dados de saúde. A pré-visualização é
              temporária; o arquivo enviado ficará privado no servidor. O preenchimento não é salvo
              antes do envio; evite atualizar ou fechar a aba.
            </p>
            {submitError && (
              <p
                role="alert"
                className="p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-300 text-sm"
              >
                {submitError}
              </p>
            )}
            {/* Categoria e Escola */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="category"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5"
                >
                  Categoria da Demanda *
                </label>
                <select
                  id="category"
                  {...register('category')}
                  aria-invalid={!!errors.category}
                  aria-describedby={errors.category ? 'category-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm focus:outline-hidden focus:ring-3 ${
                    errors.category
                      ? 'border-rose-300 focus:ring-rose-100'
                      : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                  }`}
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p
                    id="category-error"
                    role="alert"
                    className="mt-1 text-xs text-rose-600 flex items-center gap-1 font-medium"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.category.message}</span>
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="schoolId"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5"
                >
                  Unidade Escolar *
                </label>
                <select
                  id="schoolId"
                  {...register('schoolId')}
                  aria-invalid={!!errors.schoolId}
                  aria-describedby={errors.schoolId ? 'schoolId-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm focus:outline-hidden focus:ring-3 ${
                    errors.schoolId
                      ? 'border-rose-300 focus:ring-rose-100'
                      : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                  }`}
                >
                  <option value="">Selecione uma escola de Itaíba...</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.locality || s.address}
                    </option>
                  ))}
                </select>
                {errors.schoolId && (
                  <p
                    id="schoolId-error"
                    role="alert"
                    className="mt-1 text-xs text-rose-600 flex items-center gap-1 font-medium"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.schoolId.message}</span>
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600">
              {!watch('schoolId')
                ? 'Escolha uma das unidades de exemplo. A lista não corresponde a um cadastro completo ou atualizado de escolas em atividade.'
                : schools.find((s) => s.id === watch('schoolId'))?.verification ===
                    'situacao_nao_confirmada'
                  ? 'Unidade citada na relação municipal; situação atual de funcionamento não confirmada. Seleção apenas para simulação.'
                  : 'Unidade mencionada em fonte municipal de 2026. Chamados e atendimentos são fictícios.'}
            </p>
            <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
              <legend className="text-sm font-semibold px-1">
                Informações de {CATEGORY_LABELS[category].toLowerCase()}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {categoryConfig.fields.map((field) => {
                  const error = errors.categoryDetails?.[field.key];
                  const props = {
                    id: `detail-${field.key}`,
                    ...register(`categoryDetails.${field.key}`),
                    'aria-invalid': !!error,
                    'aria-describedby': error ? `detail-${field.key}-error` : undefined,
                    className: 'field',
                  };
                  return (
                    <div key={`${category}-${field.key}`}>
                      <label className="field-label" htmlFor={`detail-${field.key}`}>
                        {field.label}
                        {field.required ? ' *' : ' (opcional)'}
                      </label>
                      {field.options ? (
                        <select {...props}>
                          <option value="">Selecione...</option>
                          {field.options.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...props}
                          type={field.type || 'text'}
                          placeholder={field.placeholder}
                          maxLength={250}
                        />
                      )}{' '}
                      {error && (
                        <p
                          id={`detail-${field.key}-error`}
                          role="alert"
                          className="text-xs text-rose-700 mt-1"
                        >
                          {String(error.message)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {/* Assunto */}
            <div>
              <label
                htmlFor="subject"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5"
              >
                Assunto Resumido *
              </label>
              <input
                id="subject"
                type="text"
                placeholder={`Ex.: ${categoryConfig.subject[0]}`}
                {...register('subject')}
                aria-invalid={!!errors.subject}
                aria-describedby={errors.subject ? 'subject-error' : undefined}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm focus:outline-hidden focus:ring-3 ${
                  errors.subject
                    ? 'border-rose-300 focus:ring-rose-100'
                    : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                }`}
              />
              {errors.subject && (
                <p
                  id="subject-error"
                  role="alert"
                  className="mt-1 text-xs text-rose-600 flex items-center gap-1 font-medium"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.subject.message}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs" aria-label="Sugestões de assunto">
              {categoryConfig.subject.map((subject) => (
                <button
                  type="button"
                  key={subject}
                  className="px-3 py-2 rounded-lg border border-blue-200 text-blue-800 bg-blue-50"
                  onClick={() =>
                    setValue('subject', subject, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  {subject}
                </button>
              ))}
            </div>
            {/* Descrição Detalhada */}
            <div>
              <label
                htmlFor="description"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5"
              >
                Descrição Completa da Demanda *
              </label>
              <textarea
                id="description"
                rows={4}
                placeholder={categoryConfig.description}
                {...register('description')}
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? 'description-error' : undefined}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-sm focus:outline-hidden focus:ring-3 ${
                  errors.description
                    ? 'border-rose-300 focus:ring-rose-100'
                    : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                }`}
              />
              {errors.description && (
                <p
                  id="description-error"
                  role="alert"
                  className="mt-1 text-xs text-rose-600 flex items-center gap-1 font-medium"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.description.message}</span>
                </p>
              )}
            </div>

            {/* Localização dentro da escola ou rota */}
            <div>
              <label
                htmlFor="locationDetails"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5"
              >
                Localização Exata na Unidade / Rota *
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-600 absolute left-3 top-3" />
                <input
                  id="locationDetails"
                  type="text"
                  placeholder={`Ex.: ${categoryConfig.locations[0]}`}
                  list="location-suggestions"
                  {...register('locationDetails')}
                  aria-invalid={!!errors.locationDetails}
                  aria-describedby={errors.locationDetails ? 'locationDetails-error' : undefined}
                  className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border bg-white text-sm focus:outline-hidden focus:ring-3 ${
                    errors.locationDetails
                      ? 'border-rose-300 focus:ring-rose-100'
                      : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                  }`}
                />
              </div>
              {errors.locationDetails && (
                <p
                  id="locationDetails-error"
                  role="alert"
                  className="mt-1 text-xs text-rose-600 flex items-center gap-1 font-medium"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.locationDetails.message}</span>
                </p>
              )}
            </div>

            <datalist id="location-suggestions">
              {categoryConfig.locations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
            {/* Dados do Solicitante */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                <span>Identificação do Solicitante</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="applicantName"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Seu Nome *
                  </label>
                  <input
                    id="applicantName"
                    type="text"
                    {...register('applicantName')}
                    aria-invalid={!!errors.applicantName}
                    aria-describedby={errors.applicantName ? 'applicantName-error' : undefined}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-blue-100"
                  />
                  {errors.applicantName && (
                    <p id="applicantName-error" role="alert" className="mt-1 text-xs text-rose-600">
                      {errors.applicantName.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="applicantContact"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Contato fictício (opcional)
                  </label>
                  <input
                    id="applicantContact"
                    type="tel"
                    inputMode="tel"
                    placeholder="(DD) 9XXXX-XXXX"
                    maxLength={15}
                    {...register('applicantContact', {
                      onChange: (e) =>
                        setValue('applicantContact', formatBrazilianPhone(e.target.value), {
                          shouldDirty: true,
                        }),
                    })}
                    aria-invalid={!!errors.applicantContact}
                    aria-describedby={
                      errors.applicantContact ? 'applicantContact-error' : undefined
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-blue-100"
                  />
                  {errors.applicantContact && (
                    <p
                      id="applicantContact-error"
                      role="alert"
                      className="mt-1 text-xs text-rose-600"
                    >
                      {errors.applicantContact.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="applicantRole"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Vínculo com a Escola *
                  </label>
                  <select
                    id="applicantRole"
                    {...register('applicantRole')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="aluno">Estudante / Aluno</option>
                    <option value="responsavel">Mãe, Pai ou Responsável</option>
                    <option value="professor">Professor(a) / Docente</option>
                    <option value="comunidade">Membro da Comunidade</option>
                  </select>
                </div>
              </div>
            </div>

            <RequestAttachment
              file={selectedFile}
              error={attachmentError}
              onChange={(file) => {
                if (file) selectAttachment(file);
                else {
                  setSelectedFile(null);
                  setAttachmentError('');
                }
              }}
            />
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <label className="flex gap-3 items-start text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('privacyAcknowledged')}
                  className="mt-1 h-5 w-5 shrink-0"
                  aria-invalid={!!errors.privacyAcknowledged}
                  aria-describedby="privacy-notice privacy-error"
                />
                <span>
                  <strong>Ciência do uso demonstrativo dos dados *</strong>
                  <span id="privacy-notice" className="block mt-1 text-xs text-slate-700">
                    Declaro que as informações fictícias fornecidas são verdadeiras para esta
                    simulação acadêmica. Estou ciente de que os dados fictícios serão gravados no
                    servidor deste projeto acadêmico, sem envio à Prefeitura. Este aceite não
                    constitui base legal de consentimento para um serviço público real.
                  </span>
                </span>
              </label>
              {errors.privacyAcknowledged && (
                <p id="privacy-error" role="alert" className="text-xs text-rose-800">
                  {errors.privacyAcknowledged.message}
                </p>
              )}
            </section>
            {/* Botão de Envio */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm shadow-sm transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Gerando Protocolo...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Enviar Solicitação</span>
                  </>
                )}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
};
