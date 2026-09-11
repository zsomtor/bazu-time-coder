# EDL marker format test fixtures

Project 59's 26 markers rendered in the three marker representations the
exporter can emit, so the format can be verified in DaVinci Resolve without
deploying. Import each onto an empty timeline and check count, position,
name and colour.

- `59_test_both.edl` – `* LOC:` line + `* |C:` tag line (exporter default,
  `markerFormat=both`)
- `59_test_loc.edl` – `* LOC:` lines only (`markerFormat=loc`)
- `59_test_tag.edl` – `* |C:` tag lines only (`markerFormat=tag`)
