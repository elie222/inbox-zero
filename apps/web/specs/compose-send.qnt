// -*- mode: Bluespec; -*-
/**
 * Sending a reply while its mailbox draft autosave may still be in flight.
 *
 * A composer mirrors its text to a mailbox draft (Gmail/Outlook) every few
 * seconds. Send must not wait for that network round trip, yet the mailbox
 * must end up with exactly one delivered copy of exactly what the user sent,
 * and no draft left behind. Undo must hand the composer back with a draft it
 * can keep saving to.
 *
 * MODE selects the design under check:
 *   "wait"      Send waits for the in-flight draft save, then sends through
 *               the draft. Correct, but the user watches a spinner.
 *   "naive"     Send queues at once and sends through whatever draft it
 *               knows about. Fast, and wrong (see README).
 *   "reconcile" Send queues at once. With no save in flight it sends through
 *               the known draft; with one in flight it sends its own content
 *               and the device removes the draft once the save lands and
 *               delivery is confirmed. Undo keeps the draft.
 *   "server"    As "reconcile", but the server removes the draft, so a tab
 *               that closes cannot leave it behind. Each draft save records
 *               the session's draft and then checks whether the session was
 *               sent; each delivered send marks the session sent and then
 *               removes the recorded draft. Whichever lands second sees the
 *               other's record.
 *
 * Mailbox calls are modelled as a request that is applied by the provider at
 * some point and answered later, or never answered if the tab closes.
 */
module composeSend {
  const MODE: str
  const TAB_CAN_CLOSE: bool

  pure val NONE = 0
  pure val MAX_EDITS = 3
  pure val MAX_SENDS = 2

  // --- state ---------------------------------------------------------------

  // Text version in the composer and the last version saved to the mailbox.
  var typed: int
  var saved: int
  // "open" | "waiting" (Send pressed, waiting on a save) | "closed"
  var composer: str
  var autosavePaused: bool
  // Draft id the device has recorded for this compose session.
  var knownDraft: int

  // The single draft save slot. Saves for one session are serialized, even
  // across a composer that unmounts and is restored by undo.
  // phase: "idle" | "sent" (request on its way) | "applied" (provider wrote it)
  var save: { phase: str, create: bool, content: int, target: int, newId: int }

  // Provider mailbox: draft id -> content, and delivered message contents.
  var drafts: int -> int
  var nextDraftId: int
  var delivered: List[int]

  // The send operation. status: "none" | "held" | "dispatching" | "delivered"
  // | "cancelled" | "failed" (its draft was gone) | "rejected" (the provider
  // refused it). viaDraft = NONE means messages.send.
  var send: { status: str, viaDraft: int, content: int, stage: str, attempts: int }
  // Whether this send must remove the session's draft once delivered.
  var cleanupDraft: bool
  // phase: "idle" | "sent"
  var discard: { phase: str, target: int }
  // Whether the device removed the session's draft because of this send.
  var draftRemovedForSend: bool
  var tabOpen: bool
  // Server records ("server" mode): the session's draft, whether the session
  // has been sent, and the delivered send's cleanup ("none" | "marked" |
  // "done").
  var sessionDraft: int
  var sessionSent: bool
  var serverCleanup: str

  // --- helpers -------------------------------------------------------------

  pure def setPhase(r, p) = r.with("phase", p)
  pure def removeDraft(m: int -> int, id: int): int -> int =
    m.keys().exclude(Set(id)).mapBy(k => m.get(k))

  val saveInFlight = save.phase != "idle"

  // --- user and client actions ---------------------------------------------

  action Type = all {
    tabOpen,
    composer == "open",
    typed < MAX_EDITS,
    typed' = typed + 1,
    unchangedExcept_typed,
  }

