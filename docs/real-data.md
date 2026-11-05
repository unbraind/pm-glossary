# Public real-data receipt

The corpus and definitions are reviewable in `test/fixtures/`. The measurement author wrote the gold definitions independently of the resolver implementation; an independent external reviewer has not approved this release. MIT-licensed source passages are retained for reproducible offline tests. No private source was used.

`npm run test:real-data` copies only committed native tracker text from the public pm-vcs checkout into a newly created plain directory, certifies its complete SDK read, and writes only that scratch copy. The original tracker is read-only. Functional CI uses the pinned public source-passage snapshots instead of requiring sibling checkouts.

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
    "selected_sha256": "605f4e1fa610756a17144a660dc0e3a5c0bab556f12a52ca8d327a83afb94cd0",
    "selected_bytes": 22200
  }
]
```

Measured result:

```json
{
  "schema_version": 1,
  "copied_tracker_revision": "131dc3a6ff15ab3d127611f041b5385e5d54257e",
  "copied_items": 173,
  "raw_item_bytes": 1530456,
  "raw_item_tokens": 382614,
  "terms": 38,
  "senses": 44,
  "bindings": 0,
  "bindings_status": "deferred_by_first_slice",
  "unambiguous_correct": 42,
  "unambiguous_total": 42,
  "abstained": 10,
  "abstention_total": 10,
  "ambiguities_detected": 1,
  "ambiguities_resolved_by_narrower_scope": 1,
  "raw_passage_bytes": 130362,
  "raw_passage_tokens": 32591,
  "packet_bytes": 35580,
  "packet_tokens": 8896,
  "reduction_percent": 72.71,
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
    }
  ],
  "wall_ms": 17104,
  "owner_operations": 45
}
```

The baseline is the same deduplicated public prose passages supporting these manually reviewed meanings. It is not a repeated per-term baseline. The three packet envelopes each satisfy the hard size bound; their combined bytes are reported above. The evidence scope includes a retained root ambiguity in the evidence-domain packet. No candidate was dropped to achieve compression. Native token estimates count the greatest exact JSON/TOON serialization including framing and self-accounting receipts.

Binding count is zero because the companion first-slice plan explicitly defers exact usage bindings and freshness adapters. The ambiguity was resolved by an explicit narrower scope, not by guessing or changing source prose. Research/physics “power” is also covered in the functional suite.

Wall time is one local sample, including scratch setup, source-copy reading and all definitions/probes/packets. Native item IDs and hashes generated in the scratch project are not a multi-item atomic snapshot. No hosted provider or external reviewer conformance is claimed.
