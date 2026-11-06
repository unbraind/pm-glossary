import { defineExtension } from '@unbrained/pm-cli/sdk/authoring';
import { register } from './src/commands.ts';
/** Native versioned glossary extension; activation contributes no durable mutations. */
const extension = defineExtension({ name: 'pm-glossary', version: '2026.11.5', description: 'Scoped explicit domain meanings', activate: register });
/** Activate this package through the native pm extension host. */
export default extension;
/** Storage-independent native lifecycle API; the host supplies authorization and capability evidence. */
export { createGlossary, defineSense, addAlias, resolveTerm, checkGlossary, glossaryPacket, readGlossary } from './src/api.ts';
/** Native write receipt retains the original committed result separately from current state. */
export type { GlossaryMutationReceipt } from './src/api.ts';
/** Public portable host and native directory adapter. */
export { createDirectoryHost } from './src/host.ts';
/** Host-owned client and capability contracts. */
export type { Host, Snapshot } from './src/host.ts';
/** Strict input/state contracts and content fingerprints for in-process consumers. */
export { glossaryStateSchema, scopeSchema, senseSchema, aliasSchema, provenanceSchema, replaySchema, committedResultSchema, createGlossaryInputSchema, defineSenseInputSchema, addAliasInputSchema, resolveTermInputSchema, checkGlossaryInputSchema, glossaryPacketInputSchema, digest } from './src/schema.ts';
/** Input and state types for embedding agents. */
export type { GlossaryState, Sense, CreateGlossaryInput, DefineSenseInput, AddAliasInput, ResolveTermInput, CheckGlossaryInput, GlossaryPacketInput } from './src/schema.ts';
/** Shared deterministic resolver and strict stored-state validation. */
export { resolveTermInState, readState } from './src/kernel.ts';
/** Explicit usable/abstaining resolution result. */
export type { TermResolution } from './src/kernel.ts';
/** Strict output contracts and native self-inclusive serialized fitting. */
export { termResolutionSchema, glossaryMutationReceiptSchema, glossaryCheckSchema, glossaryPacketSchema, glossaryDataSchema, glossaryRefusalSchema, glossaryOutputSchema, envelope, fitEnvelope, refusalEnvelope } from './src/output.ts';
/** Public common output shape. */
export type { GlossaryData, GlossaryOutput } from './src/output.ts';
/** Typed privacy-safe refusals and documented exit categories. */
export { GlossaryRefusal, exitCode } from './src/errors.ts';
