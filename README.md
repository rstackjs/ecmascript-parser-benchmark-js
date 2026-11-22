# ECMAScript Parser Benchmark (npm)

This repository is a fork of [yuku-toolchain/ecmascript-parser-benchmark-js](https://github.com/yuku-toolchain/ecmascript-parser-benchmark-js), maintained to update parser benchmark data and add parsers.

Benchmarks for ECMAScript parsers available as npm packages, including pure JavaScript parsers and native parsers (Zig, Rust).

## System

| Property | Value |
|----------|-------|
| OS | macOS 26.6.2 (arm64) |
| CPU | Apple M5 Max |
| Cores | 18 |
| Memory | 64 GB |
| Runtime | Node.js v24.20.0 |

## Parsers

### [Acorn](https://github.com/acornjs/acorn)

A tiny, fast JavaScript parser, written completely in JavaScript.

### [Babel](https://github.com/babel/babel/tree/main/packages/babel-parser)

A JavaScript compiler and parser used by the Babel toolchain.

### [Oxc](https://github.com/oxc-project/oxc)

A high-performance JavaScript and TypeScript parser written in Rust.

### [Oxc (raw transfer)](https://github.com/oxc-project/oxc)

The native Oxc parser with experimental raw AST transfer enabled.

### [SWC](https://github.com/swc-project/swc)

An extensible Rust-based platform for compiling and bundling JavaScript and TypeScript.

### [SWC Next](https://github.com/swc-project/swc-next)

The next-generation SWC JavaScript and TypeScript parser.

### [Yuku](https://github.com/yuku-toolchain/yuku)

A high-performance & spec-compliant JavaScript/TypeScript compiler written in Zig.

Measured on 2026-11-23.

| Parser | Published version |
|--------|-------------------|
| Acorn | 8.19.0 |
| Babel | 8.1.3 |
| Oxc | 0.159.0 |
| Oxc (raw transfer) | 0.159.0 |
| SWC | @swc/core 1.16.22 |
| SWC Next | 0.7.0 |
| Yuku | 0.28.1 |

## Benchmarks

### [typescript.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/typescript.js)

**File size:** 7.83 MB

![Bar chart comparing npm parser speeds for typescript.js](charts/typescript.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **37.02 ms** | **±3.19%** | **38.71 ms** | **27.93 ms** | **71.72 ms** | **27.02 ops/s** | **baseline** |
| Oxc (raw transfer) | 40.25 ms | ±2.83% | 42.05 ms | 29.49 ms | 93.58 ms | 24.84 ops/s | 1.09× slower |
| Yuku | 41.99 ms | ±1.31% | 41.73 ms | 37.55 ms | 81.92 ms | 23.82 ops/s | 1.13× slower |
| Babel | 144.19 ms | ±2.15% | 148.54 ms | 135.08 ms | 197.35 ms | 6.94 ops/s | 3.90× slower |
| Acorn | 155.63 ms | ±2.12% | 159.83 ms | 146.15 ms | 256.98 ms | 6.43 ops/s | 4.20× slower |
| Oxc | 259.22 ms | ±2.42% | 271.14 ms | 249.54 ms | 413.79 ms | 3.86 ops/s | 7.00× slower |
| SWC | 469.34 ms | ±1.54% | 482.18 ms | 456.95 ms | 678.85 ms | 2.13 ops/s | 12.68× slower |

### [checker.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/checker.ts)

**File size:** 2.95 MB

![Bar chart comparing npm parser speeds for checker.ts](charts/checker.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **12.47 ms** | **±1.52%** | **13.38 ms** | **11.72 ms** | **33.37 ms** | **80.18 ops/s** | **baseline** |
| Yuku | 13.10 ms | ±1.05% | 14.03 ms | 11.50 ms | 35.07 ms | 76.34 ops/s | 1.05× slower |
| Oxc (raw transfer) | 15.87 ms | ±3.52% | 19.92 ms | 14.20 ms | 79.87 ms | 63.00 ops/s | 1.27× slower |
| Babel | 47.62 ms | ±1.01% | 49.46 ms | 43.75 ms | 79.54 ms | 21.00 ops/s | 3.82× slower |
| Oxc | 90.55 ms | ±1.43% | 87.63 ms | 79.31 ms | 129.91 ms | 11.04 ops/s | 7.26× slower |
| SWC | 135.77 ms | ±2.97% | 144.73 ms | 133.60 ms | 199.93 ms | 7.37 ops/s | 10.89× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [lib.dom.d.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/lib.dom.d.ts)

**File size:** 2.24 MB

![Bar chart comparing npm parser speeds for lib.dom.d.ts](charts/lib_dom.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **4.73 ms** | **±1.08%** | **5.47 ms** | **4.19 ms** | **20.67 ms** | **211.33 ops/s** | **baseline** |
| Oxc (raw transfer) | 5.04 ms | ±2.36% | 6.90 ms | 4.78 ms | 30.20 ms | 198.50 ops/s | 1.06× slower |
| SWC Next | 5.10 ms | ±1.16% | 5.68 ms | 4.83 ms | 24.63 ms | 196.20 ops/s | 1.08× slower |
| Babel | 18.78 ms | ±0.69% | 19.13 ms | 16.03 ms | 41.34 ms | 53.24 ops/s | 3.97× slower |
| Oxc | 32.17 ms | ±1.00% | 34.22 ms | 31.21 ms | 44.80 ms | 31.08 ops/s | 6.80× slower |
| SWC | 55.74 ms | ±0.16% | 55.95 ms | 55.01 ms | 61.37 ms | 17.94 ops/s | 11.78× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [react.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/react.js)

**File size:** 0.07 MB

![Bar chart comparing npm parser speeds for react.js](charts/react.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Oxc (raw transfer)** | **0.17 ms** | **±5.17%** | **0.32 ms** | **0.14 ms** | **28.57 ms** | **5983.55 ops/s** | **baseline** |
| SWC Next | 0.17 ms | ±2.11% | 0.23 ms | 0.14 ms | 11.79 ms | 5947.96 ops/s | 1.01× slower |
| Yuku | 0.18 ms | ±0.17% | 0.20 ms | 0.18 ms | 1.41 ms | 5440.96 ops/s | 1.10× slower |
| Babel | 0.62 ms | ±0.29% | 0.66 ms | 0.59 ms | 15.09 ms | 1609.71 ops/s | 3.72× slower |
| Acorn | 0.95 ms | ±0.16% | 0.97 ms | 0.91 ms | 7.53 ms | 1051.11 ops/s | 5.69× slower |
| Oxc | 1.50 ms | ±1.29% | 1.65 ms | 1.46 ms | 13.18 ms | 665.37 ops/s | 8.99× slower |
| SWC | 2.74 ms | ±0.18% | 2.77 ms | 2.67 ms | 6.19 ms | 364.70 ops/s | 16.41× slower |

## Run Benchmarks

### Prerequisites

- [Node.js 22.18 or later](https://nodejs.org/) - Benchmark runtime
- [pnpm](https://pnpm.io/) - Package manager

### Steps

1. Clone the repository:

```bash
git clone https://github.com/rstackjs/ecmascript-parser-benchmark-js.git
cd ecmascript-parser-benchmark-js
```

2. Install dependencies:

```bash
pnpm install
```

3. Download the benchmark files:

```bash
pnpm run load-files
```

4. Validate parser outputs:

```bash
pnpm preflight
pnpm test:normalize
```

5. Run benchmarks:

```bash
pnpm bench
```

This will run benchmarks on all test files. Results are saved to the `result/` directory.

Benchmark duration is configurable via the environment variables `BENCH_TIME` (timed duration per run in ms, default 10000), `BENCH_WARMUP` (warmup duration in ms, default 2000), and `BENCH_RUNS` (independent runs per parser, default 3). For the most stable numbers, run on AC power with no other applications running.

## Methodology

Each parser is benchmarked using [Tinybench](https://github.com/tinylibs/tinybench) with warmup iterations followed by multiple timed runs. Each run measures the time to parse the source text into an AST. Source files are read from disk once and kept in memory for all iterations.

To keep results stable and fair, every parser × file combination runs in its own freshly spawned process, so JIT state and GC pressure from one parser never affect another. Each combination is benchmarked in multiple independent runs (3 by default), and the reported median is the median across those runs, a statistic that is robust to GC pauses, OS scheduling blips, and other outliers. The RME column shows the relative margin of error (99% confidence) within a run. Differences between parsers smaller than their combined margins should be treated as noise.

Native parsers (Oxc, SWC, SWC Next, Yuku) run through their respective bindings, so measured time includes the binding overhead. Pure JS parsers (Acorn, Babel) run directly in the JavaScript runtime.

`lib.dom.d.ts` is a global declaration script with no imports or exports. SWC parses it as a script rather than a module, because its npm binding otherwise rejects the file's `...arguments` parameter names under module strict mode.