The first npm release is pending the maintainer's interactive bootstrap. After
that first publish, the maintainer configures npm trusted publishing for
`release.yml` and sets the repository variable `PM_RELEASE_APPROVED` to `true`.
The daily workflow and manual dispatch both require this variable and `main`.
Publishing uses OIDC with provenance; no stored npm token is needed.

| command | what it does |
| --- | --- |
| `pm vcs init` | Create a repository. `--record-path` declares which paths hold structured records; `--set-field` declares how their fields merge. |
| `pm vcs status` | The three-way difference between HEAD, the index and the working tree. Stable indexed paths are checked from stat metadata without re-reading content; racy timestamp-window entries are always hashed. |
| `pm vcs add [paths…]` | Stage paths, or everything. A path that no longer exists stages as a deletion. |
| `pm vcs commit --message` | Record the index. `--item id[,id...]` stores validated PM work associations. Refuses an empty commit unless `--allow-empty`. |
| `pm vcs log [rev]` | First-parent history, newest first. |
| `pm vcs diff [from] [to]` | Unified diff between two revisions' trees. |
| `pm vcs branch [name]` | List, create (`--at`) or delete (`--delete`) branches. `--remotes` adds each remote-tracking branch with its `ahead`/`behind` counts against HEAD. |
| `pm vcs switch <rev>` | Move HEAD and update the working tree. Refuses rather than overwrite uncommitted work. |
| `pm vcs merge <rev>` | Three-way merge. `--record-conflicts` commits field/hunk disagreements; `--fail-on-conflict` preserves the stopping gate. |
| `pm vcs resolve <path>` | Resolve recorded units at HEAD with `--field` and `--take ours\|theirs\|base` or `--value`. |
| `pm vcs tag [name]` | List or create tags. |
| `pm vcs undo` | Reverse a recorded operation, refs and working tree together. |
| `pm vcs oplog` | Every operation, with the refs it moved and where from. |
| `pm vcs bisect start <good> <bad> --item <id>` | Find a regression using linked PM tests or `--command`; bound each `run` with `--max-steps`. Includes `good`, `bad`, `skip`, `status`, `reset`, and `--json`. See [bisect](docs/bisect.md). |
| `pm vcs annotate <path>` | Last-setter attribution per text range or structured field/list entry; `--full`, `--at`, and `--json`. |
| `pm vcs export <file>` | Write refs and their history to a bundle. |
| `pm vcs import <file>` | Import a bundle, verifying every object against its own id. |
| `pm vcs remote [name] [url]` | List remotes, add a file or HTTP(S) remote, or remove one (`--remove`). `remote add <name> <url>` is also accepted. |
| `pm vcs clone <url> [dir]` | Create a repository from another one, adopting its record configuration. |
| `pm vcs fetch [remote]` | Bring a remote's branches onto `refs/remotes/<remote>/`. Touches no local branch. |
| `pm vcs push [remote]` | Send branches (`--branch`) with explicit live FileId leases. Refuses a non-fast-forward unless `--force`. |
| `pm vcs lease <acquire\|renew\|release\|break\|inspect> <FileId> [remote]` | Manage receiver-owned fenced publication leases (`--refs`, `--ttl-ms`, `--fence`). |
| `pm vcs serve` | Serve one repository or a directory of repositories over HTTP. `--listen`, `--root` and `--auth` configure the address, root and bearer grants. |
| `pm vcs series create <base> <tip> --description <text>` | Produce a canonical native patch series. |
| `pm vcs series push <name> <id> [remote] --branch <ref>` | Propose a named series with explicit FileId leases; `--expected <id>` revises it and resets review to pending. |
| `pm vcs series list [remote]` / `pm vcs series fetch <name> [remote]` | Discover or import served proposals without moving a working branch. |
| `pm vcs series apply <id>` / `pm vcs series rederive <id>` | Apply fetched patches or compare rederived canonical series bytes. |
| `pm vcs review list [remote]` / `pm vcs review fetch <name> [remote]` | Discover or import native review records and their recorded outcomes. |
| `pm vcs review update <name> [remote] --base <revision> --fields <json>` | Merge changed fields concurrently; record deterministic same-field resolution. |
| `pm vcs verify` | Re-read every reachable object and check it against its id. |
| `pm vcs trace <path-or-file-id>` | Trace one logical file across edits, moves, copies and deletion. |
| `pm vcs files <item-id>` | Resolve a PM item's linked arbitrary files to stable identities and changes. |
| `pm vcs changes <item-id>` | Report explicit and file-derived stable ChangeIds for a PM item. |
| `pm vcs items [from..to]` | Report PM items explicitly associated with, or linked to files changed by, native revisions. |

`test/exact-gates.test.ts` runs real processes against disposable projects to prove omitted
sources, untested branches, forbidden syntax, short clones and hostile configuration fail
closed. It also invokes the operational scripts directly. `release:check` includes lint,
duplication, docstrings and coverage; `prepublishOnly` requires that complete release gate.

