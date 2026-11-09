# Formal models

Small [Quint](https://quint-lang.org) models of client behaviour where
concurrency makes example-based tests unreliable: several requests in flight,
undo, retries, and a tab that can close at any point. A model states the
properties the product promises and lets a checker explore every interleaving
of the modelled steps.

A model checks the design, not the code. When you change the code a model
describes, update the model in the same change.

## `compose-send.qnt`: Send while a draft save is in flight

The composer mirrors its text to a mailbox draft every few seconds. Send used
to wait for any draft save already in flight, which held the composer open for
one or two provider round trips. The model compares four designs:

| Design | Send waits on the network | Result |
| --- | --- | --- |
| `waitForSave`: wait for the save, send through the draft | Yes | All properties hold |
| `naiveSend`: queue at once, send through the known draft | No | Sends stale text; leaves a draft behind |
| `reconcileSend`: queue at once; with a save in flight, send the composer's own content, and the device removes the draft once the save lands and the provider confirms delivery | No | Holds while the tab stays open; a tab closed before the save answers leaves the draft behind |
| `serverSend`: as `reconcileSend`, but the server removes the draft | No | All properties hold, even when the tab closes at any point |

`useComposeSend.ts`, `compose-draft.ts` and `compose-session-draft.ts`
implement `serverSend`. Each draft save records the compose session's draft
and then checks whether the session was sent; each delivered send that
replaced a saving draft marks the session sent and then removes the recorded
draft. Whichever of the two lands second sees the other's record, so the draft
is removed even when the save answers after the send, or never answers
because the tab closed. In Redis each side's write and read run as one script,
which is at least as strong as the separate steps the model checks.

Properties (see `safety`):

- the reply is delivered at most once;
- what is delivered is what the composer held when Send was pressed;
- once a delivered send settles, no draft for it remains;
- a composer restored by undo keeps a draft it can save to;
- a send the provider refuses leaves the user's draft in place;
- a session never has two drafts;
- a send never finds the draft it was sent through already gone.

These are safety properties. The model does not check progress (that every
send eventually arrives), and it does not model provider retries or uncertain
outcomes; duplicate protection across retries comes from the engine's
operation ids, which this model takes as given.

Sending through the draft is unsafe while a save is in flight because
`sendComposeDraft` writes the final text with `drafts.update` and then calls
`drafts.send`. A save already on its way can land between the two, and the
provider then sends the earlier text. `naiveSend` reproduces this.

## Running

```sh
# Random simulation of every design. Part of `pnpm test`; checks that the
# chosen designs hold and that the model still finds the known bugs.
pnpm test specs/compose-send.test.ts

# Exhaustive bounded check of the shipped design with Apalache (Java 17+).
pnpm -F inbox-zero-ai test:specs:verify
```

The script checks the shipped design with the tab allowed to close, to 16
steps. That bound reaches the stale-text bug in `naiveSend`
(`--main=naiveSend --invariant=deliversWhatWasSent`) and the draft left behind
when the save side skips its check, so it is deep enough for the races the
model is about.
