/** Joined fields are response-only: existing persisted orders and migrations remain unchanged. */
export const WORK_ORDER_LINK_FIELDS = `jsonb_build_object(
 'requestProtocol', r.protocol,
 'requestSchoolName', r.data->>'schoolName',
 'requestPriority', r.priority
)`;
