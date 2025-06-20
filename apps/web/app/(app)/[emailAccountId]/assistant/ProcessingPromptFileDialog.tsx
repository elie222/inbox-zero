import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { pluralize } from "@/utils/string";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";

type StepProps = {
  back?: () => void;
  next?: () => void;
};

type StepContentProps = StepProps & {
  title: string;
  children: React.ReactNode;
};

type ResultProps = {
  createdRules: number;
  editedRules: number;
  removedRules: number;
};

const STEPS = 5;

export function ProcessingPromptFileDialog({
  open,
  onOpenChange,
  result,
  setViewedProcessingPromptFileDialog,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result?: ResultProps;
  setViewedProcessingPromptFileDialog: (viewed: boolean) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);

  const back = useCallback(() => {
    setCurrentStep((currentStep) => Math.max(0, currentStep - 1));
  }, []);

  const next = useCallback(() => {
    setCurrentStep((currentStep) => Math.min(STEPS, currentStep + 1));
  }, []);

  useEffect(() => {
    if (currentStep > 0) {
      setViewedProcessingPromptFileDialog(true);
    }
  }, [currentStep, setViewedProcessingPromptFileDialog]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {currentStep === 0 && <IntroStep next={next} />}
        {currentStep === 1 && <Step1 back={back} next={next} />}
        {currentStep === 2 && <Step2 back={back} next={next} />}
        {currentStep === 3 && <Step3 back={back} next={next} />}
        {currentStep === 4 && <Step4 back={back} next={next} />}
        {currentStep >= STEPS &&
          (result ? (
            <FinalStepReady
              back={back}
              next={() => onOpenChange(false)}
              result={result}
            />
          ) : (
            <FinalStepWaiting back={back} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function StepNavigation({ back, next }: StepProps) {
  return (
    <div className="flex gap-2">
      {back && (
        <Button variant="outline" onClick={back}>
          Back
        </Button>
      )}
      {next && <Button onClick={next}>Next</Button>}
    </div>
  );
}

function Step({ back, next, title, children }: StepContentProps) {
  return (
    <>
      <DialogHeader className="flex flex-col items-center justify-center">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="max-w-md space-y-1.5 text-left">
          {children}
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center">
        <StepNavigation back={back} next={next} />
      </div>
    </>
  );
}

function IntroStep({ next }: StepProps) {
  return (
    <>
      <DialogHeader className="flex flex-col items-center justify-center">
        <Loading />
        <DialogTitle>Processing...</DialogTitle>
        <DialogDescription className="text-center">
          This will take a minute.
          <br />
          In the meantime, get to know your AI assistant better!
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center">
        <Button onClick={next}>Show me around!</Button>
      </div>
    </>
  );
}

function Step1({ back, next }: StepProps) {
  return (
    <Step back={back} next={next} title="What's happening now?">
      <p>
        We're turning your instructions into clear rules.
        <br />
        This makes your assistant more reliable and gives you better control
        over how each rule is applied.
      </p>

      <Image
        src="/images/assistant/rules.png"
        alt="Analyzing prompt file"
        width={500}
        height={300}
        className="rounded-lg shadow"
      />
    </Step>
  );
}

function Step2({ back, next }: StepProps) {
  return (
    <Step back={back} next={next} title="Customize Your Rules">
      <p>Once created, you can fine-tune each rule to your needs.</p>
      <Image
        src="/images/assistant/rule-edit.png"
        alt="Editing a rule"
        width={500}
        height={300}
        className="rounded-lg shadow"
      />
    </Step>
  );
}

function Step3({ back, next }: StepProps) {
  return (
    <Step back={back} next={next} title="Test Your Rules">
      <p>
        Shortly, you'll be taken to the "Test" tab. Here you can check the
        assistant is working as expected.
      </p>

      <Image
        src="/images/assistant/process.png"
        alt="Test Rules"
        width={500}
        height={300}
        className="rounded-lg shadow"
      />
    </Step>
  );
}

function Step4({ back, next }: StepProps) {
  return (
    <Step back={back} next={next} title="Improve Your Rules">
      <p>
        Click "Fix" to correct any mistakes. Each fix helps train the AI to
        better match your needs.
      </p>

      <Image
        src="/images/assistant/fix.png"
        alt="Fix rule"
        width={500}
        height={300}
        className="rounded-lg shadow"
      />
    </Step>
  );
}

function FinalStepWaiting({ back }: StepProps) {
  return (
    <>
      <DialogHeader className="flex flex-col items-center justify-center">
        <Loading />
        <DialogTitle>Almost done!</DialogTitle>
        <DialogDescription className="text-center">
          We're almost done.
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-center">
        <StepNavigation back={back} />
      </div>
    </>
  );
}

function FinalStepReady({
  back,
  next,
  result,
}: StepProps & {
  result: ResultProps;
}) {
  const { emailAccountId } = useAccount();

  function getDescription() {
    let message = "";

    if (result.createdRules > 0) {
      message += `We've created ${result.createdRules} ${pluralize(
        result.createdRules,
        "rule",
      )} for you.`;
    }

    if (result.editedRules > 0) {
      message += ` We edited ${result.editedRules} ${pluralize(
        result.editedRules,
        "rule",
      )}.`;
    }

    if (result.removedRules > 0) {
      message += ` We removed ${result.removedRules} ${pluralize(
        result.removedRules,
        "rule",
      )}.`;
    }

    return message;
  }

  return (
    <>
      <DialogHeader className="flex flex-col items-center justify-center">
        <DialogTitle>All done!</DialogTitle>
        <DialogDescription className="text-center">
          {getDescription()}
        </DialogDescription>
      </DialogHeader>

      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={back}>
          Back
        </Button>
        <Button asChild onClick={next}>
          <Link href={prefixPath(emailAccountId, "/automation?tab=test")}>
            Try them out!
          </Link>
        </Button>
      </div>
    </>
  );
}