`pack:check` also runs in `release:check`. It packs without lifecycle scripts (the
release gate builds first), scans every archive member's name and contents for private
paths and credential-shaped strings, and reports categories and line numbers without
echoing matched values. It requires npm and tar. Package documentation is allowlisted
to README-linked guides and examples; certification, audit and receipt records stay
in the repository.

Every workflow job granted write permissions, including CodeQL, Dependabot and
reusable workflow calls, requires the exact repository `unbraind/pm-vcs`.
The approval variable controls GitHub releases; it does not impose a local npm
publishing hold. Maintainers run the prepublish checks and authenticate with npm
for local publication. The first local publish uses `--provenance=false`; daily
GitHub OIDC releases keep provenance enabled.
A maintainer enables the disabled workflow after merge with
`gh workflow enable release.yml --repo unbraind/pm-vcs`. Workflow activation is
manual; the package does not install an automatic setup workflow.


| phase | what it adds | epic |
| --- | --- | --- |
| **2** | Change identities that survive rewriting, plus `describe`, `rebase`, `squash`, `split`, `cherry-pick`, `revert`, `reset`, `restore`, and automatic descendant rebase | [`pm-vcs-ijj7`](.agents/pm/epics/pm-vcs-ijj7.toon) |
| **3** ✅ | Named remotes, remote-tracking refs, and `clone`/`fetch`/`push` over a transport with reachability-based negotiation | [`pm-vcs-wm40`](.agents/pm/epics/pm-vcs-wm40.toon) |
| **4** | pm-vcs versioning its own source, with a CI gate proving the tracked history matches the source tree byte for byte | [`pm-vcs-390t`](.agents/pm/epics/pm-vcs-390t.toon) |
| **5** | The forge: a patch series as an object kind, review state as records, and a served repository | [`pm-vcs-5h6j`](.agents/pm/epics/pm-vcs-5h6j.toon) |
| **6** | Scale: packed storage, a reachability index, shallow and partial history, and garbage collection bounded by the operation log | [`pm-vcs-b7cb`](.agents/pm/epics/pm-vcs-b7cb.toon) |
| **7** | Agents never stop on a conflict: opt-in field/hunk conflict objects, tip resolution, ancestor propagation and annotation and linked-test bisect shipped; signing planned | [`pm-vcs-phase7`](.agents/pm/epics/pm-vcs-phase7.toon) |

The c8 coverage gate instruments every production TypeScript file at the root and under
`src/`, `engine/` and `scripts/` with `--all`. It requires exactly 100% statements, branches,
functions and lines for each file, including self-hosting, bundle handling and the gates
themselves. A never-loaded module fails instead of disappearing from the report. The command
selects `package.json` explicitly so an ambient c8 configuration cannot narrow the inventory.
Collection uses the project's own `coverage/tmp` directory: a nested c8 process must not
inherit and clear its parent's raw records. A real marker-file regression checks that boundary.

ESLint uses the strict policy published by the pinned `pm-ops` package across production
code and tests. It rejects explicit `any`, dynamic and inline type imports, non-erasable
syntax and repository convention violations. The docstring gate uses `pm-ops/docstrings`.
The duplication launcher uses `pm-ops/duplication` with the pinned jscpd 5 binary, a zero
threshold, a 50-token floor and a one-line floor. It enumerates all production sources,
reconciles the detector's scan count at a one-token floor, and rejects empty or incomplete
scans. Detector subprocesses run outside consumer configuration. The pinned fleet analyzer
uses built-in `node:fs` globbing and does not require the `fast-glob` peer.

Core assurance still owns contracts, evaluation and durable receipts. First run
and record the actual core gate using the **native tree id** as its `tree_id`.
Choose the exact gate, assertion and `evaluated_at` from `pm assurance verdicts`.
The assertion must pass with proven negative controls and a positive population;
dry runs, incomplete results and ambiguous receipts refuse. Other assertions in
the same gate remain independent. The newest 1000 matching gate receipts are
searched through the core SDK's verified workspace history.

The receipt certifies **native provenance erasure**: every pm-vcs-derived content
representation of the selected object identities has been removed from owned
loose objects, pack members, native fragment compositions, managed local exports
and known shared working copies. Native operation summaries are conservatively
redacted. Identifier-only history, terminal denials, paths and audit facts remain;
reads of erased content return `obliterated`, and undo cannot reconstruct it.
Native transformations publish source-identity certificates before payload bytes;
the closure follows merge/replay, conflict, staging and rendering outputs across
FileIds. Unknown legacy or imported payload provenance refuses erasure with
`uncatalogued_provenance` and object identities before deletion, while reads and
exports remain supported. Composition proofs memoize distinct objects and check
the deadline and store lease per node/edge; logical content at 256 MiB, aggregate
cache at 512 MiB or one million edges refuses before deletion.

