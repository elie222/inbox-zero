import { describe, expect, it } from "vitest";
import { getSlackChannelSelectionState } from "./ConnectedAppsSection";

describe("getSlackChannelSelectionState", () => {
  it("shows selector by default when no channel is linked", () => {
    const result = getSlackChannelSelectionState({
      channelId: null,
      selectingTarget: true,
      isLoadingTargets: false,
      hasTargetLoadError: false,
    });

    expect(result).toEqual({
      showChannelSelector: true,
      showCurrentChannel: false,
      showInviteHint: true,
      showErrorHint: false,
      showCancelSelection: false,
    });
  });

  it("shows linked channel when not selecting", () => {
    const result = getSlackChannelSelectionState({
      channelId: "C123",
      selectingTarget: false,
      isLoadingTargets: false,
      hasTargetLoadError: false,
    });

    expect(result).toEqual({
      showChannelSelector: false,
      showCurrentChannel: true,
      showInviteHint: false,
      showErrorHint: false,
      showCancelSelection: false,
    });
  });

  it("shows selector while changing an existing channel", () => {
    const result = getSlackChannelSelectionState({
      channelId: "C123",
      selectingTarget: true,
      isLoadingTargets: false,
      hasTargetLoadError: false,
    });

    expect(result).toEqual({
      showChannelSelector: true,
      showCurrentChannel: false,
      showInviteHint: true,
      showErrorHint: false,
      showCancelSelection: true,
    });
  });

  it("hides invite hint while loading targets", () => {
    const result = getSlackChannelSelectionState({
      channelId: null,
      selectingTarget: true,
      isLoadingTargets: true,
      hasTargetLoadError: false,
    });

    expect(result.showInviteHint).toBe(false);
    expect(result.showErrorHint).toBe(false);
    expect(result.showCancelSelection).toBe(false);
  });

  it("hides invite hint when target loading fails", () => {
    const result = getSlackChannelSelectionState({
      channelId: null,
      selectingTarget: true,
      isLoadingTargets: false,
      hasTargetLoadError: true,
    });

    expect(result.showInviteHint).toBe(false);
    expect(result.showErrorHint).toBe(true);
    expect(result.showCancelSelection).toBe(false);
  });

  it("allows cancel action when editing existing channel and loading fails", () => {
    const result = getSlackChannelSelectionState({
      channelId: "C123",
      selectingTarget: true,
      isLoadingTargets: false,
      hasTargetLoadError: true,
    });

    expect(result.showErrorHint).toBe(true);
    expect(result.showCancelSelection).toBe(true);
  });
});
