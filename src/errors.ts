import { isPmCliExpectedError } from '@unbrained/pm-cli/sdk';

/** Public domain refusal with bounded diagnostics and a concrete recovery step. */
export class GlossaryRefusal extends Error {
  /** Stable public domain refusal category. */
  readonly code: string;
  /** Recovery action safe to display to a caller. */
  readonly remedy: string;
  /** Whether repeating the original request can succeed after rereading. */
  readonly retryable: boolean;
  /** Bounded machine-readable diagnostic metadata. */
  readonly details: Record<string, unknown>;
  /** Original validated process status from a native host refusal. */
  readonly nativeExit: number | undefined;
  /** Capture a refusal without copying submitted content into diagnostics. */
  constructor(code: string, message: string, remedy = 'Inspect the named input and retry with reviewed shareable data', details: Record<string, unknown> = {}, nativeExit?: number) {
    super(message); this.name = 'GlossaryRefusal'; this.code = code; this.remedy = remedy;
    this.nativeExit = nativeExit; this.retryable = ['contention', 'revision_conflict', 'stale_cursor'].includes(code); this.details = details;
  }
}
/** Enforce an invariant before any durable mutation. */
export function insist(condition: unknown, code: string, message: string, remedy?: string, details?: Record<string, unknown>): asserts condition {
  if (!condition) throw new GlossaryRefusal(code, message, remedy, details);
}
/** Preserve contracted native refusals and bound system diagnostics without exposing raw messages. */
export function refusal(error: unknown): GlossaryRefusal {
  if (error instanceof GlossaryRefusal) return error;
  if (isPmCliExpectedError(error) && typeof error.code === 'string') {
    const code = error.code === 'item_revision_conflict' ? 'revision_conflict' : error.code;
    const native = error.context;
    const remedy = 'remedy' in error && typeof error.remedy === 'string' ? error.remedy : typeof native.required === 'string' ? native.required : 'Reread the authorized record and reconcile the original operation before retrying';
    const nativeExit = Number.isInteger(error.exitCode) && error.exitCode > 0 && error.exitCode <= 255 ? error.exitCode : undefined;
    return new GlossaryRefusal(code, 'Native host refused the operation', remedy, {}, nativeExit);
  }
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) return new GlossaryRefusal('io_error', 'Host I/O operation could not be verified', 'Check host access and read back the original operation key before retrying', { native_code: error.code });
  return new GlossaryRefusal('outcome_unknown', 'Host operation outcome could not be verified', 'Read back the original operation key before retrying; never invent a fresh key');
}
/** Map domain categories onto the documented process exit contract. */
export function exitCode(code: string, nativeExit?: number): number {
  if (nativeExit !== undefined) return nativeExit;
  if (code === 'not_found') return 3;
  if (['revision_conflict', 'operation_conflict', 'stale_cursor', 'contention', 'ambiguous_term', 'stale_binding'].includes(code)) return 4;
  if (['backend_unsupported', 'permission_denied', 'incomplete_read', 'outcome_unknown', 'io_error'].includes(code)) return 5;
  return 2;
}
