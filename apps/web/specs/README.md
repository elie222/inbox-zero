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
one or two provider round trips. The model compares three designs:

| Design | Send waits on the network | Result |
| --- | --- | --- |
| `waitForSave`: wait for the save, send through the draft | Yes | All properties hold |
| `naiveSend`: queue at once, send through the known draft | No | Sends stale text; leaves a draft behind |
| `reconcileSend`: queue at once; with a save in flight, send the composer's own content and remove the draft once the save lands and delivery is confirmed | No | All properties hold |

`useComposeSend.ts` implements `reconcileSend`. Properties (see `safety`):

- the reply is delivered at most once;
- what is delivered is what the composer held when Send was pressed;
- once a delivered send settles, no draft for it remains;
- a composer restored by undo keeps a draft it can save to;
- a session never has two drafts;
- a send that was not undone does not fail.

Sending through the draft is unsafe while a save is in flight because
`sendComposeDraft` writes the final text with `drafts.update` and then calls
`drafts.send`. A save already on its way can land between the two, and the
provider then sends the earlier text. `naiveSend` reproduces this.

Accepted trade-off (`reconcileSendTabCloses`): if the tab closes after Send but
before the in-flight save answers, the device never learns that draft's id, so
the delivered reply's draft stays in Drafts. Waiting for the save avoided this
by keeping the user on a spinner instead.

## Running

```sh
# Random simulation of every design. Part of `pnpm test`; checks that the
# chosen designs hold and that the model still finds the known bugs.
pnpm test specs/compose-send.test.ts

# Exhaustive bounded check of the shipped design with Apalache (Java 17+).
pnpm -F inbox-zero-ai test:specs:verify
```

Fourteen steps are enough to reach the stale-text bug in `naiveSend`, so the
bounded check is deep enough to exercise the races the model is about.