Complete native storage parsing, ownership checks, shared-FileId conflicts,
physical-copy plans and descriptor/pathname verification remain mandatory.
Native storage verification binds each parsed file to a byte hash and rechecks it
at the final catalogue barrier; timestamps alone do not establish content stability. Accountability requires two
matching scans, with namespace checks after the final file rehashes, while the
store lease excludes native writers. See the [input and concurrency contract](docs/links-layers-obliteration.md).
Unknown storage refuses unless explicitly purged with a receipt and re-verification.
Payload-only resumable upload batches still refuse after erasure because they
carry no FileId provenance. Direct payload writes require a non-denied FileId;
known object/content identities and native compositions cannot be resurrected.
The operator must exclude concurrent filesystem edits outside pm-vcs. Windows
uses file fsync and synchronous namespace acknowledgment with weaker power-loss
assurance than POSIX directory fsync. See the
[composition and erasure design](docs/links-layers-obliteration.md).

The SDK exposes `ObjectStore.compact(): PackReport` and typed `PackRefusal`
errors with `code` and `remedy`. Publication and retirement use the existing
shared store lease. An interrupted writer requires `pm vcs recover-lock` before
retrying; the retry removes only owned staging jobs and converges without
changing object addresses. Unknown records are skipped and reported. Pack
corruption refuses retirement and collection. Objects over the 16 MiB packing
bound remain loose. Authorized erasure first materializes verified loose copies
and retires every pack, then applies the existing permanent denial and physical
deletion proof. GC rewrites packed survivors when collecting packed members.

Publication requires explicit stable FileId leases, including renamed, deleted and
historical files. Large fragmented content uses bounded manifest hierarchies;
legacy flat manifests remain readable through verified bounded streams. See
[publication lease workflows and manifest API contracts](docs/publication-leases-and-manifests.md).

`required-checkpoints.json` is an array of request objects with `receipt` removed.
Receiver policy is private administrative state in `.pmvcs/checkpoint-policy.json`;
it must be configured independently on each receiver and is never copied from
sender advertisements. An empty array disables requirements. Malformed/unreadable
policy refuses publication. Publication checks **every proposed tip**, including
force pushes, no-op ref updates and native forge series tips, inside the existing shared writer lease and
ref transaction. It rechecks all carried claims and receiver requirements, so an
old claim, a missing claim or a narrower scope cannot satisfy the changed scope.
Historical claims describe their own snapshots; requirements apply to published
tips, rather than retroactively requiring claims on legacy ancestry.

Requests are limited to 512 MiB on write endpoints and 16 MiB on read endpoints, 10,000 fetch refs or ref updates, 100,000 haves or objects,
and 4,096 upload sessions per repository. Old sessions are evicted; objects remain available
for retry, but an evicted session loses its delivery receipt. Upload sessions are also bounded
cumulatively — 1,000,000 accepted objects and 4 GiB of decoded object bytes between publications,
configurable through the server's limits — because a reused session keeps every receipt it has
accepted until it publishes. Past either cumulative bound the upload is refused with
`limit_exceeded`, the session's receipts are released with it, and a publication under that
session id afterwards reports a fresh session's empty receipt. A publication clears the charge
with the receipts, refused publications included. Tokens load at startup and
require a restart to rotate. Without `--auth`, served repositories are read-only unless
`--allow-unauthenticated-writes` is passed.
Keep the default loopback binding for local use; use TLS termination when carrying bearer
tokens beyond loopback. The TLS-terminating proxy must forward `Host` as the bound server
address and port, for example nginx `proxy_set_header Host 127.0.0.1:<port>;` for a loopback
bind. Replace `<port>` with the server's listening port; forwarding the public hostname
instead fails host validation and returns the fixed denial. Token-bearing remote URLs are
sensitive local configuration; do not publish them. Client connection errors redact
credentials and redirects are refused.

An attached claim is immutable. Attaching identical normalized content is a no-op,
preserving the commit, signature and operation log. Replacing it, including widening
its scope or changing dependencies, requires a new durable evaluation for the current
native tree and the exact replacement selectors: `evaluated_at` must be later than
the attached receipt, and both the evidence digest and fingerprint must change.
Reusing the original receipt refuses even when the native tree itself is unchanged.
Claims made with an older fingerprint encoding fail closed and need revalidation.

Adapt [the example request](docs/checkpoint-example.json) to actual tracked paths
and the captured receipt; its zero tree id is a placeholder. Include every input
that can affect the contract in `scope` or `dependencies`, including the assurance
registry, external policy revision files, configuration and implementation files.
Omitted inputs cannot invalidate evidence. Omit `fields` to bind the entire file;
field selection requires a configured native record. Paths are exact, relative
and unique within each selection list; no globs or implicit dependency traversal.

A checkpoint attests scoped reuse of an agent's accepted receipt, rather than
proving that an arbitrary agent executed a test honestly. Native signing supplies
authorship and covers checkpoint headers; changing attached checkpoints clears the old
signature and requires explicit signing again. Wall-clock expiry, package/backend
freshness and review approval remain separate policies. Keep receiver
administration trusted and retain the core history alongside native bundles for
independent receipt auditing.

