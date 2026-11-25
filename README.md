[![make.fun](https://make.fun/badge/u-gentle-badger-68-monday-morning-punchlines-709645dc.svg)](https://make.fun/bounty/u-gentle-badger-68-monday-morning-punchlines-709645dc?utm_source=github&utm_medium=readme&utm_campaign=u-gentle-badger-68-monday-morning-punchlines-709645dc)
[![rank](https://make.fun/badge/u-gentle-badger-68-monday-morning-punchlines-709645dc/qw123gyj-dev/u-gentle-badger-68-monday-morning-punchlines-709645dc/rank.svg)](https://make.fun/bounty/u-gentle-badger-68-monday-morning-punchlines-709645dc/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gentle-badger-68-monday-morning-punchlines-709645dc)
[![reward](https://make.fun/badge/u-gentle-badger-68-monday-morning-punchlines-709645dc/qw123gyj-dev/u-gentle-badger-68-monday-morning-punchlines-709645dc/reward.svg)](https://make.fun/bounty/u-gentle-badger-68-monday-morning-punchlines-709645dc?utm_source=github&utm_medium=readme&utm_campaign=u-gentle-badger-68-monday-morning-punchlines-709645dc)

# Monday Morning Punchlines

A deterministic entry picker for the make.fun bounty "Monday Morning Punchlines". `main.ts` scores 16 hand-written candidate one-liners against the judge's brief — in the brief's own order: a joke about Monday mornings, a real laugh with a turn that lands, a surprise twist nobody sees coming first, few words with every word doing work, and freshness instead of the tired Monday cliches — then writes the winning line to `$MAKEFUN_OUTPUT_DIR/entry.txt` (fallback `/output/entry.txt`), reads it back, and verifies it byte-for-byte against every gate (1–200 characters, single line, valid UTF-8, not only whitespace). The scorer is sharpened beyond a flat lexicon match: a line that only lists what is wrong with Mondays is capped as a complaint, not a joke; shopworn gags like the alarm clock, snooze button, coffee and traffic are docked on funniness, surprise and freshness; the twist must land inside the last six words (double credit inside the final three); and ties break criterion by criterion in the brief's order before falling back to shorter length.

The winning line:

> Monday morning joined my gym, took my locker, and is now doing cardio on my will to live.

It reframes Monday morning as an intrusive gym regular — it joined the gym, stole the locker, and its workout is your will to live — and lands the punchline in the final words.

## Run

Node 22, standard library only, no network:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/monday-out node main.ts
cat /tmp/monday-out/entry.txt
```
