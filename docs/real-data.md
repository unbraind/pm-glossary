# Public real-data receipt

The corpus and definitions are reviewable in `test/fixtures/`. The measurement author wrote the gold definitions independently of the resolver implementation; an independent external reviewer has not approved this release. MIT-licensed source passages are retained for reproducible offline tests. No private source was used.

`npm run test:real-data` copies only committed native tracker text from the public pm-vcs checkout into a newly created plain directory, certifies its complete SDK read, and writes only that scratch copy. The original tracker is read-only. Functional CI uses the pinned public source-passage snapshots instead of requiring sibling checkouts.

Run this command from a source checkout of `unbraind/pm-glossary`, with the public `pm-vcs` repository at `../pm-vcs` and the revision pinned in `test/fixtures/public-corpus.json`. The npm package does not include the test fixtures, `test/corpus.ts`, or the `test:real-data` runner.

| Public input | Git revision | Selected UTF-8 bytes |
| --- | --- | --- |
| unbraind/pm-vcs README | `131dc3a6ff15ab3d127611f041b5385e5d54257e` | 45848 |
| unbraind/pm-rl README | `8a0b5e933d2d70acce1dea4849b6300216438c33` | 62314 |
| unbraind/pm-evidence README | `1435931270505fb81cbafa84141269a43285dfc6` | 22200 |

Full-source and selected-passage SHA-256 digests:

```json
[
  {
    "repository": "unbraind/pm-vcs",
    "revision": "131dc3a6ff15ab3d127611f041b5385e5d54257e",
    "source_sha256": "da1afe538686aaa332eb513890d74881ee754fb77b7748d824494908ef15a51c",
    "selected_sha256": "c9c24e77e7532ead0acfcef5e446e299a3812bb0b58cc316f734f54372121821",
    "selected_bytes": 45848
  },
  {
    "repository": "unbraind/pm-rl",
    "revision": "8a0b5e933d2d70acce1dea4849b6300216438c33",
    "source_sha256": "a439ff60a4cb54257c9f44e78619ca7bbc455ca9712c7c215c725063c3cedff6",
    "selected_sha256": "2b4f22afb25b528489f468c84f9b26e6308b729df9b9163547ca704259a104a9",
    "selected_bytes": 62314
  },
  {
    "repository": "unbraind/pm-evidence",
    "revision": "1435931270505fb81cbafa84141269a43285dfc6",
    "source_sha256": "79b1da8d10d9a8c1052da0b7125af55c2cc264752cc44b5b129e5497a1067401",
    "selected_sha256": "7459f473e9aad7288264407ca5491e91e203397a9148ceab727251a1fac8ffd4",
    "selected_bytes": 22199
  }
]
```

Measured result:

