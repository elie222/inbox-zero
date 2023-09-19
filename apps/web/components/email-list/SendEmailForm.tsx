import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { type SendEmailResponse, type SendEmailBody } from "@/utils/gmail/mail";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";

export const SendEmailForm = (props: {
  threadId: string;
  defaultMessage: string;
  subject: string;
  to: string;
  cc?: string;
  replyTo?: string;
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    getValues,
  } = useForm<SendEmailBody>({
    defaultValues: {
      // threadId: props.threadId,
      messageText: props.defaultMessage,
      subject: props.subject,
      to: props.to,
      cc: props.cc,
      replyTo: props.replyTo,
    },
  });

  // useEffect(() => {
  //   if (props.threadId !== getValues("threadId")) {
  //     reset({
  //       threadId: props.threadId,
  //       messageText: props.defaultMessage,
  //       subject: props.subject,
  //       to: props.to,
  //       cc: props.cc,
  //       replyTo: props.replyTo,
  //     });
  //   }
  // }, [props, getValues, reset]);

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(async (data) => {
    try {
      const res = await postRequest<SendEmailResponse, SendEmailBody>(
        "/api/google/messages/send",
        data
      );
      if (isError(res))
        toastError({ description: `There was an error sending the email :(` });
      else toastSuccess({ description: `Email sent!` });
    } catch (error) {
      console.error(error);
      toastError({ description: `There was an error sending the email :(` });
    }
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-4">
      <Input
        type="text"
        as="textarea"
        rows={6}
        name="messageText"
        label="Reply"
        registerProps={register("messageText", { required: true })}
        error={errors.messageText}
      />
      <div className="mt-2 flex">
        <Button type="submit" color="transparent" loading={isSubmitting}>
          Send
        </Button>
        {/* <Button color="transparent" loading={isSubmitting}>
          Save Draft
        </Button> */}
      </div>
    </form>
  );
};