Obliteration certifies only fully accountable object storage: every regular file
must be a complete native loose object or checksummed pack, and no accounted
object may have an erased identity or payload. Foreign, renamed or partial files
return `unverifiable`, even when no payload signature matches. Explicit
`pm vcs obliterate <file-id> --purge-unaccounted` removes exactly the selected
unaccounted files with an identity-bound receipt, then re-verifies. See
[physical erasure verification](docs/indexed-packs.md#physical-erasure-verification)
for authorization, bounded retries and SDK examples.

Verification refuses incomplete evidence. SDK errors carry `status: "unverified"`
and a named `bound`; integrity and receipt reports carry an overall `verification`
verdict independently of output pagination. Decode errors and exhausted work
bounds cannot certify erasure, integrity, reachability or assurance receipts.
An interrupted GC plan supersedes its former deletion authority when current
reachability protects a recorded candidate, then publishes a fresh exact set.
See the [destructive operation protocol](docs/destructive-operations.md).

The scope is the whole system — the storage and history model of git, the rewriting and
operation-log model of jujutsu, and the conviction Fossil, Forgejo and lore share that a
project's own metadata and its changes under review belong *inside* the repository rather than
in a service beside it. All of it written from scratch on the pm SDK, around one primitive git
does not have: **the record**.

Almost everything a team's context actually lives in is not lines. A tracker item is a
record: a status, a priority, a set of tags, an assignee, an append-only history. Two agents
working the same project on two branches routinely touch two *different fields* of one item.
That is not a conflict in any meaningful sense — but whether git can merge it depends on how
many lines apart the fields happen to be serialized, which is an accident of the file format
rather than a property of the change.

**pm-vcs removes the mismatch instead of patching it.** A record is a first-class object kind
alongside blobs, trees and commits. Merging two revisions of a record compares fields, not
lines. Two agents editing two different fields converge, always, with no line-merge hazard
anywhere in the pipeline — because there is no line merge in the pipeline.

**A conflict is scoped to the thing that conflicted.** A genuine scalar disagreement on one
field conflicts *on that field*, and every other field of that record still merges. A
document does not become unreadable because one value disagreed. File-identity disagreements
are reported the same way: independently added paths and divergent renames produce an
`identity` conflict with a deterministic, structurally valid merged tree instead of aborting.

Native derivation certificates retain the complete transitive input set, including
manifest pages and fragments, after GC removes intermediate objects. GC upgrades
old direct-parent certificates before sweeping; missing old ancestry or missing
input certificates remains unknown and refuses erasure before deletion. Normal
GC retains the certificates. Whole blobs, manifests and fragment sets with the same
reconstructed bytes share a durable whole-content identity. Canonical record, link
and conflict payloads also retain the blob identity of their literal bytes. Certificates retain
that identity and the composition members, so collecting a container cannot hide
an equivalent representation or anything derived from it. See [provenance across garbage collection](docs/links-layers-obliteration.md#provenance-across-garbage-collection).

A configured record path is parsed and re-encoded canonically when staged, so two agents
whose editors disagree about key order or indentation produce **one object id**. A file whose
formatting moved does not register as changed. This is not cosmetic: it is what keeps a
reformat from presenting as a conflict.

| kind | holds |
| --- | --- |
| `blob` | raw bytes |
| `tree` | sorted entries with mode, object id, stable file identity and copy provenance |
| `commit` | a tree, parents, author, committer, message, stable change id and PM item associations |
| `record` | **a structured document as canonically ordered fields** |
| `manifest` | fixed or content-defined fragment addresses and byte lengths |
| `series` | portable patch-series metadata |
| `link` | immutable target repository identity, commit ID and exact file mappings |
| `tombstone` | terminal FileId, affected addresses and bounded audit metadata |
| `conflict` | one field or hunk, with separately addressed base/ours/theirs |

Filesystem aliases are fenced before content access: ancestor symlinks are never
traversed, and materialization and restore never overwrite a leaf symlink. Staging can
record an ordinary direct leaf link as target text; control targets, dangling control
aliases and link chains are excluded. These protections cannot be negated. For a
protected explicit add or restore, the command refuses with `path_ignored`.

The native forge serves patch series and review records through the same repository
grants as refs and objects. Agents can propose → review → land with
[the served forge workflow](docs/served-forge.md). Review updates merge per field,
and genuine same-field disagreements record both values and their deterministic
resolution. Series publication checks receiver-owned FileId leases under the
declared landing branch scope.

Clone adopts the same record configuration as a file clone. Only an absent
`.pmvcs/config.json` uses default record settings for older repositories.
Unreadable files (including permission failures and directories), invalid JSON
and schema-invalid configuration refuse with typed `bad_config` errors naming
the path. Only omitted fields use field defaults; explicit null paths, policy or
field maps are invalid; HTTP advertisement refuses rather than advertising empty settings. Ref advertisement, bundle fetch,
verified object upload and publication use the existing transport capabilities. The optional
`object-fetch` capability adds `Transport.fetchObjects(ids)`, returning a verified bundle of
individually named objects, including standalone patch series. Review records travel with
ordinary trees and commits. A series consumer fetches its base and patch history as well as
its series object before importing the series bundle.

`clone` adopts the source's record configuration before it writes a single object. A clone
that started from the defaults would store the same paths as blobs rather than records and
merge them line by line: two repositories sharing commit ids while disagreeing about what
those commits mean, each internally consistent and therefore undetectable.

`pm vcs checkpoint attach` binds one exact durable core assurance assertion to a
stable native change. Its fingerprint covers explicitly selected top-level record
fields and policy dependencies in the immutable native tree, including file
identity, mode, copy provenance, field absence and selector definitions. The native
canonical tree-entry encoder binds every stored metadata attribute. Whole-file
selections bind the content object id; field selections substitute the canonical
selected-field digest so unrelated fields can still change. Unselected field edits,
comments on other fields, descriptions and parent-only rewrites retain evidence.
Selected field edits, deletion, moves, conflict units, file replacement and policy
changes require validation again. Order inside a selected collection is significant.
New native changes need their own checkpoint; a checkpoint is never inherited
from an ancestor merely because the assertion name matches.

| command | behavior |
| --- | --- |
| `pm vcs authority --principal operator --read-token-file read.token --erase-token-file erase.token` | Initially configure two distinct clone-local version 2 scrypt grants only when the grant is absent. Token files should live outside tracked content. |
| `pm vcs authority --principal operator --read-token-file new-read.token --erase-token-file new-erase.token --current-erase-token-file current-erase.token` | Replace a valid v2 grant using its separate current erase credential. Proposed new credentials cannot authorize replacement. |
| `pm vcs authority --principal operator --read-token-file read.token --erase-token-file erase.token --regenerate-legacy` | Explicitly regenerate a recognized historical unversioned SHA-256 grant. This flag cannot replace v2, unknown, corrupt or unreadable grants. |
| `pm vcs link dependency.link --spec link.json` | Stage a canonical typed descriptor; commit normally. |
| `pm vcs link --list` | List descriptors without accessing target repositories. |
| `pm vcs link resolve dependency.link --target ../target --read-token-file read.token --layer dependency` | Verify separate authority, target identity and exact revision, then overlay the mapped files privately. |
| `pm vcs layer local destination.bin source.bin` | Snapshot one file privately; engine `addLayer` accepts multiple exact paths. `--executable` records private mode. |
| `pm vcs layer --list` | Show names and excluded paths without printing private bytes. |
| `pm vcs layer local --remove` | Restore the current underlying index; edited or missing overlays require `--discard-edits`. |
| `pm vcs gc [--apply]` | Report unreachable objects by default; apply retains refs, oplog, leases, uploads and sparse instances. |
| `pm vcs obliterate <FileId-or-indexed-path> --erase-token-file erase.token --reason incident` | Erase every historical payload and fragment of the stable identity, with a durable typed audit. Authorized retry resumes pending cleanup. |
| `pm vcs recover-lock` | Recover a confirmed dead writer or aged empty legacy lock without erase authority. Pending erasure remains denied until authorized cleanup. |

A fetched branch is reachable two ways: by its full `refs/remotes/upstream/main`, and by the
`upstream/main` shorthand any command taking a revision accepts. A local branch **or tag** of
the same name always wins that shorthand — the remote-tracking namespace is searched last — so
adding it cannot retarget a name a repository already uses.


For agents, `pm vcs merge <revision> --record-conflicts` records genuine field or
text disagreements and allows the next commit. Read the flat `conflicts` table
in `status`, `show`, `log` or `items`, then resolve at HEAD with
`pm vcs resolve <path> --field status --take theirs` (or `--take ours`, `--take base`,
`--value done`). Working PM documents stay readable. `--fail-on-conflict` preserves
the previous stopping behavior. Use `--at <revision>` to insert a resolution after an ancestor and replay every
branch/tag descendant with stable change IDs and one undoable operation. Descendant
edits to that unit remain readable and become new recorded conflicts. An unreachable
stored ancestor refuses without recording an operation. See
[Phase 7 child 2](.agents/pm/features/pm-vcs-p7resolve.toon); structural conflicts
still need explicit reconciliation. See the [storage contract](ARCHITECTURE.md#phase-7-conflict-storage-contract).

Export selected native histories with an Ed25519-signed manifest of permitted
paths/branches, included objects and excluded objects. The receiver supplies its
own scope, trusted keys and exact branch leases. Cross-scope references refuse
before object import; signatures bind every manifest field. Unknown omissions
prevent a completeness claim. Native identities and complete selected ancestry
are preserved; mixed-scope commits refuse rather than widening authorization.

**Ref updates are compare-and-swap under an exclusive lock.** Two agents that read the same
branch tip and both commit on top of it cannot both win. The second write fails, loudly, and
says to re-read and retry. A last-write-wins ref update is precisely how one agent's commit
disappears with nothing anywhere reporting it.

The command validates every field using `encodeLink` and stores its canonical bytes.
Stored `link` objects still require an exact canonical representation. Invalid JSON,
root types and fields refuse before descriptor or index publication; unreadable spec
files retain their filesystem errors. The descriptor commits metadata only. Exact file mappings declare the subset;
branch movement cannot change the pin. Resolution requires the separately configured
target read credential and creates an instance-private layer. Local target bindings
and credentials are supplied at resolution and never appear in enclosing bundles.
This implementation resolves local target repositories; it does not resolve HTTP
pins or recursively follow nested descriptors.

Served pushes re-hash every arriving object and verify the complete reachable closure before
publishing refs. The same fast-forward and compare-and-swap rules apply to file and HTTP
remotes. Native `.agents/pm/history/*.jsonl` histories that preserve their base prefix merge
through an append-only multiset union: each byte-identical event keeps the base count
plus `max(left_extra, right_extra)`. Cherry-picked or doubly merged events replay once;
two identical appends on one branch remain two. Base bytes and timestamp ordering are
preserved, and whitespace-distinct lines remain distinct. Rewritten prefixes retain
conflict handling. See [merge semantics](ARCHITECTURE.md#6-diff-and-merge) for the
line boundaries, ordering and separate PM hash-chain reconciliation contract.

`branch --remotes` reports each tracking branch with how many commits HEAD is `ahead` of it and
`behind` it. Both numbers are needed to act: `behind 0` is a push that will be accepted, `ahead 0`
is a fast-forward, and two non-zero counts are a divergence to merge first. An agent that skips
this learns the same fact from a push refusal instead — one round trip to a remote to discover
something both sides already knew. An unborn HEAD omits both counts rather than reporting zero.

- **A fetch cannot move a local branch.** Branches it learns land under `refs/remotes/`.
  Importing a bundle wholesale would move the receiver's `main` onto the sender's, because a
  bundle names refs as the *sender* knows them — so the receiving agent's commits would become
  reachable from nothing, with nothing in the output saying so. Tags are the exception and keep
  their own names under `refs/tags`, since a tag identifies a point in history rather than one
  repository's view of a branch; one the receiver already uses at a different value is reported
  in `conflictingTags` rather than moved.
- **A push cannot discard a commit the remote has.** The receiving side requires its current
  tip to be an ancestor of what is being pushed, and `--force` is the only way past it.
- **That check is atomic.** Every ref lands as a compare-and-swap against the value the
  pusher observed, so a push decided against a stale advertisement fails instead of landing
  on top of whatever arrived in between.

Not a git wrapper. Not a helper around `git merge`. pm-vcs has its own content-addressed
object store, its own refs, its own index, its own diff, its own three-way merge, its own
operation log and its own distribution format. No code path in the engine shells out to `git`,
and nothing it writes is git-compatible.

The ecosystem's existing answer is to bolt merge drivers onto git so that `.toon` items and
`.jsonl` history get field-aware handling. That works, and pm-cli ships it. But it is a patch
over a mismatch: the storage layer still thinks in lines, and every tool downstream has to be
told not to.

| | versions | merge unit | pm-vcs takes |
| --- | --- | --- | --- |
| **git** | file trees | lines | content addressing, the commit DAG, the object model |
| **Subversion** | file trees | lines | nothing structural; a cautionary tale about central state |
| **Jujutsu** | file trees | lines | the operation log, and `undo` as a first-class verb |
| **Fossil / Forgejo** | files + project metadata | lines / a database | the conviction that project metadata belongs *inside* the VCS |
| **Epic Games Lore** | arbitrary binary files and repository-scale fragments | storage/view dependent | binary-first storage, stable identity, sparse instances and resumable publication |
| **pm-vcs** | file trees **and records** | **fields**, then lines | — |

**Identical concurrent edits are agreement, not conflict.** Two agents reaching the same
conclusion independently is the most common way an automated merge wastes attention. pm-vcs
merges it cleanly.

**Merge bases are computed, not assumed.** Two branches that have already merged each other
once have several minimal common ancestors. pm-vcs finds all of them and builds a virtual
base. Picking one arbitrarily is how a criss-cross merge silently reintroduces a change that
was already reverted.

One-sided link changes retain their typed descriptor during merge. Competing pins
raise `link_merge_conflict`; explicitly stage and commit an agreed descriptor, then
retry the merge. Resolution never silently selects a pin or changes a private layer.

| command | what it does |
| --- | --- |
| `pm vcs git preflight` | Can *this* git checkout merge tracker data field-aware? |
| `pm vcs git preview <ref>` | What would merging `<ref>` do to tracker data, per item and per field? |
| `pm vcs git items <range>` | Which pm items did this commit range create, modify and close? |

The `.pmvcs` name is reserved at **every depth**, including a leaf entry, and in every
case spelling (`.PMVCS`, `.PmVcS`). A parent repository tracks a child repository's source
and PM records, while keeping the child's credentials, objects, refs and private state
out of staging, commits and status. Add removes legacy control entries from the index,
including sparse entries; ordinary commits and merge continuation refuse such entries
until they are removed. Stored trees cannot write or remove control paths through
checkout, restore or sparse-view changes, and empty control directories survive pruning.

Tests run against real repositories and real filesystems. There are no mocks and no
hand-built `api` doubles: this is filesystem and merge code, and a fake of either would only
assert against the suite's own assumptions.

- [unbraind/pm-cli#825](https://github.com/unbraind/pm-cli/issues/825) — `FlagDefinition`'s
  index signature defeats excess-property checking, so a misnamed flag field type-checks and
  then aborts activation, dropping every later sibling command. Flags here use `long` /
  `value_name` / `value_type`.
- [unbraind/pm-cli#826](https://github.com/unbraind/pm-cli/issues/826) — an extension command
  cannot both return a structured report and exit non-zero, and a thrown handler error's
  remediation is replaced by a generic line. Gate commands therefore throw, with the
  remediation folded into the message.
- [unbraind/pm-cli#832](https://github.com/unbraind/pm-cli/issues/832) — pm-cli bundles a
  private `pm-vcs` exemplar that claims the `vcs` alias and registers `vcs log` / `vcs merge`,
  with no way for a package author to detect the collision. Enabling both in one workspace is
  not supported.

Jujutsu's operation log is the best idea in modern version control for agents: every command
is recorded, so "put it back" is one verb rather than a reasoning problem about which id was
the old tip. pm-vcs has it. Fossil is right that issues and project state belong in the
repository rather than beside it — pm-vcs goes further and makes them a native object kind
rather than a table in an attached database.

User-authored files and metadata, including alternate encodings, are independent
data. Their coincidental resemblance to selected content does not establish
provenance. Caller-owned export buffers, external export destinations, legacy
unregistered exports, other clones, backups, snapshots and physical-media recovery
are outside the certificate. Repository-local ordinary and signed CLI exports are registered with
native object inventories and byte hashes; changed artifacts refuse deletion.
Existing files cannot be adopted as managed exports by overwriting them.
Native working-file writes also persist source IDs and a birth identity before
bytes, so an interrupted index publication cannot lose ownership. Replaced outputs
refuse before deletion.

Pending native ref, detached HEAD, index, merge-state, audit and upload-pin
publications also retain their object roots during GC. Conditional updates recover
all destinations before checking the new predicate, under the store and namespace
leases. A recovered peer value returns `ref_changed`/`head_changed` rather than
being silently overwritten. See [publication recovery](docs/destructive-operations.md)
for missing-target cancellation and bounded verification.

Legacy `/<repository>/<endpoint>` requests remain compatibility aliases.
Their existing scope-first, deepest-catalogued resolution is preserved: a token
granted only `tenant` can use `/tenant/objects/fetch` without observing an
out-of-scope nested repository. With both grants or without authentication,
that ambiguous legacy URL still selects the nested history endpoint; clients
needing the parent object endpoint must negotiate the explicit layout. An
authorized lookup of an unknown name triggers at most one rescan per second. Each scan
examines at most 10,000 directory entries and descends at most 32 levels; repositories beyond
those bounds receive the same denial as unknown names. Use a narrower root for larger trees.
Symlink aliases, escaping symlinks and linked instances are refused, including aliases
introduced after discovery. The tokens file is a JSON array:

Import reproduces **identical commit ids**, verifies every object against its own hash before
storing it, and fails whole — naming the missing ids — when a bundle depends on history the
receiver does not have.

`pm vcs explain HEAD --lenses lifecycle,dependency,evidence,policy --limit 20`
explains a native change against its first parent with exact immutable object
citations. Lenses are opt in; the default shows ordinary field/text provenance.
Canonical SDK-valid items receive lifecycle, dependency, recorded evidence and
declared item policy labels. Malformed tracker objects stay opaque. These views
never rewrite content or execute evidence. JSON (`--json`) and default TOON share
bounded pages and explicit omission receipts. See the [contract and SDK/CLI
example](docs/tracker-lenses.md) for fields, refusals and continuation.

`status` reports `excludedLayers` and `obliterated` separately. Bulk staging skips
layers; explicit staging refuses them. Checkout preserves edited layer bytes while
changing the underlying index. Sparse-view changes and individual restore operations
refuse while layers exist. Removing a layer restores its underlying staged bytes
or removes overlay-only paths. To commit desired overlay changes, remove the layer,
reapply those changes and stage them deliberately.

The installation-owned `.pm-cli/runtime/` directory is also **always excluded** at
any depth and in every case spelling. It contains transient CLI state, including
telemetry queues and the concurrently created/removed `telemetry/flush.lock` directory.
The walk prunes this runtime subtree before descent, project negations cannot
re-include it, and materialization cannot overwrite it. This does not blanket-ignore
`.pm-cli/`: settings and other non-runtime paths follow the usual rules. The next
add removes visible legacy runtime entries from an older index.

On Linux with available procfs descriptor paths, materialization, restore and pruning
pin directories across concurrent ancestor replacement. Other platforms, and Linux
without usable procfs, use a portable fallback that verifies every captured ancestor's
device/inode identity with `lstat` immediately before and after each mutation. A detected
directory or leaf replacement refuses with `worktree_path_changed`. Exclusive file
creation uses `O_NOFOLLOW` where available; leaf checks and descriptor identity checks
also apply on Windows. Writes and chmod use fresh file descriptors, and deletions are
non-recursive. The portable fallback narrows but **cannot close the race between the
final verification and a pathname syscall**, because Node exposes no `openat`; a refusal
can occur after a redirected mutation. A refused operation can leave ordinary worktree
files partially changed; its replacement index is not published. See
[working-tree mutation protection](docs/working-tree-mutations.md) for the exact limits.

The native VCS always excludes the PM tracker's runtime caches, search indexes, locks,
transactions and checkpoints using the SDK's runtime fence and resolved tracker root.
`search/eval-queries.json` remains eligible for tracking. These exclusions apply to status,
staging and materialization and cannot be overridden by `.pmvcsignore` negations; the next
add removes runtime entries left in an older index. Item records and history remain tracked.

**Nothing is destroyed before it is known to succeed.** A switch that would overwrite an
uncommitted edit refuses *before writing anything*. A half-applied switch leaves an agent
with a tree matching no commit and no way to describe what it has.

A committed link is a typed descriptor, distinct from `vcs instance` and its shared
local store. Obtain the target's `Repository.identity()` and an exact commit ID, then
write a JSON spec (pretty printing and a trailing newline are accepted):

`.pmvcs`, `.git`, `.hg`, `.svn`, `.bzr`, `_darcs`, `CVS` and `node_modules` are **always** ignored and
**cannot be re-included** — not by `.pmvcsignore`, and not by a commit whose tree names a path
inside them. Materialization filters the target tree, so history recorded before the rules
existed still cannot write over another tool's state. This is pinned by a test that builds a
deliberately hostile commit naming `.git/HEAD` and asserts it materializes to nothing.

`.pmvcsignore` adds project patterns with gitignore-like semantics: `#` comments, a trailing
slash for a directory, a pattern without `/` matching by basename at any depth, and `!` to
re-include. Staging an ignored path *by name* is refused rather than skipped — staging
nothing while reporting success is how a commit ends up missing a file.

Only missing objects move. The fetching side offers every commit it holds — its branches, its
tags, and the tracking refs of every remote — the receiving side keeps the ones it recognises,
and everything reachable from that agreed set is excluded from the transfer and declared as a
prerequisite instead.

Ordinary operations retain objects, so rewinding a ref preserves history. Explicit authorized
`obliterate` permanently removes selected payloads; `undo` can restore a pointer but cannot
recover obliterated bytes.

Omit `--effective-at` for immediate revocation. Revocation and publication share
one writer lock. Revoked historical signatures also refuse publication: trust a
replacement public key and explicitly re-sign the affected reachable versions.
Both filesystem and served HTTP receivers refuse the whole ref batch for
unsigned, untrusted, revoked, malformed or tampered changes. See the
[payload, policy and threat model](docs/change-signatures.md) and
[pm item](.agents/pm/features/pm-vcs-p7sign.toon).

Native commits, refs, history, merges, capability-limited change bundles, transports, signing, annotation,
bisect, semantic validation checkpoints and tracker change lenses work in a plain-directory PM project without a git executable. Bisect
predicates must supply their own dependencies. The optional `vcs git` interoperability
commands need a git repository and refuse with an actionable diagnostic otherwise.

// agent B retitles and reprioritises it
{ …, "title": "Ship the thing (revised)", "priority": 1,
      "tags": ["area:vcs", "urgent"], "history": ["created", "retitled by B"] }
```

The unambiguous wire layout is POST `/<repository>/.pmvcs/<endpoint>` (or
`/.pmvcs/<endpoint>` for the root). The reserved `.pmvcs` control segment
cannot occur in a catalogued repository name at any depth; discovery refuses
repositories at or below such names. Thus `/tenant/.pmvcs/objects/fetch` always
fetches the parent's objects while `/tenant/objects/.pmvcs/fetch` fetches the
nested repository's history, with open access or any combination of grants.
The HTTP advertisement adds the optional `explicit-endpoints` capability.
Clients negotiate it through the legacy, unambiguous `advertise` endpoint and
then use the explicit layout. Every direct transport operation negotiates before
its first repository request and caches the result, including `missingObjects`
and `uploadObjects`. Servers without that capability retain the legacy layout.

Depth-limited and blob-filtered clone/fetch, demand hydration, and conservative GC are documented in
[scale history and collection](docs/scale-history-and-gc.md).

Completed purge receipts remain valid audit history after an instance or pack is
removed. Pending root-bound authority is cancelled with a typed reason when its
root disappears or is recreated; a clean current store can then be certified.
