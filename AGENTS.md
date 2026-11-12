# Repository Guidelines

- Do not update `README.md` unless necessary, except to update benchmark charts, data, and related objective benchmark information.
- Keep `README.md` limited to objective benchmark data and instructions for running and reproducing the benchmarks.
- Do not include subjective judgments, rankings expressed as opinions, or speculative explanations of performance differences, such as "why xxx is slower".
- Regenerate all results together with `pnpm bench` when updating the runtime or parser versions.

- Run `pnpm preflight` before recording timings. Preflight uses parser-specific normalization and stops on the first AST difference. Test schema conversions with small inputs using `pnpm test:normalize`. Do not add fixture-specific conversions or repair outputs using another parser's AST. AST schema differences alone do not prove a parser bug.
