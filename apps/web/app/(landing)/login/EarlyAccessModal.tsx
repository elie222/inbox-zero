import { useEffect } from "react";
import { Button } from "@/components/Button";
import { useModal, Modal } from "@/components/Modal";
import { SectionDescription } from "@/components/Typography";

export function EarlyAccessModal() {
  const { isModalOpen, openModal, closeModal } = useModal();

  useEffect(() => {
    openModal();
  }, [openModal]);

  return (
    <Modal title="Early Access" isOpen={isModalOpen} hideModal={closeModal}>
      <div className="mt-2">
        <SectionDescription>
          Inbox Zero is in early access. We are awaiting full approval from
          Google to use their Gmail API. Till then you will see a warning sign
          when signing in. To get past this warning, click {'"'}Advanced{'"'}{" "}
          and then {'"'}Approve{'"'}.
        </SectionDescription>
        <div className="mt-4">
          <Button onClick={closeModal} size="xl">
            I understand I will see a warning message when signing in
          </Button>
        </div>
      </div>
    </Modal>
  );
}
