# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
"""Batch image generation on the local GPU (Stable Diffusion 1.5 LCM).

Runs in the image-generator environment (see tools/setup_local_imagegen.py),
NOT inside the app: `python generate_images.py --model-dir DIR --jobs jobs.json`.

jobs.json is a list of {"prompt", "negative_prompt", "width", "height", "seed",
"out"} and, optionally, "init_image" (a reference picture the new image is
derived from, img2img) with "strength" (0..1: how far to move away from it). Progress goes to stdout, one line per event, flushed immediately:

    READY                 model loaded, generating
    DONE <index>          image <index> written to its "out" path
    FAIL <index> <why>    that image could not be generated
    FINISHED              batch complete

Exit code 0 on a completed batch (even if some images failed), non-zero if the
generator itself could not start (no CUDA, model missing...).

GTX 16xx cards (Turing without tensor cores) return NaN from cuDNN's fp16
convolutions, which shows up as black images (measured on a GTX 1650: the
UNet's latents were all-NaN with cuDNN on, and the VAE's fp16 output too).
Turning cuDNN off avoids it but is 2-4x slower, so instead this keeps cuDNN on
and computes just the convolutions in fp32 (weights stay fp16 in VRAM), and
decodes with an fp32 VAE. Per 512x912 image, 4 steps: ~16 s, versus ~63 s with
cuDNN off."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def emit(*parts: object) -> None:
    print(*parts, flush=True)


def looks_blank(image) -> bool:
    """A flat image (all black/green from numerical overflow) instead of an error."""
    low, high = image.convert("L").getextrema()
    return high - low < 12


def fit_reference(path: str, width: int, height: int):
    """The reference picture on a width x height canvas: shown whole (never
    cropped, so a character keeps its head) over a soft gradient of its own
    colours. (A blurred copy of the picture left ghost shapes in the result.)"""
    from PIL import Image

    source = Image.open(path).convert("RGB")
    canvas = source.resize((4, 4), Image.BILINEAR).resize((width, height), Image.BICUBIC)
    scale = min(width / source.width, height / source.height)
    fitted = source.resize((max(1, round(source.width * scale)), max(1, round(source.height * scale))))
    canvas.paste(fitted, ((width - fitted.width) // 2, (height - fitted.height) // 2))
    return canvas


def make_conv_fp32(conv, functional, torch):
    def forward(x):
        bias = None if conv.bias is None else conv.bias.float()
        out = functional.conv2d(
            x.float(), conv.weight.float(), bias, conv.stride, conv.padding, conv.dilation, conv.groups
        )
        return out.to(x.dtype)

    return forward


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--steps", type=int, default=4)
    # LCM models work at guidance 1.0 (no classifier-free guidance): half the
    # compute of >1.0, at the cost of ignoring the negative prompt.
    parser.add_argument("--guidance", type=float, default=1.0)
    args = parser.parse_args()

    jobs = json.loads(Path(args.jobs).read_text(encoding="utf-8"))

    import torch
    import torch.nn.functional as functional
    from diffusers import LCMScheduler, StableDiffusionImg2ImgPipeline, StableDiffusionPipeline

    # Con tarjeta NVIDIA (CUDA) va en fp16 en la GPU; sin ella (AMD, Intel o solo procesador) corre en CPU en fp32:
    # mucho mas lento (minutos por imagen) pero funciona en cualquier equipo de 64 bits con ~6 GB de RAM libres.
    use_cuda = torch.cuda.is_available() and os.environ.get("CAPICHAD_FORCE_CPU") != "1"
    device = "cuda" if use_cuda else "cpu"
    dtype = torch.float16 if use_cuda else torch.float32
    emit("DEVICE", device)

    pipe = StableDiffusionPipeline.from_pretrained(
        args.model_dir, torch_dtype=dtype, safety_checker=None, requires_safety_checker=False
    ).to(device)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    pipe.set_progress_bar_config(disable=True)

    if use_cuda:      # GTX 16xx: convoluciones fp16 de cuDNN dan NaN; en CPU ya es fp32
        for module in pipe.unet.modules():
            if isinstance(module, torch.nn.Conv2d):
                module.forward = make_conv_fp32(module, functional, torch)
    # fp32 VAE, tiled: decoding a 512x900 image in one go needs more VRAM than
    # a 4 GB card has to spare next to the model.
    pipe.vae.to(torch.float32)
    pipe.vae.enable_tiling()

    # Shares the loaded weights with `pipe`: no extra VRAM.
    img2img = StableDiffusionImg2ImgPipeline(**pipe.components)
    img2img.set_progress_bar_config(disable=True)

    def encode_reference(job):
        """Reference -> scaled latents, encoded by the fp32 VAE (the pipeline
        would feed it fp16 pixels, which the fp32 VAE rejects)."""
        picture = fit_reference(job["init_image"], int(job["width"]), int(job["height"]))
        tensor = pipe.image_processor.preprocess(picture).to(device, torch.float32)
        with torch.no_grad():
            latents = pipe.vae.encode(tensor).latent_dist.mean
        return (latents * pipe.vae.config.scaling_factor).to(dtype)

    emit("READY")
    for index, job in enumerate(jobs):
        try:
            image = None
            for attempt in range(2):
                generator = torch.Generator(device).manual_seed(int(job["seed"]) + attempt * 1000)
                extra = {"negative_prompt": job["negative_prompt"]} if args.guidance > 1.0 and job.get("negative_prompt") else {}
                if job.get("init_image"):
                    strength = min(0.95, max(0.2, float(job.get("strength", 0.65))))
                    # img2img only runs steps*strength denoising steps: raise
                    # the step count so a few real steps remain.
                    latents = img2img(
                        prompt=job["prompt"],
                        image=encode_reference(job),
                        strength=strength,
                        num_inference_steps=max(args.steps, round(3 / strength)),
                        guidance_scale=args.guidance,
                        generator=generator,
                        output_type="latent",
                        **extra,
                    ).images
                else:
                    latents = pipe(
                        prompt=job["prompt"],
                        width=int(job["width"]),
                        height=int(job["height"]),
                        num_inference_steps=args.steps,
                        guidance_scale=args.guidance,
                        generator=generator,
                        output_type="latent",
                        **extra,
                    ).images
                if not torch.isfinite(latents).all():
                    continue
                with torch.no_grad():
                    decoded = pipe.vae.decode(
                        latents.to(torch.float32) / pipe.vae.config.scaling_factor
                    ).sample
                candidate = pipe.image_processor.postprocess(decoded, output_type="pil")[0]
                if not looks_blank(candidate):
                    image = candidate
                    break
            if image is None:
                emit("FAIL", index, "blank_image")
                continue
            out = Path(job["out"])
            out.parent.mkdir(parents=True, exist_ok=True)
            image.save(out, format="JPEG", quality=95)
            emit("DONE", index)
        except torch.cuda.OutOfMemoryError:
            emit("FAIL", index, "out_of_memory")
        except Exception as exc:  # noqa: BLE001 - report and keep going with the rest
            emit("FAIL", index, f"{type(exc).__name__}: {str(exc)[:160]}".replace("\n", " "))
        finally:
            if use_cuda:
                torch.cuda.empty_cache()

    emit("FINISHED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
