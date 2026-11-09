/** Somente mensagens de regras de negócio revisadas podem ser devolvidas ao cidadão. */
export class BusinessRuleError extends Error {
  override name = 'BusinessRuleError';
}
