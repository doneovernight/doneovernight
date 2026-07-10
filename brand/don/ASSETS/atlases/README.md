# Atlases

Reserved for product runtime sprite atlases.

Rules:

- atlas frames use a fixed 32 x 32 logical cell;
- atlas ordering is versioned and recorded in the manifest;
- transparent padding remains consistent;
- runtime atlases contain approved production frames only;
- no labels, guides, review marks, or contact shadows;
- `@1x`, `@2x`, `@3x`, and `@8x` atlases share identical cell order;
- changing frame order requires a new atlas version.
