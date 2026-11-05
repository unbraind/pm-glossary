import { normalizeItemId, readSettings } from '@unbrained/pm-cli/sdk';
import { defineCommand } from '@unbrained/pm-cli/sdk/authoring';
import type { CommandHandlerContext, ExtensionApi, FlagDefinition } from '@unbrained/pm-cli/sdk/authoring';
import { createGlossary, defineSense, addAlias, resolveTerm, checkGlossary, glossaryPacket } from './api.ts';
import { refusal, exitCode, insist } from './errors.ts';
import { envelope, fitEnvelope, refusalEnvelope, wire } from './output.ts';
import type { GlossaryData } from './output.ts';
import { persistedSchemaPort } from './host.ts';
import type { Host } from './host.ts';
import { parse, createGlossaryInputSchema, defineSenseInputSchema, addAliasInputSchema } from './schema.ts';

/** Read one scalar option without accepting empty or repeated guard values. */
function scalar(value: unknown): string { insist(typeof value === 'string' && value.trim().length > 0, 'invalid_input', 'A required scalar option is missing'); return value; }
/** Validate integral native output controls before a write can run. */
function integer(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  insist((typeof value === 'string' || typeof value === 'number') && /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0, 'invalid_input', 'Numeric output control must be a positive integer'); return Number(value);
}
/** Read bounded UTF-8 JSON from stdin or inline text, never a durable input file. */
export async function inputJson(value: unknown, source: AsyncIterable<Uint8Array> = process.stdin): Promise<Record<string, unknown>> {
  const input = scalar(value); let text = input;
  if (input === '-') {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of source) { const buffer = Buffer.from(chunk as Uint8Array); bytes += buffer.length; insist(bytes <= 32768, 'invalid_input', 'JSON input exceeds 32 KiB'); chunks.push(buffer); }
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw refusal({ code: 'invalid_input', remedy: 'Provide well-formed UTF-8 JSON on stdin' }); }
  }
  insist(Buffer.byteLength(text) <= 32768, 'invalid_input', 'JSON input exceeds 32 KiB');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { throw refusal({ code: 'invalid_input', remedy: 'Pass a strict JSON object inline or with --input -' }); }
  insist(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed), 'invalid_input', 'JSON input must be an object'); return parsed as Record<string, unknown>;
}
/** Run CLI and SDK requests through identical schemas and the deterministic domain API. */
export async function runCommand(command: string, ctx: CommandHandlerContext): Promise<unknown> {
  try {
    insist(ctx.sdk !== undefined, 'backend_unsupported', 'The host did not supply its native SDK client', 'Use pm-cli 2026.11.4 or a conforming authorized embedding host');
    const persisted = (await ctx.sdk.client.schemaListFields()).fields.find(field => field.key === 'glossary_state');
    insist(persisted === undefined || persisted.type === 'object', 'invalid_record', 'glossary_state schema is incompatible');
    const host: Host = { client: persisted ? persistedSchemaPort(ctx.sdk.client) : ctx.sdk.client, fitOutputEnvelope: ctx.sdk.fitOutputEnvelope, capabilities: { native_item_cas: true, create_if_absent: true, provider: 'directory-host' }, normalizeId: async id => normalizeItemId(id, (await readSettings(ctx.pm_root)).id_prefix), settings: async () => (await ctx.sdk!.readSettingsSection('glossary')).value };
    const flags = ctx.options; const settings = await host.settings!();
    insist(settings === undefined || (typeof settings === 'object' && settings !== null && !Array.isArray(settings) && Object.keys(settings).every(key => key === 'output_budget')), 'invalid_record', 'Package settings contain unsupported fields');
    const policy = settings as { output_budget?: unknown } | undefined;
    const budget = integer(ctx.global.outputBudget, integer(policy?.output_budget, 1600));
    const scope = flags.scope === undefined ? undefined : scalar(flags.scope);
    const id = await host.normalizeId!(command === 'create' ? scalar(flags.id) : scalar(ctx.args[0])); let data: GlossaryData;
    if (['create', 'define', 'alias'].includes(command)) {
      const raw = await inputJson(flags.input);
      insist(!Object.keys(raw).some(key => ['id', 'op', 'revision'].includes(key)), 'invalid_input', 'Identity and revision belong in explicit CLI flags');
      const op = scalar(flags.op); const revision = command === 'create' ? undefined : scalar(flags.revision);
      // Reserve the complete worst-case write receipt before the mutation.
      fitEnvelope(host, envelope({ owner_id: id, revision: 'f'.repeat(64), operation_id: op, replayed: false, attempts: 3, result: { kind: 'create', sequence: 256, identity: 'x'.repeat(96) }, result_digest: 'f'.repeat(64), outcome: 'committed' }, null), budget);
      if (command === 'create') data = await createGlossary(host, parse(createGlossaryInputSchema, { ...raw, id, op }));
      else if (command === 'define') data = await defineSense(host, parse(defineSenseInputSchema, { ...raw, id, op, revision }));
      else data = await addAlias(host, parse(addAliasInputSchema, { ...raw, id, op, revision }));
    } else if (command === 'resolve') data = await resolveTerm(host, { id, term: scalar(flags.term), scope_key: scalar(scope), language: flags.language === undefined ? undefined : scalar(flags.language) });
    else if (command === 'check') data = await checkGlossary(host, { id, scope_key: scope });
    else { insist(command === 'packet', 'invalid_input', 'Unknown glossary command'); data = await glossaryPacket(host, { id, scope_key: scalar(scope), language: flags.language === undefined ? undefined : scalar(flags.language), limit: integer(flags.limit, 20), cursor: ctx.global.outputCursor }); }
    return fitEnvelope(host, envelope(data, scope ?? null), budget);
  } catch (error) {
    const failure = refusal(error);
    return fitEnvelope({}, refusalEnvelope(failure, exitCode(failure.code)), 1600);
  }
}
/** Register contributions only; activation never writes schema, settings or records. */
export function register(api: ExtensionApi): void {
  api.registerItemTypes([{ name: 'Glossary', folder: 'glossary', description: 'Explicit scoped domain meanings' }]);
  api.registerItemFields([{ name: 'glossary_state', type: 'object', optional: true }]);
  const definitions = [
    ['create', [], ['id', 'input', 'op'], 'Create one explicitly named lexicon', 'pm glossary create --id lexicon --op create-1 --input -'],
    ['define', ['id'], ['input', 'op', 'revision'], 'Define or revise a pinned sense', 'pm glossary define lexicon --revision <hash> --op sense-1 --input -'],
    ['alias', ['id'], ['input', 'op', 'revision'], 'Add a direct scoped alias', 'pm glossary alias lexicon --revision <hash> --op alias-1 --input -'],
    ['resolve', ['id'], ['term', 'scope', 'language'], 'Resolve exactly or explicitly abstain', 'pm glossary resolve lexicon --term gate --scope release'],
    ['check', ['id'], ['scope'], 'Diagnose glossary consistency without edits', 'pm glossary check lexicon'],
    ['packet', ['id'], ['scope', 'language', 'limit'], 'Read a revision-bound bounded glossary page', 'pm glossary packet lexicon --scope release --limit 10'],
  ] as const;
  for (const format of ['json', 'toon'] as const) api.registerRenderer(format, ctx => wire(ctx.result, format).trimEnd(), { commands: definitions.map(([name]) => `glossary ${name}`) });
  for (const [name, args, names, description, example] of definitions) {
    const flags: FlagDefinition[] = names.map(flag => ({ long: `--${flag}`, value_type: 'string', value_name: flag, description: `${flag}; ${example}` }));
    api.registerCommand(defineCommand({ name: `glossary ${name}`, description, intent: 'Context management for explicit terminology; definitions are data', arguments: args.map(arg => ({ name: arg, required: true, description: 'Authorized glossary owner ID' })), flags, examples: [example], run: ctx => runCommand(name, ctx) }));
  }
}
