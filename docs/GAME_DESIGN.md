# Game design bar

Game Night is a game platform, not a collection of technically-correct quizzes.
Engineering quality and *game* quality are both requirements; neither excuses the
other.

## The bar

Every game must have a defensible answer to each of these. "The mechanic works"
is not an answer to any of them.

- Is the core mechanic actually fun?
- Does it create tension, curiosity, satisfaction, or surprise?
- Does it feel meaningfully different from the other games?
- Is there a reason to play another round?
- Does difficulty progress intentionally?
- Are there interesting decisions, or is it repetitive clicking?
- Can players improve through understanding, or only by memorising answers?
- Are mistakes informative and satisfying rather than merely punishing?
- Does it have its own identity and personality?
- Could someone enjoy 10–20 minutes of it?

For content-heavy games, **content quality counts as much as the code**. No
filler. Prefer clever, surprising, educational, memorable scenarios over volume.

## Definition template

Every new game answers all ten before implementation begins.

```
Core skill tested
Core gameplay loop
What makes it fun
What makes it difficult
How difficulty progresses
What makes it replayable
What makes it different from existing games
How scoring creates tension or satisfaction
What content makes it interesting
Visual identity
```

---

## Code Blitz — filled in

| | |
|---|---|
| **Core skill** | Recall and fast pattern-recognition of JavaScript semantics |
| **Loop** | Read a snippet → pick 1 of 4 → immediate feedback → next, ×10 |
| **Fun** | Speed. The 30s clock and the decaying bonus make answering *now* feel urgent |
| **Difficulty** | Time pressure, not conceptual depth |
| **Progression** | **None.** Ten flat-random questions |
| **Replayable** | Different random draw each game; chasing a higher score |
| **Different** | It is the reflex game |
| **Scoring tension** | 100 + up to 50 decaying by the second. Answer fast or lose the bonus |
| **Content** | Short, unambiguous snippets with a single surprising result |
| **Visual identity** | Violet accent, a draining timer bar, keyboard 1–4 |

### Honest weaknesses

Measured against the bar above, Code Blitz falls short in three places:

1. **Interesting decisions: weak.** The only real decision is speed vs certainty,
   and speed nearly always wins, because a wrong answer costs no more than a slow
   one. There is no wager, no risk, no reason to hesitate.
2. **Understanding vs memorising: weak at current content depth.** With a small
   question bank a regular player memorises the pool rather than learning the
   language. This is a *content volume* problem, and it is what the external
   provider import exists to address.
3. **Mistakes are barely informative.** The correct answer flashes for 1400ms and
   auto-advances — already logged in `BACKLOG.md` as needing a longer dwell or an
   explicit Next.

Worth fixing in that order. (1) needs a mechanic change and is the most
interesting; (2) needs content; (3) is a small UX change.

---

## Flush — filled in

| | |
|---|---|
| **Core skill** | Reasoning about the JavaScript event loop: call stack, microtask queue, macrotask queue |
| **Loop** | Read a snippet → click output tiles in predicted order → each correct placement banks escalating points → one mistake ends the round, ×5 |
| **Fun** | Press-your-luck. Every placement past the first risks the completion multiplier on everything already banked |
| **Difficulty** | Conceptual depth, not time. 60s is a ceiling, not a pressure |
| **Progression** | Rounds deal in **ascending `difficulty`** (1→5), so a session ramps |
| **Replayable** | A large answer space (`n!` orderings), a difficulty ladder, and a genuinely learnable model — you get better by understanding the queue, not by memorising |
| **Different** | Sequence-building rather than single-select; partial credit rather than binary; rewards accuracy rather than speed. **No speed bonus at all** |
| **Scoring tension** | Escalating placements (10, 20, 30…) plus a 2× completion multiplier. A wrong 5th guess forfeits 200, not 50 |
| **Content** | Puzzles where the *surprise* is the teaching: a synchronous Promise executor, a `.catch` that never fires, a promise that never settles, two chains interleaving FIFO |
| **Visual identity** | Amber accent (warmer, slower than Blitz's violet). Tiles animate into numbered slots; the sequence flushes in order on resolve, mirroring the queue draining |

### Why the distractors matter

Two snippets include outputs that never print. `isPlacementCorrect(null, n)` is
always false, so placing one is a mistake at any index.

This is the single best thing about the game: **recognising that a callback never
fires is a different skill from ordering the ones that do**, and it is exactly the
mistake that bites people in real code. It also makes mistakes informative — you
learn *why* the tile was a trap, not just that you were wrong.

### Where Flush is still unproven

The mechanic is designed and its scoring is tested, but nobody has played it.
The open questions are whether one-mistake-ends-the-round feels tense or
punishing, and whether 5 rounds is the right session length. Both are cheap to
tune: `FLUSH_ROUNDS_PER_SESSION` and the multiplier are single constants.
