import React from "react";

export function useModal() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const openModal = React.useCallback(() => setIsModalOpen(true), []);
  const closeModal = React.useCallback(() => setIsModalOpen(false), []);

  return { isModalOpen, openModal, closeModal, setIsModalOpen };
}
