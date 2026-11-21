# Narration (Kokoro TTS)

Local, no-API-key text-to-speech for devlog/playthrough voiceover, using the open-weight
Kokoro-82M model. Pairs with `tools/capture/` — capture gets the picture, this gets the voice.

## Setup (already done once in this repo)

```sh
brew install espeak-ng                        # system dependency for phonemization (already installed here)
/opt/homebrew/bin/python3.11 -m venv tools/narration/.venv
source tools/narration/.venv/bin/activate
pip install "kokoro>=0.3.4" soundfile
```

The repo's system Python is 3.9 (too old for Kokoro's dependencies), so this venv uses
Homebrew's python3.11 instead — keep using `tools/narration/.venv`, don't fight the system
Python. The venv isn't committed (add `tools/narration/.venv/` to `.gitignore` if it isn't
already ignored elsewhere).

On first run, Kokoro downloads its weights from `hexgrad/Kokoro-82M` on Hugging Face (a few
hundred MB, cached under `~/.cache/huggingface/hub/`) and a spaCy English model (`en_core_web_sm`,
~13 MB) for text processing — both one-time, need network access, add well under a minute to the
very first call. Every call after that is local and fast: ~2-3s of model load plus roughly
real-time synthesis (a 4s line took under a second to actually generate).

## Use

```sh
tools/narration/.venv/bin/python tools/narration/narrate.py "Some line of narration." out.wav [voice]
```

Defaults to the `af_heart` voice (American English) at 24kHz if you omit the voice argument.
Run with no arguments at all for a smoke test (writes `tools/narration/test-output.wav`).

## Voices

54 voices across several languages/accents, named `<lang><gender>_<name>` (e.g. `af_heart` =
American female "Heart", `bm_george` = British male "George"). Prefixes: `a` American, `b`
British, `e` Spanish, `f` French, `h` Hindi, `i` Italian, `j` Japanese, `p` Portuguese (Brazil),
`z` Mandarin. Full list:

```
af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky
am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa
bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis
ef_dora em_alex em_santa ff_siwis hf_alpha hf_beta hm_omega hm_psi if_sara im_nicola
jf_alpha jf_gongitsune jf_nezumi jf_tebukuro jm_kumo
pf_dora pm_alex pm_santa
zf_xiaobei zf_xiaoni zf_xiaoxiao zf_xiaoyi zm_yunjian zm_yunxi zm_yunxia zm_yunyang
```

For English dev-log narration, the `af_*`/`am_*` (American) or `bf_*`/`bm_*` (British) voices are
the relevant ones; only `af_heart` has actually been listened to and verified end-to-end here —
try a few short lines in a couple of voices before committing to one for a real narration pass.

## Gotchas

- `kokoro`'s dependency on `torch`/`transformers`/`spacy` makes this a heavy-ish install (~700 MB
  of packages) — that's why it's isolated in its own venv rather than added to any other tool's
  dependencies.
- Several harmless deprecation warnings print on every run (`torch.jit.script`, `weight_norm`,
  a macOS multiprocessing redirect notice) — ignorable, not a sign anything is broken.
- `KPipeline(lang_code="a")` in `narrate.py` is pinned to American English's phonemizer; pass a
  different `lang_code` (`"b"` British, `"j"` Japanese, etc.) if you use a voice from another
  language family, or non-English text will phonemize wrong even if a voice "plays."