  val canStartSave = and {
    tabOpen,
    composer != "closed",
    not(autosavePaused),
    save.phase == "idle",
    saved != typed,
  }
  action StartSave = all {
    canStartSave,
    // createProviderDraft re-reads the stored id, so a restored composer
    // reuses a draft its predecessor created.
    save' = {
      phase: "sent",
      create: knownDraft == NONE,
      content: typed,
      target: knownDraft,
      newId: NONE,
    },
    unchangedExcept_save,
  }

  // The provider applies a save whether or not anyone is still listening.
  val canApplySave = save.phase == "sent"
  action ApplySave =
    if (save.create) all {
      canApplySave,
      drafts' = drafts.put(nextDraftId, save.content),
      save' = save.setPhase("applied").with("newId", nextDraftId),
      nextDraftId' = nextDraftId + 1,
      unchangedExcept_drafts_save_nextDraftId,
    } else all {
      canApplySave,
      // An update to a draft that was already sent or deleted reports
      // "missing" and writes nothing.
      drafts' = if (drafts.keys().contains(save.target))
          drafts.set(save.target, save.content)
        else drafts,
      save' = save.setPhase("applied"),
      nextDraftId' = nextDraftId,
      unchangedExcept_drafts_save_nextDraftId,
    }

  // In "server" mode the save's server handler records the session's draft
  // and checks the sent flag before it answers.
  val answeredPhase = if (MODE == "server") "answered" else "applied"

  val canRecordSessionDraft = MODE == "server" and save.phase == "applied"
  action RecordSessionDraft = all {
    canRecordSessionDraft,
    sessionDraft' = if (save.create) save.newId else save.target,
    save' = save.setPhase("recorded"),
    unchangedExcept_save_sessionDraft,
  }

  val canCheckSessionSent = MODE == "server" and save.phase == "recorded"
  action CheckSessionSent =
    if (sessionSent and drafts.keys().contains(sessionDraft)) all {
      canCheckSessionSent,
      drafts' = removeDraft(drafts, sessionDraft),
      draftRemovedForSend' = true,
      save' = save.setPhase("answered"),
      unchangedExcept_drafts_draftRemovedForSend_save,
    } else all {
      canCheckSessionSent,
      drafts' = drafts,
      draftRemovedForSend' = draftRemovedForSend,
      save' = save.setPhase("answered"),
      unchangedExcept_drafts_draftRemovedForSend_save,
    }

  val canReceiveSave = save.phase == answeredPhase and tabOpen
  action ReceiveSave = all {
    canReceiveSave,
    knownDraft' = if (save.create) save.newId else knownDraft,
    saved' = save.content,
    save' = save.setPhase("idle"),
    unchangedExcept_knownDraft_saved_save,
  }

  // With the tab gone nobody records the answer.
  val canLoseSave = save.phase == answeredPhase and not(tabOpen)
  action LoseSave = all {
    canLoseSave,
    save' = save.setPhase("idle"),
    unchangedExcept_save,
  }

  pure def queuedSend(viaDraft: int, content: int, attempts: int): {
    status: str, viaDraft: int, content: int, stage: str, attempts: int
  } = { status: "held", viaDraft: viaDraft, content: content, stage: "update", attempts: attempts + 1 }

  val canClickSend = and {
    tabOpen,
    composer == "open",
    send.attempts < MAX_SENDS,
    send.status.in(Set("none", "cancelled")),
  }
  action ClickSend =
    if (MODE == "wait" and saveInFlight) all {
      canClickSend,
      composer' = "waiting",
      autosavePaused' = true,
      unchangedExcept_composer_autosavePaused,
    } else if (MODE.in(Set("reconcile", "server")) and saveInFlight) all {
      canClickSend,
      composer' = "closed",
      autosavePaused' = true,
      send' = queuedSend(NONE, typed, send.attempts),
      cleanupDraft' = true,
      unchangedExcept_composer_autosavePaused_send_cleanupDraft,
    } else all {
      canClickSend,
      composer' = "closed",
      autosavePaused' = true,
      send' = queuedSend(knownDraft, typed, send.attempts),
      cleanupDraft' = false,
      unchangedExcept_composer_autosavePaused_send_cleanupDraft,
    }

  val canQueueAfterWait = composer == "waiting" and save.phase == "idle" and tabOpen
  action QueueAfterWait = all {
    canQueueAfterWait,
    composer' = "closed",
    send' = queuedSend(knownDraft, typed, send.attempts),
    cleanupDraft' = false,
    unchangedExcept_composer_send_cleanupDraft,
  }

  val canUndo = send.status == "held" and tabOpen
  action Undo = all {
    canUndo,
    send' = send.with("status", "cancelled"),
    composer' = "open",
    autosavePaused' = false,
    cleanupDraft' = false,
    unchangedExcept_composer_autosavePaused_send_cleanupDraft,
  }

  // The device removes a draft that a send replaced, once its save has
  // landed and the provider confirmed delivery. A send that is still pending
  // keeps being watched until it ends.
  val canDiscard = and {
    MODE == "reconcile",
    tabOpen,
    cleanupDraft,
    send.status == "delivered",
    save.phase == "idle",
    discard.phase == "idle",
    knownDraft != NONE,
  }
  action Discard = all {
    canDiscard,
    discard' = { phase: "sent", target: knownDraft },
    knownDraft' = NONE,
    cleanupDraft' = false,
    draftRemovedForSend' = true,
    unchangedExcept_discard_knownDraft_cleanupDraft,
  }

  // Nothing left to remove: the save never created a draft.
  val canFinishCleanup = and {
    MODE == "reconcile",
    tabOpen, cleanupDraft, send.status == "delivered",
    save.phase == "idle", knownDraft == NONE,
  }
  action FinishCleanup = all {
    canFinishCleanup,
    cleanupDraft' = false,
    unchangedExcept_cleanupDraft,
  }

  // A draft the send itself consumed is no longer the session's draft.
  val canForgetSentDraft = and {
    tabOpen,
    send.status == "delivered",
    send.viaDraft != NONE,
    knownDraft == send.viaDraft,
  }
  action ForgetSentDraft = all {
    canForgetSentDraft,
    knownDraft' = NONE,
    unchangedExcept_knownDraft,
  }

  val canCloseTab = TAB_CAN_CLOSE and tabOpen
  action CloseTab = all {
    canCloseTab,
    tabOpen' = false,
    composer' = "closed",
    unchangedExcept_tabOpen_composer,
  }

  // --- provider actions ----------------------------------------------------

  val canApplyDiscard = discard.phase == "sent"
  action ApplyDiscard = all {
    canApplyDiscard,
    drafts' = removeDraft(drafts, discard.target),
    discard' = discard.setPhase("idle"),
    unchangedExcept_drafts_discard,
  }

  // After delivering a send that replaced a saving draft, the server marks
  // the session sent and then removes whatever draft the session recorded.
  val canMarkSessionSent = and {
    MODE == "server",
    cleanupDraft,
    send.status == "delivered",
    serverCleanup == "none",
  }
  action MarkSessionSent = all {
    canMarkSessionSent,
    sessionSent' = true,
    serverCleanup' = "marked",
    unchangedExcept_sessionSent_serverCleanup,
  }

  val canRemoveSessionDraft = serverCleanup == "marked"
  action RemoveSessionDraft =
    if (drafts.keys().contains(sessionDraft)) all {
      canRemoveSessionDraft,
      drafts' = removeDraft(drafts, sessionDraft),
      draftRemovedForSend' = true,
      serverCleanup' = "done",
      unchangedExcept_drafts_draftRemovedForSend_serverCleanup,
    } else all {
      canRemoveSessionDraft,
      drafts' = drafts,
      draftRemovedForSend' = draftRemovedForSend,
      serverCleanup' = "done",
      unchangedExcept_drafts_draftRemovedForSend_serverCleanup,
    }

  // The undo hold ends at a time unrelated to any save in flight.
  val canEndHold = send.status == "held"
  action EndHold = all {
    canEndHold,
    send' = send.with("status", "dispatching"),
    unchangedExcept_send,
  }

  // messages.send: the operation's own content.
  val canSendMessage = send.status == "dispatching" and send.viaDraft == NONE
  action SendMessage = all {
    canSendMessage,
    delivered' = delivered.append(send.content),
    send' = send.with("status", "delivered"),
    unchangedExcept_delivered_send,
  }

  // The provider can refuse a send, for example for an invalid recipient.
  action RejectSend = all {
    canSendMessage,
    send' = send.with("status", "rejected"),
    unchangedExcept_send,
  }

  // The provider can also refuse drafts.send; the draft then stays put.
  action RejectSendDraft = all {
    canSendDraft,
    send' = send.with("status", "rejected"),
    unchangedExcept_send,
  }

  // sendComposeDraft: drafts.update with the final content, then drafts.send.
  val canUpdateDraftForSend = and {
    send.status == "dispatching",
    send.viaDraft != NONE,
    send.stage == "update",
  }
  action UpdateDraftForSend =
    if (drafts.keys().contains(send.viaDraft)) all {
      canUpdateDraftForSend,
      drafts' = drafts.set(send.viaDraft, send.content),
      send' = send.with("stage", "send"),
      unchangedExcept_drafts_send,
    } else all {
      canUpdateDraftForSend,
      send' = send.with("status", "failed"),
      drafts' = drafts,
      unchangedExcept_drafts_send,
    }

  val canSendDraft = and {
    send.status == "dispatching",
    send.viaDraft != NONE,
    send.stage == "send",
  }
  action SendDraft =
    if (drafts.keys().contains(send.viaDraft)) all {
      canSendDraft,
      delivered' = delivered.append(drafts.get(send.viaDraft)),
      drafts' = removeDraft(drafts, send.viaDraft),
      send' = send.with("status", "delivered"),
      unchangedExcept_delivered_drafts_send,
    } else all {
      canSendDraft,
      delivered' = delivered,
      drafts' = drafts,
      send' = send.with("status", "failed"),
      unchangedExcept_delivered_drafts_send,
    }

  // --- system --------------------------------------------------------------

  action init = all {
    typed' = 1,
    saved' = 0,
    composer' = "open",
    autosavePaused' = false,
    knownDraft' = NONE,
    save' = { phase: "idle", create: false, content: 0, target: NONE, newId: NONE },
    drafts' = Map(),
    nextDraftId' = 1,
    delivered' = List(),
    send' = { status: "none", viaDraft: NONE, content: 0, stage: "update", attempts: 0 },
    cleanupDraft' = false,
    discard' = { phase: "idle", target: NONE },
    tabOpen' = true,
    draftRemovedForSend' = false,
    sessionDraft' = NONE,
    sessionSent' = false,
    serverCleanup' = "none",
  }

  action step = any {
    Type, StartSave, ApplySave, RecordSessionDraft, CheckSessionSent,
    ReceiveSave, LoseSave, MarkSessionSent, RemoveSessionDraft,
    ClickSend, QueueAfterWait, Undo, Discard, FinishCleanup, ForgetSentDraft,
    CloseTab, ApplyDiscard, EndHold, SendMessage, RejectSend,
    UpdateDraftForSend, SendDraft, RejectSendDraft,
  }

  // Nothing but the user can move the system: every request has been
  // answered and every pending cleanup has run.
  val quiescent = not(or {
    canStartSave, canApplySave, canRecordSessionDraft, canCheckSessionSent,
    canReceiveSave, canLoseSave, canMarkSessionSent, canRemoveSessionDraft,
    canQueueAfterWait, canDiscard, canFinishCleanup, canForgetSentDraft,
    canApplyDiscard, canEndHold, canSendMessage, canUpdateDraftForSend,
    canSendDraft,
  })

  // --- properties ----------------------------------------------------------

  /// The recipient never gets the reply twice.
  val noDuplicateDelivery = delivered.length() <= 1

  /// What arrives is exactly what was in the composer when Send was pressed.
  val deliversWhatWasSent =
    delivered.indices().forall(i => delivered[i] == send.content)

  /// Once a sent reply has settled, no copy of it lingers in Drafts.
  val noDraftLeftAfterSend =
    (quiescent and send.status == "delivered") implies drafts.keys() == Set()

  /// A composer restored by undo can keep saving to the draft it knows.
  val restoredComposerKeepsItsDraft =
    (composer == "open" and save.phase == "idle" and knownDraft != NONE)
      implies drafts.keys().contains(knownDraft)

  /// A send the provider refused leaves the user's draft in place.
  val rejectedSendKeepsItsDraft =
    send.status == "rejected" implies not(draftRemovedForSend)

  /// A session never ends up with two mailbox drafts.
  val atMostOneDraft = drafts.keys().size() <= 1

  /// A send never finds the draft it was sent through already gone.
  val sendNeverLosesItsDraft = send.status != "failed"

  val safety = and {
    noDuplicateDelivery,
    deliversWhatWasSent,
    noDraftLeftAfterSend,
    restoredComposerKeepsItsDraft,
    rejectedSendKeepsItsDraft,
    atMostOneDraft,
    sendNeverLosesItsDraft,
  }

  // --- frame conditions ----------------------------------------------------

  action keep_typed = typed' = typed
  action keep_saved = saved' = saved
  action keep_composer = composer' = composer
  action keep_autosavePaused = autosavePaused' = autosavePaused
  action keep_knownDraft = knownDraft' = knownDraft
  action keep_save = save' = save
  action keep_drafts = drafts' = drafts
  action keep_nextDraftId = nextDraftId' = nextDraftId
  action keep_delivered = delivered' = delivered
  action keep_send = send' = send
  action keep_cleanupDraft = cleanupDraft' = cleanupDraft
  action keep_discard = discard' = discard
  action keep_tabOpen = tabOpen' = tabOpen
  action keep_draftRemovedForSend = draftRemovedForSend' = draftRemovedForSend
  action keep_sessionDraft = sessionDraft' = sessionDraft
  action keep_sessionSent = sessionSent' = sessionSent
  action keep_serverCleanup = serverCleanup' = serverCleanup

  action unchangedExcept_typed = all {
    keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft, keep_save,
    keep_drafts, keep_nextDraftId, keep_delivered, keep_send, keep_cleanupDraft,
    keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_save = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_drafts, keep_nextDraftId, keep_delivered, keep_send, keep_cleanupDraft,
    keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_drafts_save_nextDraftId = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_delivered, keep_send, keep_cleanupDraft, keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_knownDraft_saved_save = all {
    keep_typed, keep_composer, keep_autosavePaused, keep_drafts, keep_nextDraftId,
    keep_delivered, keep_send, keep_cleanupDraft, keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_composer_autosavePaused = all {
    keep_typed, keep_saved, keep_knownDraft, keep_save, keep_drafts,
    keep_nextDraftId, keep_delivered, keep_send, keep_cleanupDraft, keep_discard,
    keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_composer_autosavePaused_send_cleanupDraft = all {
    keep_typed, keep_saved, keep_knownDraft, keep_save, keep_drafts,
    keep_nextDraftId, keep_delivered, keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_composer_send_cleanupDraft = all {
    keep_typed, keep_saved, keep_autosavePaused, keep_knownDraft, keep_save,
    keep_drafts, keep_nextDraftId, keep_delivered, keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_discard_knownDraft_cleanupDraft = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_save,
    keep_drafts, keep_nextDraftId, keep_delivered, keep_send, keep_tabOpen,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_cleanupDraft = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_save, keep_drafts, keep_nextDraftId, keep_delivered, keep_send,
    keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_knownDraft = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_save,
    keep_drafts, keep_nextDraftId, keep_delivered, keep_send, keep_cleanupDraft,
    keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_tabOpen_composer = all {
    keep_typed, keep_saved, keep_autosavePaused, keep_knownDraft, keep_save,
    keep_drafts, keep_nextDraftId, keep_delivered, keep_send, keep_cleanupDraft,
    keep_discard,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_drafts_discard = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_save, keep_nextDraftId, keep_delivered, keep_send, keep_cleanupDraft,
    keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_send = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_save, keep_drafts, keep_nextDraftId, keep_delivered, keep_cleanupDraft,
    keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_delivered_send = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_save, keep_drafts, keep_nextDraftId, keep_cleanupDraft, keep_discard,
    keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_drafts_send = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_save, keep_nextDraftId, keep_delivered, keep_cleanupDraft, keep_discard,
    keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_delivered_drafts_send = all {
    keep_typed, keep_saved, keep_composer, keep_autosavePaused, keep_knownDraft,
    keep_save, keep_nextDraftId, keep_cleanupDraft, keep_discard, keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }

  action unchangedExcept_save_sessionDraft = all {
    keep_typed,
    keep_saved,
    keep_composer,
    keep_autosavePaused,
    keep_knownDraft,
    keep_drafts,
    keep_nextDraftId,
    keep_delivered,
    keep_send,
    keep_cleanupDraft,
    keep_discard,
    keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_drafts_draftRemovedForSend_save = all {
    keep_typed,
    keep_saved,
    keep_composer,
    keep_autosavePaused,
    keep_knownDraft,
    keep_nextDraftId,
    keep_delivered,
    keep_send,
    keep_cleanupDraft,
    keep_discard,
    keep_tabOpen,
    keep_sessionDraft,
    keep_sessionSent,
    keep_serverCleanup,
  }
  action unchangedExcept_sessionSent_serverCleanup = all {
    keep_typed,
    keep_saved,
    keep_composer,
    keep_autosavePaused,
    keep_knownDraft,
    keep_save,
    keep_drafts,
    keep_nextDraftId,
    keep_delivered,
    keep_send,
    keep_cleanupDraft,
    keep_discard,
    keep_tabOpen,
    keep_draftRemovedForSend,
    keep_sessionDraft,
  }
  action unchangedExcept_drafts_draftRemovedForSend_serverCleanup = all {
    keep_typed,
    keep_saved,
    keep_composer,
    keep_autosavePaused,
    keep_knownDraft,
    keep_save,
    keep_nextDraftId,
    keep_delivered,
    keep_send,
    keep_cleanupDraft,
    keep_discard,
    keep_tabOpen,
    keep_sessionDraft,
    keep_sessionSent,
  }
}

module waitForSave {
  import composeSend(MODE = "wait", TAB_CAN_CLOSE = false).*
}

module naiveSend {
  import composeSend(MODE = "naive", TAB_CAN_CLOSE = false).*
}

module reconcileSend {
  import composeSend(MODE = "reconcile", TAB_CAN_CLOSE = false).*
}

module reconcileSendTabCloses {
  import composeSend(MODE = "reconcile", TAB_CAN_CLOSE = true).*
}

module serverSend {
  import composeSend(MODE = "server", TAB_CAN_CLOSE = false).*
}

module serverSendTabCloses {
  import composeSend(MODE = "server", TAB_CAN_CLOSE = true).*
}
