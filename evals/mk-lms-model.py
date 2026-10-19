#!/usr/bin/env python3
"""Solves: serve an HF-cache MLX model in LM Studio (schema-enforcing MLX engine) with
thinking off, without copying weights or touching the HF cache.
Usage: mk-lms-model.py <hf repo like mlx-community/Qwen3.5-4B-MLX-4bit>
Makes ~/.lmstudio/models/evals-hf/<name>/ = symlinks to the snapshot files, except the
chat template, which is a copy with thinking switched off. Prints the LM Studio model key."""
import json, os, sys, glob
repo = sys.argv[1]
name = repo.split("/")[-1]
snap = sorted(glob.glob(os.path.expanduser(f"~/.cache/huggingface/hub/models--{repo.replace('/','--')}/snapshots/*")))[-1]
dest = os.path.expanduser(f"~/.lmstudio/models/evals-hf/{name}")
if os.path.islink(dest):
    os.remove(dest)  # never write through a symlink: it could point into the HF cache
os.makedirs(dest, exist_ok=True)
PRE = "{%- set enable_thinking = false %}{%- set thinking = false %}"
for f in os.listdir(snap):
    d = os.path.join(dest, f)
    if os.path.lexists(d): os.remove(d)
    if f == "chat_template.jinja":
        open(d, "w").write(PRE + open(os.path.join(snap, f)).read())
    elif f == "tokenizer_config.json" and not os.path.exists(os.path.join(snap, "chat_template.jinja")):
        cfg = json.load(open(os.path.join(snap, f)))
        if isinstance(cfg.get("chat_template"), str): cfg["chat_template"] = PRE + cfg["chat_template"]
        json.dump(cfg, open(d, "w"))
    else:
        os.symlink(os.path.realpath(os.path.join(snap, f)), d)
print(name)
