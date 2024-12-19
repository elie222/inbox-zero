import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TestRulesContent } from "@/app/(app)/automation/TestRules";
import { Loading } from "@/components/Loading";

/*
When the modal first opens we'll tell them the AI is processing their prompt file.
And that they can learn about the AI assistant in the meantime.
When completed, we'll show them the test view and automatically start testing
the rules.
If they notice a mistake, they can mark an error.
*/

export function ProcessingPromptFileDialog({
  open,
  onOpenChange,
  result,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result?: {
    createdRules: number;
    editedRules: number;
    removedRules: number;
  };
  isLoading: boolean;
}) {
  const [modal, setModal] = useQueryState("modal");
  const [currentStep, setCurrentStep] = useState(0);

  // useEffect(() => {
  //   if (!isLoading && result && currentStep < 4) {
  //     setCurrentStep(4);
  //   }
  // }, [isLoading, result, currentStep]);

  useEffect(() => {
    // reset modal state on close
    if (!open) {
      setCurrentStep(0);
      setModal(null);
    }
  }, [open, setModal]);

  const showRules = modal === "rules";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* <DialogContent className="max-h-[90vh] overflow-y-auto px-0 sm:max-w-7xl"> */}
      <DialogContent className="max-h-[90vh] overflow-y-auto px-0 sm:max-w-7xl">
        {currentStep === 0 && (
          <OnboardingContent onNext={() => setCurrentStep(1)} />
        )}

        {currentStep === 1 && (
          <ProcessingPromptFileDialogStep1 onNext={() => setCurrentStep(2)} />
        )}
        {currentStep === 2 && (
          <ProcessingPromptFileDialogStep2 onNext={() => setCurrentStep(3)} />
        )}
        {currentStep === 3 && (
          <ProcessingPromptFileDialogStep3 onNext={() => setCurrentStep(4)} />
        )}
        {currentStep === 4 && (
          <ProcessingPromptFileDialogStep4 onNext={() => setCurrentStep(5)} />
        )}

        {/* <DialogHeader className="px-6">
          <DialogTitle>
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing your prompt file...
              </div>
            ) : (
              "Rules Generated"
            )}
          </DialogTitle>
          <DialogDescription>
            {isLoading
              ? "In the meantime, learn more about the AI assistant and how it works."
              : "Your rules have been created. You can now test and improve them."}
          </DialogDescription>
        </DialogHeader> */}

        {/* {showRules ? (
          <TestRulesContent />
        ) : (
          <div className="space-y-4">
            <ProcessingPromptFileDialogCarousel
              currentStep={currentStep}
              onStepChange={setCurrentStep}
            />
            <div className="flex justify-center">
              <Button
                onClick={() => setCurrentStep((prev) => Math.min(prev + 1, 3))}
                disabled={currentStep >= 3}
              >
                Next
              </Button>
            </div>
            <ResultContent result={result} />
          </div>
        )} */}
      </DialogContent>
    </Dialog>
  );
}

function OnboardingContent({ onNext }: { onNext: () => void }) {
  return (
    <DialogHeader className="flex flex-col items-center justify-center">
      <Loading />
      <DialogTitle>Processing prompt file...</DialogTitle>
      <DialogDescription>
        Get to know our AI assistant while we process your rules!
      </DialogDescription>
      <div>
        <Button className="mt-4" onClick={onNext}>
          Show me around!
        </Button>
      </div>
    </DialogHeader>
  );
}

function ResultContent({
  result,
}: {
  result?: {
    createdRules: number;
    editedRules: number;
    removedRules: number;
  };
}) {
  if (!result) {
    return null;
  }

  return (
    <div className="text-center">
      <p className="text-green-500">Rules saved!</p>
      <ul className="text-sm text-muted-foreground">
        {result.createdRules > 0 && (
          <li>{result.createdRules} rules created</li>
        )}
        {result.editedRules > 0 && <li>{result.editedRules} rules edited</li>}
        {result.removedRules > 0 && (
          <li>{result.removedRules} rules removed</li>
        )}
      </ul>
      <Button asChild className="mt-4">
        <Link href="?modal=rules" shallow>
          View
        </Link>
      </Button>
    </div>
  );
}

function ProcessingPromptFileDialogStep1({ onNext }: { onNext: () => void }) {
  return (
    <div className="p-6">
      <Image
        src="/images/automation/rules.png"
        alt="Analyzing prompt file"
        width={1000}
        height={500}
        className="rounded-lg"
      />
      <p className="mt-4">
        First, our AI analyzes your prompt file and extracts rules from it.
      </p>
      <Button className="mt-2" onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

function ProcessingPromptFileDialogStep2({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center p-6">
      <Image
        src="/images/automation/edit-rule.png"
        alt="Saving rules"
        width={700}
        height={500}
        className="rounded-lg"
      />
      <div className="mt-4 space-y-2">
        <p>Next, you can click a rule to edit it.</p>
        <p>Each rule is made up of two parts:</p>
        <ol className="list-inside list-decimal space-y-1 pl-4">
          <li>A condition</li>
          <li>An action</li>
        </ol>
        <p>
          Conditions need to be met for actions to happen. For example, "apply
          this to marketing emails".
        </p>
        <p>Example actions include:</p>
        <ul className="list-inside list-disc space-y-1 pl-4">
          <li>Drafting an email</li>
          <li>Labeling</li>
          <li>Archiving</li>
        </ul>
      </div>
      <Button className="mt-2" onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

function ProcessingPromptFileDialogStep3({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <Image
        src="/images/automation/rules.png"
        alt="Saving rules"
        width={500}
        height={300}
        className="w-full"
      />
      <p>Next, you can click on a rule to edit it even further.</p>
      <p>Each rule is made up of two parts: a condition and an action.</p>
      <p>Our AI sets these up for you, but you can adjust them as needed.</p>
      <Button className="mt-2" onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

function ProcessingPromptFileDialogStep4({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <Image
        src="/images/automation/rules.png"
        alt="Testing rules"
        width={500}
        height={300}
        className="w-full"
      />
      <p>Test the rules to see how they perform.</p>
      <p>
        This allows you to ensure the rules work as expected before applying
        them.
      </p>
      <Button className="mt-2" onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

function ProcessingPromptFileDialogCarousel({
  currentStep,
  onStepChange,
}: {
  currentStep: number;
  onStepChange: (step: number) => void;
}) {
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    if (api) {
      api.scrollTo(currentStep);
    }
  }, [api, currentStep]);

  useEffect(() => {
    if (!api) return;

    api.on("select", () => {
      onStepChange(api.selectedScrollSnap());
    });
  }, [api, onStepChange]);

  const steps = useMemo(
    () => [
      <ProcessingPromptFileDialogStep1 key="step-1" onNext={() => {}} />,
      <ProcessingPromptFileDialogStep2 key="step-2" onNext={() => {}} />,
      <ProcessingPromptFileDialogStep3 key="step-3" onNext={() => {}} />,
      <ProcessingPromptFileDialogStep4 key="step-4" onNext={() => {}} />,
    ],
    [],
  );

  return (
    <Carousel setApi={setApi} className="mx-auto w-full max-w-xs">
      <CarouselContent>
        {steps.map((step, index) => (
          <CarouselItem key={index}>
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  {/* <span className="text-3xl font-semibold">{step}</span> */}
                  <span>{step}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
