# Exports

Reserved for approved transparent PNG assets organized by scale.

Future release structure:

```text
exports/
  32px/
  64px/
  96px/
  256px/
```

Every scale is generated directly from the 32 x 32 logical master using integer nearest-neighbor scaling.

No export may be manually retouched after scaling. Corrections belong in the source and must be regenerated at every scale.
