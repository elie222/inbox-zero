import {
  createRoutedBackendAdapter,
  type MailHttpRequestFn,
} from "@inboxzero/mail-core/protocol/routed-backend-adapter";

export function createRoutedBackendPorts(request: MailHttpRequestFn) {
  return createRoutedBackendAdapter({ requestFor: () => request });
}