```json
{
  "schema_version": 1,
  "tracker_evidence": [
    {
      "term": "release",
      "item_id": "pm-vcs-simi",
      "item_hash": "ebd94d1e9bb3883ec0c2b1a6fc8878f7e508e56134db836d02b0c5ca0f1c3a66",
      "field_pointer": "/description",
      "bytes": 925
    },
    {
      "term": "gate",
      "item_id": "pm-vcs-disposable-cleanup-contracts",
      "item_hash": "a15defe78607963793698e032e65ec9a2530e2940d0e1ea4e2fd6abeb09bdc13",
      "field_pointer": "/description",
      "bytes": 720
    },
    {
      "term": "lease",
      "item_id": "pm-vcs-j7mz",
      "item_hash": "79f7594aa8efdc295b909416350156e2e9a52afb8cf2d9e5f97ae1842189cd34",
      "field_pointer": "/description",
      "bytes": 489
    },
    {
      "term": "receipt",
      "item_id": "pm-vcs-uploadretention",
      "item_hash": "4d725e720dc5b5fca953e400e655828037dc1c1b95bf9233cf2f301718f5be08",
      "field_pointer": "/description",
      "bytes": 237
    }
  ],
  "selected_tracker_field_bytes": 2371,
  "probe_receipts": [
    {
      "term": "release",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-release"
      ],
      "actual": [
        "pm-vcs-release"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "gate",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-gate"
      ],
      "actual": [
        "pm-vcs-gate"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "lease",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-lease"
      ],
      "actual": [
        "pm-vcs-lease"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "receipt",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-receipt"
      ],
      "actual": [
        "pm-vcs-receipt"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "record",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-record"
      ],
      "actual": [
        "pm-vcs-record"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "revision",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-revision"
      ],
      "actual": [
        "pm-vcs-revision"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "branch",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-branch"
      ],
      "actual": [
        "pm-vcs-branch"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "merge",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-merge"
      ],
      "actual": [
        "pm-vcs-merge"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "object",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-object"
      ],
      "actual": [
        "pm-vcs-object"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "index",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-index"
      ],
      "actual": [
        "pm-vcs-index"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "bundle",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-bundle"
      ],
      "actual": [
        "pm-vcs-bundle"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "commit",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-commit"
      ],
      "actual": [
        "pm-vcs-commit"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "ref",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-ref"
      ],
      "actual": [
        "pm-vcs-ref"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "history",
      "scope": "pm-vcs",
      "expected": [
        "pm-vcs-history"
      ],
      "actual": [
        "pm-vcs-history"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "release",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-release"
      ],
      "actual": [
        "pm-rl-release"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "gate",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-gate"
      ],
      "actual": [
        "pm-rl-gate"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "receipt",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-receipt"
      ],
      "actual": [
        "pm-rl-receipt"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "benchmark",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-benchmark"
      ],
      "actual": [
        "pm-rl-benchmark"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "environment",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-environment"
      ],
      "actual": [
        "pm-rl-environment"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "run",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-run"
      ],
      "actual": [
        "pm-rl-run"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "evaluation",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-evaluation"
      ],
      "actual": [
        "pm-rl-evaluation"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "generation",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-generation"
      ],
      "actual": [
        "pm-rl-generation"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "checkpoint",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-checkpoint"
      ],
      "actual": [
        "pm-rl-checkpoint"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "policy",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-policy"
      ],
      "actual": [
        "pm-rl-policy"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "promotion",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-promotion"
      ],
      "actual": [
        "pm-rl-promotion"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "lineage",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-lineage"
      ],
      "actual": [
        "pm-rl-lineage"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "confidence",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-confidence"
      ],
      "actual": [
        "pm-rl-confidence"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "sample",
      "scope": "pm-rl",
      "expected": [
        "pm-rl-sample"
      ],
      "actual": [
        "pm-rl-sample"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "receipt",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-receipt"
      ],
      "actual": [
        "pm-evidence-receipt"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "source",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-source"
      ],
      "actual": [
        "pm-evidence-source"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "fragment",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-fragment"
      ],
      "actual": [
        "pm-evidence-fragment"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "citation",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-citation"
      ],
      "actual": [
        "pm-evidence-citation"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "freshness",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-freshness"
      ],
      "actual": [
        "pm-evidence-freshness"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "replay",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-replay"
      ],
      "actual": [
        "pm-evidence-replay"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "binding",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-binding"
      ],
      "actual": [
        "pm-evidence-binding"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "scope",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-scope"
      ],
      "actual": [
        "pm-evidence-scope"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "contract",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-contract"
      ],
      "actual": [
        "pm-evidence-contract"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "selector",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-selector"
      ],
      "actual": [
        "pm-evidence-selector"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "consent",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-consent"
      ],
      "actual": [
        "pm-evidence-consent"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "descriptor",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-descriptor"
      ],
      "actual": [
        "pm-evidence-descriptor"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "provenance",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-provenance"
      ],
      "actual": [
        "pm-evidence-provenance"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "artifact",
      "scope": "pm-evidence",
      "expected": [
        "pm-evidence-artifact"
      ],
      "actual": [
        "pm-evidence-artifact"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "release",
      "scope": "pm-vcs-tracker",
      "expected": [
        "tracker-release"
      ],
      "actual": [
        "tracker-release"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "gate",
      "scope": "pm-vcs-tracker",
      "expected": [
        "tracker-gate"
      ],
      "actual": [
        "tracker-gate"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "lease",
      "scope": "pm-vcs-tracker",
      "expected": [
        "tracker-lease"
      ],
      "actual": [
        "tracker-lease"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "receipt",
      "scope": "pm-vcs-tracker",
      "expected": [
        "tracker-receipt"
      ],
      "actual": [
        "tracker-receipt"
      ],
      "resolution": "resolved",
      "usable": true
    },
    {
      "term": "gate",
      "scope": "root",
      "expected": [
        "gate-check",
        "gate-door"
      ],
      "actual": [
        "gate-check",
        "gate-door"
      ],
      "resolution": "ambiguous",
      "usable": false
    },
    {
      "term": "not-defined-0",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-1",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-2",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-3",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-4",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-5",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-6",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-7",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    },
    {
      "term": "not-defined-8",
      "scope": "root",
      "expected": [],
      "actual": [],
      "resolution": "unknown",
      "usable": false
    }
  ],
  "budget_refusal": {
    "code": "output_budget",
    "remedy": "Repeat the original request with the verified --budget; never drop ambiguity witnesses",
    "details": {
      "minimum_usable_budget": 372,
      "required_estimated_tokens": 371,
      "hard_ceiling_tokens": 8192,
      "revision": "ace65e9dcea07e266cd3a9ed1be89abd67a7845a2f049c21cdc33486c55a1a79",
      "retry_shape": "Repeat the original request with --budget 372"
    }
  },
  "ambiguity_resolution": {
    "term": "gate",
    "scope": "pm-vcs",
    "expected": [
      "pm-vcs-gate"
    ],
    "actual": [
      "pm-vcs-gate"
    ],
    "resolution": "resolved"
  },
  "copied_tracker_revision": "131dc3a6ff15ab3d127611f041b5385e5d54257e",
  "copied_items": 173,
  "raw_item_bytes": 1530456,
  "raw_item_tokens": 382614,
  "terms": 38,
  "senses": 48,
  "bindings": 0,
  "bindings_status": "deferred_by_first_slice",
  "unambiguous_correct": 46,
  "unambiguous_total": 46,
  "abstained": 10,
  "abstention_total": 10,
  "ambiguities_detected": 1,
  "ambiguities_resolved_by_narrower_scope": 1,
  "raw_passage_bytes": 132732,
  "raw_passage_tokens": 33183,
  "packet_bytes": 40217,
  "packet_tokens": 10056,
  "reduction_percent": 69.7,
  "packets": [
    {
      "scope": "pm-vcs",
      "returned": 14,
      "ambiguous": 0,
      "bytes": 11434,
      "tokens": 2859
    },
    {
      "scope": "pm-rl",
      "returned": 14,
      "ambiguous": 0,
      "bytes": 11467,
      "tokens": 2867
    },
    {
      "scope": "pm-evidence",
      "returned": 15,
      "ambiguous": 1,
      "bytes": 12679,
      "tokens": 3170
    },
    {
      "scope": "pm-vcs-tracker",
      "returned": 4,
      "ambiguous": 0,
      "bytes": 4637,
      "tokens": 1160
    }
  ],
  "wall_ms": 18880,
  "owner_operations": 49
}
```

The baseline is the same deduplicated public prose passages supporting these manually reviewed meanings. It is not a repeated per-term baseline. The four packet envelopes each satisfy the hard size bound; their combined bytes are reported above. The evidence scope includes a retained root ambiguity in the evidence-domain packet. No candidate was dropped to achieve compression. Native token estimates count the greatest exact JSON/TOON serialization including framing and self-accounting receipts.

Binding count is zero because the companion first-slice plan explicitly defers exact usage bindings and freshness adapters. The ambiguity was resolved by an explicit narrower scope, not by guessing or changing source prose. Research/physics “power” is also covered in the functional suite.

Wall time is one local sample, including scratch setup, source-copy reading and all definitions/probes/packets. Native item IDs and hashes generated in the scratch project are not a multi-item atomic snapshot. No hosted provider or external reviewer conformance is claimed.

The tracker scope directly cites immutable description fields for release, gate, lease and receipt in the copied public items. Its four expected senses were reviewed against those fields separately from resolver execution. The receipt includes every expected/actual probe, the narrowing decision and a refused tiny-budget request.
