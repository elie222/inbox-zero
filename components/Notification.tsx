import React, { Fragment, useCallback } from 'react';
import { Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/20/solid';

type NotificationType = 'success' | 'error' | 'info';

export interface NotificationItem {
  title?: string;
  description: React.ReactNode;
  type: NotificationType;
  duration?: number;
}

export function Notification(props: {
  notification?: NotificationItem;
  setNotification: (notification?: NotificationItem) => void;
}) {
  const { notification, setNotification } = props;
  const hide = useCallback(() => setNotification(undefined), [setNotification]);

  return (
    <>
      {/* Global notification live region, render this permanently at the end of the document */}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-0 z-50 flex items-end px-4 py-6 sm:items-start sm:p-6"
      >
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {/* Notification panel, dynamically insert this into the live region when it needs to be displayed */}
          <Transition
            show={!!notification}
            as={Fragment}
            enter="transform ease-out duration-300 transition"
            enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
            enterTo="translate-y-0 opacity-100 sm:translate-x-0"
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5">
              <div className="p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <NotificationIcon type={notification?.type} />
                  </div>
                  <div className="ml-3 w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-gray-900">
                      {notification?.title || getDefaultTitle(notification?.type)}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">{notification?.description}</p>
                  </div>
                  <div className="ml-4 flex flex-shrink-0">
                    <button
                      type="button"
                      className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={hide}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </>
  );
}

function NotificationIcon(props: { type?: NotificationType }) {
  const { type } = props;

  if (type === 'success')
    return <CheckCircleIcon className="h-6 w-6 text-green-400" aria-hidden="true" />;
  if (type === 'error')
    return <ExclamationCircleIcon className="h-6 w-6 text-red-400" aria-hidden="true" />;
  if (type === 'info')
    return <InformationCircleIcon className="h-6 w-6 text-blue-400" aria-hidden="true" />;

  return null;
}

function getDefaultTitle(type?: NotificationType) {
  if (type === 'success') return 'Success';
  if (type === 'error') return 'Error';
  if (type === 'info') return 'Info';
}
