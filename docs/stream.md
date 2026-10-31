# Recording and playback

`/record` in any interactive session captures that one session's screen through a redaction pipeline — normalized rows, viewport patches, scrollback commits — into a local file. The footer shows `● REC` while recording; `/record` again stops it and prints the path.

## Recording

Recordings are written to `<tmpdir>/omp-recordings/<utc-time>-<session>.ompcast`, a JSON Lines file similar to asciicast: a header line `{"ompcast":1,"cols":…,"rows":…,"title":…,"createdAt":…}`, then one `[ms, frame]` line per screen frame (`reset`, `history`, `resize`, `viewport`, `patch`).

### Playback

```
omp play                      # newest recording
omp play <file> -s 2 -i 1     # 2× speed, pauses capped at 1s
```

Playback runs on the normal screen: the recorded viewport occupies the bottom of the terminal and recorded scrollback scrolls into your terminal's scrollback, so the output stays after playback ends. Space pauses/resumes; `q`, Esc, or Ctrl-C quits.

## What goes into the file

Only terminal rows. The session process:

1. Takes the rows the TUI just painted (scrollback commits and the live viewport).
2. Strips every escape except text styling (SGR) and hyperlinks (OSC 8); inline images become `[image]`.
3. **Redacts** the row (below).
4. Diffs against the last sent viewport and records row patches — never session entries, prompts, tool arguments, or file contents as data.

### Redaction

Redaction is irreversible and intentionally over-matches. Any match replaces the run with `••••••`; a row with a match is recorded unstyled. Sources:

- Values of environment variables whose names look secret (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*PASSWORD*`, …) and every value loaded from a `.env` file for the directory, regardless of name (8+ chars).
- `.omp/secrets.yml` and `~/.omp/agent/secrets.yml` entries.
- Credential shapes (GitHub/GitLab/OpenAI/Anthropic/AWS/Slack/Stripe/npm/HF tokens, JWTs, PEM blocks, `Bearer …`). Vendor prefixes are matched **without** a length gate so a token is masked while it is still being typed or streamed character by character.
- `NAME=value`, `NAME: value`, `"NAME": "value"` where `NAME` looks secret — the value is masked (covers `read .env` and config files on screen).
- Passwords in connection URLs (`scheme://user:password@host`).
- `stream.redactPatterns`.

Known plain values are also matched by prefix (6+ characters) so a partially typed secret is masked before it is complete.

Redaction cannot know about secrets it has never seen: a token pasted from elsewhere that matches no shape and no configured value is recorded. Use `stream.redactPatterns` or `secrets.yml` for anything unusual.
