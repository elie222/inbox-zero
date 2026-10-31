"use client";

import { MailAccountSwitcherTrigger } from "@inboxzero/mail-ui/MailAccountSwitcherTrigger";
import {
  memo,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import Link from "next/link";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { AllAccountsSelectionDialog } from "@/app/(app)/[emailAccountId]/mail/AllAccountsSelectionDialog";
import { ProfileImage } from "@/components/ProfileImage";
import { Kbd } from "@/components/Kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RailTooltip } from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAccounts } from "@/hooks/useAccounts";
import {
  formatShortcutKeys,
  getShortcut,
  getShortcutHint,
} from "@/lib/shortcuts/registry";
import { getMailAccountUrl } from "@/app/(app)/[emailAccountId]/mail/mail-account-url";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { reorderEmailAccountsAction } from "@/utils/actions/all-accounts";
import { getActionErrorMessage } from "@/utils/error";
import { cn } from "@/utils";
import { useDragReorder } from "./use-drag-reorder";

export const MailAccountSwitcher = memo(function MailAccountSwitcher({
  isAllAccounts,
  isDesktopApp,
  onSelectAccount,
  onSelectAll,
  collapsed = false,
}: {
  isAllAccounts: boolean;
  isDesktopApp: boolean;
  onSelectAccount: (accountId: string) => void;
  onSelectAll: () => void;
  /** Icon-only rail: the trigger shrinks to the account avatar. */
  collapsed?: boolean;
}) {
  const { data, mutate } = useAccounts();
  const { emailAccount } = useAccount();
  const [isSelectionOpen, setIsSelectionOpen] = useState(false);

  const onReorder = useCallback(
    async (emailAccountIds: string[]) => {
      // Shown right away so a dropped account doesn't jump back while saving.
      if (data) {
        mutate(
          {
            ...data,
            emailAccounts: orderAccounts(data.emailAccounts, emailAccountIds),
          },
          { revalidate: false },
        );
      }
      const result = await reorderEmailAccountsAction({
        emailAccountIds,
      }).catch(() => null);
      mutate();
      if (!result || result.serverError || result.validationErrors) {
        toast.error(
          getActionErrorMessage(result ?? {}, "Failed to save account order"),
        );
      }
    },
    [data, mutate],
  );

  if (!data) return null;

  const activeLabel = isAllAccounts
    ? "All accounts"
    : emailAccount?.name || emailAccount?.email || "Choose account";
  const activeEmail =
    !isAllAccounts && emailAccount?.name ? emailAccount.email : null;
  let activeIcon: ReactNode = null;
  if (isAllAccounts) {
    activeIcon = <AllAccountsIcon />;
  } else if (emailAccount) {
    activeIcon = (
      <ProfileImage
        className="size-8"
        image={emailAccount.image}
        label={emailAccount.name || emailAccount.email}
      />
    );
  }

  return (
    <div className="mt-2 shrink-0 border-border border-t pt-2">
      <DropdownMenu>
        <RailTooltip label={collapsed ? activeLabel : null}>
          <DropdownMenuTrigger asChild>
            <MailAccountSwitcherTrigger
              icon={activeIcon}
              indicator={
                <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
              }
              label={activeLabel}
              email={activeEmail}
              collapsed={collapsed}
            />
          </DropdownMenuTrigger>
        </RailTooltip>
        <DropdownMenuContent
          align="start"
          className="w-[--radix-dropdown-menu-trigger-width] min-w-72 rounded-2xl p-2 shadow-xl"
          // A focused trigger reopens the menu on ArrowUp/ArrowDown, which
          // would swallow mail list navigation after closing the switcher.
          onCloseAutoFocus={(event) => event.preventDefault()}
          side="top"
          sideOffset={8}
        >
          {data.emailAccounts.length > 1 ? (
            <>
              <div className="flex items-stretch gap-1">
                <DropdownMenuItem
                  className="min-w-0 flex-1 gap-3 rounded-xl p-3"
                  onSelect={onSelectAll}
                >
                  <AllAccountsIcon />
                  <span className="flex-1 font-medium">All accounts</span>
                  {isAllAccounts && <CurrentAccountCheck />}
                  {isDesktopApp && (
                    <Kbd className="shrink-0">
                      {getShortcutHint("switchAllAccounts")}
                    </Kbd>
                  )}
                </DropdownMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      aria-label="Choose accounts"
                      className="w-10 justify-center rounded-xl p-0 text-muted-foreground"
                      onSelect={() => setIsSelectionOpen(true)}
                    >
                      <SlidersHorizontalIcon />
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="right">Choose accounts</TooltipContent>
                </Tooltip>
              </div>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <AccountList
            accounts={data.emailAccounts}
            activeAccountId={isAllAccounts ? null : (emailAccount?.id ?? null)}
            isDesktopApp={isDesktopApp}
            onReorder={onReorder}
            onSelect={onSelectAccount}
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="gap-3 rounded-xl p-3">
            <Link href="/accounts">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                <PlusIcon className="size-4" />
              </span>
              <span className="font-medium text-muted-foreground">
                Add or manage accounts
              </span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isSelectionOpen ? (
        <AllAccountsSelectionDialog
          emailAccounts={data.emailAccounts}
          onClose={() => setIsSelectionOpen(false)}
          onSaved={mutate}
        />
      ) : null}
    </div>
  );
});

/**
 * Accounts can be held and dragged into a new order, like split tabs. The
 * list lives inside the menu content, so closing the menu ends any drag.
 */
function AccountList({
  accounts,
  activeAccountId,
  isDesktopApp,
  onReorder,
  onSelect,
}: {
  accounts: EmailAccount[];
  activeAccountId: string | null;
  isDesktopApp: boolean;
  onReorder: (emailAccountIds: string[]) => void;
  onSelect: (accountId: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { drag, suppressClickRef, trackPress } = useDragReorder<DragState>();

  const orderedAccounts = drag ? orderAccounts(accounts, drag.order) : accounts;

  const trackAccountPress = (
    event: PointerEvent<HTMLDivElement>,
    accountId: string,
  ) => {
    if (accounts.length < 2) return;
    const initialOrder = accounts.map(({ id }) => id);

    trackPress(event, {
      start: () => ({ id: accountId, order: initialOrder }),
      orderForPointer: (moveEvent, current) =>
        orderForPointer({
          container: listRef.current,
          drag: current,
          y: moveEvent.clientY,
        }),
      commit: (order) => {
        if (order.join() !== initialOrder.join()) onReorder(order);
      },
    });
  };

  return (
    <div ref={listRef} className="relative">
      {orderedAccounts.map((account, index) => (
        <motion.div
          data-account-id={account.id}
          key={account.id}
          layout={drag ? "position" : false}
          transition={ITEM_MOVE_TRANSITION}
          className={cn(drag?.id === account.id && "opacity-40")}
        >
          <AccountItem
            account={account}
            isActive={account.id === activeAccountId}
            isDesktopApp={isDesktopApp}
            onPress={(event) => trackAccountPress(event, account.id)}
            onSelect={onSelect}
            shouldSuppressSelect={() => suppressClickRef.current}
            shortcutKey={
              isDesktopApp
                ? getShortcut("switchAccount").keys[index]
                : undefined
            }
          />
        </motion.div>
      ))}
    </div>
  );
}

function AccountItem({
  account,
  isActive,
  isDesktopApp,
  onPress,
  onSelect,
  shouldSuppressSelect,
  shortcutKey,
}: {
  account: EmailAccount;
  isActive: boolean;
  isDesktopApp: boolean;
  onPress: (event: PointerEvent<HTMLDivElement>) => void;
  onSelect: (accountId: string) => void;
  shouldSuppressSelect: () => boolean;
  shortcutKey: string | undefined;
}) {
  // Radix onSelect receives a CustomEvent without metaKey/ctrlKey.
  const openInNewWindow = useRef(false);

  return (
    <DropdownMenuItem
      className="select-none gap-3 rounded-xl p-3"
      onPointerDown={(event) => {
        openInNewWindow.current =
          isDesktopApp && isDesktopNewWindowClick(event);
        onPress(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          openInNewWindow.current =
            isDesktopApp && isDesktopNewWindowClick(event);
        }
      }}
      onSelect={(event) => {
        if (shouldSuppressSelect()) {
          // Keeps the menu open on the reordered list.
          event.preventDefault();
          return;
        }
        const shouldOpenWindow = openInNewWindow.current;
        openInNewWindow.current = false;
        if (shouldOpenWindow) {
          const openWindow = getInboxZeroDesktopApp()?.openWindow;
          if (openWindow) {
            openWindow(getMailAccountUrl(account.id, "")).catch(() => {});
            return;
          }
        }
        onSelect(account.id);
      }}
    >
      <ProfileImage
        className="size-10"
        image={account.image}
        label={account.name || account.email}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {account.name || account.email}
        </span>
        {account.name ? (
          <span className="block truncate text-muted-foreground text-xs">
            {account.email}
          </span>
        ) : null}
      </span>
      {isActive && <CurrentAccountCheck />}
      {shortcutKey && (
        <Kbd className="shrink-0">
          {formatShortcutKeys({
            ...getShortcut("switchAccount"),
            display: [shortcutKey.replace("mod+", "modorctrl+")],
          })}
        </Kbd>
      )}
    </DropdownMenuItem>
  );
}

function CurrentAccountCheck() {
  return <CheckIcon aria-label="Current account" className="size-4 shrink-0" />;
}

function AllAccountsIcon() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center gap-0.5 rounded-full bg-muted">
      <span className="size-2 rounded-full bg-blue-600" />
      <span className="size-2 rounded-full bg-violet-500" />
      <span className="size-2 rounded-full bg-emerald-500" />
    </span>
  );
}

function isDesktopNewWindowClick(event: {
  metaKey: boolean;
  ctrlKey: boolean;
}) {
  return event.metaKey || event.ctrlKey;
}

type EmailAccount = GetEmailAccountsResponse["emailAccounts"][number];

type DragState = {
  id: string;
  order: string[];
};

const ITEM_MOVE_TRANSITION = { duration: 0.15, ease: "easeOut" } as const;

/**
 * The order with the dragged account placed above or below the account under
 * the pointer, by which half of it the pointer is in. Reads layout boxes rather
 * than on-screen rects, so items still sliding into place don't cause swaps.
 */
function orderForPointer({
  container,
  drag,
  y,
}: {
  container: HTMLElement | null;
  drag: DragState;
  y: number;
}): string[] | null {
  if (!container) return null;
  const pointerY = y - container.getBoundingClientRect().top;

  for (const item of container.querySelectorAll<HTMLElement>(
    "[data-account-id]",
  )) {
    const targetId = item.dataset.accountId;
    if (!targetId || targetId === drag.id) continue;
    const { offsetTop, offsetHeight } = item;
    if (pointerY < offsetTop || pointerY > offsetTop + offsetHeight) continue;

    const below = pointerY > offsetTop + offsetHeight / 2;
    const order = drag.order.filter((id) => id !== drag.id);
    order.splice(order.indexOf(targetId) + (below ? 1 : 0), 0, drag.id);
    return order.join() === drag.order.join() ? null : order;
  }
  return null;
}

function orderAccounts(accounts: EmailAccount[], ids: string[]) {
  const accountsById = new Map(
    accounts.map((account) => [account.id, account]),
  );
  return ids.flatMap((id) => accountsById.get(id) ?? []);
}
