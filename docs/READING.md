# Reading documents large files and images

Version 0.4.5 extended `read_file` with document/binary support; 0.4.6 retains those features and adds [search, organization and command tools](AGENT_TOOLS.md) for eleven tools total. Folder scope, read-only permissions and pause controls remain. No manual DOCX-to-TXT export is needed.

| Input | Default result |
| --- | --- |
| Text, code, CSV, XVG, logs and SVG | Paged text without the old 2 MiB file-read limit |
| DOCX, PPTX, XLSX, ODT, ODP, ODS, ODG, RTF, EPUB | Extracted text/tables/slides plus an embedded-image list |
| PDF | Extracted text; graphical pages available separately |
| PNG, JPEG, WebP, GIF, TIFF, BMP, AVIF | A resized MCP image result; first frame for animation |
| NPY/NPZ | Shape, dtype, storage order and common numeric values; no object/pickle deserialization |
| ZIP | Entry listing; select a text/NPY entry with member, without extraction to disk |
| Other binaries | Bounded raw bytes and metadata; not execution or a semantic format decoder |

## Pagination

Text replies default to 200 lines/48,000 characters, up to 1,000 lines/64,000 characters. If `has_more` is true, send `next_cursor` back as `cursor` with the same path and encoding. A cursor is bound to the file version; after an edit, start again. Long single lines are split safely too. `total_lines` can be null before a streaming read reaches EOF. `offset` remains a zero-based line number.

UTF-8 and BOM-marked UTF-16 are detected. For legacy text, use `view=text` with `encoding=gb18030` or `windows-1252`.

`list_files` now returns `{ entries, total_entries, offset, has_more, next_offset }`, not a bare array. Read `entries` and follow `next_offset` as the next request's `offset`. The default page size is 500, maximum 1,000; later entries remain reachable.

## Figures and pages

For a document, read its `images` list first, then call the same path with `view=image, image_index=0` (zero-based). For PDF use `view=image, page=1` (one-based). A scanned PDF without a text layer can be inspected as page images.

Previews default to a 2,048-pixel maximum edge; `width` accepts 256–4,096. A preview is capped at 2 MiB, leaving the source untouched. Image data appears once as MCP image content, never duplicated as Base64 in text. Standard MCP delivery is checked locally; Gemini website consumption still needs acceptance testing for its current version. Extracting text alone does not inspect figures, and a preview is not a lossless original.

## Arrays archives and bytes

NPZ initially lists entries. Select `member="values.npy"` to read that array. Numeric `offset` is an element index and `lines` limits the sample count. Values follow the declared C/Fortran storage order. Unsupported structured/object dtypes return metadata without unpickling.

`view=binary` reads any ordinary file in 4,096-byte chunks by default, up to 65,536 bytes. Results contain Base64, a short hex preview and `next_byte_offset`. Raw access is not a GROMACS/MATLAB format interpreter.

## Bounds

Document/image/container parsing accepts up to 256 MiB input, ZIPs up to 10,000 entries/512 MiB declared expansion, extracted document text up to 16 MiB, and a 45-second worker timeout. Larger/unsupported binaries remain accessible through byte-range reads. Ordinary streamed text has no 256 MiB file limit. Embedded high-resolution figures are not sent with every text request.

Parsing does not execute macros, code or attachments, download OCR data, or write extracted intermediates into the workspace. Legacy `.doc`/`.xls`, encrypted documents and unknown formats have no guaranteed text extraction. Text writes and exact edits retain their 2 MiB limit and reject Office/PDF/image/common scientific-binary targets to avoid corrupting them.

After upgrading, use a fresh task to avoid stale text-only assumptions. Tool names and the existing connection address stay the same.
