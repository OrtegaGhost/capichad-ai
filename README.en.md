# CapiChad

**Your own AI on your own PC: no subscriptions, no usage limits, your data stays on your machine.**⁠​‌​​​​‌‌​‌​‌​​​​​‌​​​​‌​​​‌​‌‌​‌​​‌‌​‌​‌​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌​​​‌‌​​​‌​​‌‌​​‌‌​‌‌​​​‌‌​​‌‌​​‌​⁠
Local chat models, an offline library of books and encyclopedias, image generation, document tools and a **Program** mode
that actually *verifies* the code it writes. If you have internet, it can optionally use the web to improve answers.

`Windows 10/11` · `free & open source (AGPL-3.0)` · `v1.6.0` · [Español](README.md)

> The app's interface is currently **Spanish only**. This page is a short guide; the full step-by-step guide (with
> alternate links) is in Spanish in [docs/INSTALACION.md](docs/INSTALACION.md).

## Features
- **Local chat** with [Ollama](https://ollama.com) models (Qwen3, gpt-oss…).
- **Offline library:** index your own books (PDF, Word, PowerPoint, HTML, TXT; OCR for scans) and use
  [Kiwix](https://library.kiwix.org/) `.zim` encyclopedias (Wikipedia, DevDocs, Stack Exchange…). Answers cite book and page.
- **Program mode:** you describe a task; the model proposes files; **the system** writes them, runs the tests/verification and
  shows you the real output. It retries with the real error, can look the error up in the library/web, and can undo everything.
- **Internet (optional):** web search, Stack Overflow answers and Creative-Commons reference images. Works fully offline too.
- **Images:** Stable Diffusion 1.5 (LCM) locally — GPU on NVIDIA, CPU on AMD/Intel/no GPU. **Tools:** background removal, Office → PDF, OCR.

## Requirements
| | Minimum | Recommended |
|---|---|---|
| OS | Windows 10/11 **64-bit** (x64). **No 32-bit or ARM build yet** | Windows 11 |
| RAM | 8 GB (small model) | 16–24 GB |
| CPU | Intel or AMD, 64-bit, AVX (AVX2 recommended) | 6+ cores |
| GPU | Optional (everything runs on CPU, slower) | NVIDIA (CUDA) or compatible AMD Radeon speed up chat; Intel iGPU/Arc runs on CPU. Images: ~15 s on NVIDIA, 1–3 min on any other (CPU) |
| Disk | ~10 GB | 30 GB (+ images) up to ~250 GB with a full library |

## Quick install
**Automatic path:** install CapiChad and open it. The first-run assistant **scans your PC** (RAM, GPU, disk), **pre-selects what it can handle**,
and with one click **downloads, verifies, recognizes, indexes and optimizes** everything (Ollama, models and the offline library, up to ~200 GB).
You can add the rest — the app warns you it may not run well on your machine — and downloads resume if interrupted. Later, use the **Downloads** menu.

**Manual path:**
1. Install **Ollama**: <https://ollama.com/download> (alt: <https://github.com/ollama/ollama/releases/latest>, or `winget install Ollama.Ollama`).
2. Install **CapiChad**: <https://github.com/OrtegaGhost/capichad-ai/releases/latest> → `CapiChad-Setup-<version>.exe`
   (no admin needed; SmartScreen may warn because it is unsigned: *More info → Run anyway*).
3. Pull a model: `ollama pull qwen3:4b-instruct-2507-q4_K_M` (2.5 GB). Optional: `ollama pull gpt-oss:20b` for harder coding tasks.
4. Optional: `.zim` files from <https://library.kiwix.org/> into *Library → Open folder*; image engine via
   *Images → Install image engine* (≈ 7 GB, needs Python 3.10–3.13 and an NVIDIA GPU).

## Honest limitations
- Windows only. Small local models are **not** on par with large cloud models: they make mistakes and hallucinate.
- Slow on modest hardware (GTX 1650 4 GB / 24 GB RAM: ~40 s per library answer; *Program* tasks take 30 s to several minutes).
- Program mode **runs model-generated code** in the folder you choose; it keeps backups and has *Undo*, but it is not sandboxed.
- Models, encyclopedias and the image engine are **not bundled** (tens of GB). Web mode relies on public services that may rate-limit.
- Details and measurements: [docs/LIMITES.md](docs/LIMITES.md) (Spanish).

## Support
CapiChad is free. If it helps you, you can support it on Ko-fi: **[ko-fi.com/capichad](https://ko-fi.com/capichad)** (also in the app: *Settings → Advanced → Support the project*, and the repository's **Sponsor** button).

## License
[AGPL-3.0-or-later](LICENSE) for CapiChad's code (see [NOTICE](NOTICE)); models and content have their own licenses —
see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Built by **Capibara Software**.
