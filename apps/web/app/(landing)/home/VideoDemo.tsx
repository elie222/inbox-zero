"use client";

import { usePostHog } from "posthog-js/react";
import { Modal, useModal } from "@/components/Modal";

export function VideoDemo() {
  const { isModalOpen, openModal, closeModal } = useModal();
  const posthog = usePostHog();

  return (
    <>
      <div
        className="group absolute inset-0 flex cursor-pointer items-center justify-center hover:bg-slate-700 hover:bg-opacity-30 lg:rounded-2xl"
        onClick={() => {
          openModal();
          posthog.capture("Landing Page Video Clicked");
        }}
      >
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 bg-opacity-50 text-slate-50 shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50 group-hover:scale-110 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/90 dark:focus-visible:ring-slate-300">
          <svg
            className=" h-6 w-6"
            fill="none"
            height="24"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      </div>
      <Modal
        isOpen={isModalOpen}
        hideModal={closeModal}
        padding="none"
        size="6xl"
        backdropClass="backdrop-blur bg-white/80"
      >
        <iframe
          className="aspect-video h-full w-full rounded-lg"
          src="https://www.youtube.com/embed/WP2ZTcZq3RM?autoplay=1"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </Modal>
    </>
  );
}
