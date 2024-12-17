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

  useEffect(() => {
    if (!isLoading && result && currentStep < 4) {
      setCurrentStep(4);
    }
  }, [isLoading, result, currentStep]);

  const showRules = modal === "rules";

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    } else {
      setModal(null);
    }
  }, [open, setModal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto px-0 sm:max-w-7xl">
        <DialogHeader className="px-6">
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
        </DialogHeader>

        {showRules ? (
          <TestRulesContent />
        ) : (
          <div className="space-y-4">
            {!result ? (
              <>
                <ProcessingPromptFileDialogCarousel
                  currentStep={currentStep}
                  onStepChange={setCurrentStep}
                />
                <div className="flex justify-center">
                  <Button
                    onClick={() =>
                      setCurrentStep((prev) => Math.min(prev + 1, 3))
                    }
                    disabled={currentStep >= 3}
                  >
                    Next
                  </Button>
                </div>
              </>
            ) : (
              <ResultContent result={result} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function ProcessingPromptFileDialogStep1() {
  return (
    <div>
      <Image
        src="/images/automation/analyzing-prompt.png"
        alt="Analyzing prompt file"
        width={500}
        height={300}
        className="w-full"
      />
      <p>First, our AI analyzes your prompt file and extracts rules from it.</p>
    </div>
  );
}

function ProcessingPromptFileDialogStep2() {
  return (
    <div>
      <Image
        src="/images/automation/view-rules.svg"
        alt="Saving rules"
        width={500}
        height={300}
        className="w-full"
      />
      <p>
        Next, you can view and edit the rules, or adjust your prompt further.
      </p>
    </div>
  );
}

function ProcessingPromptFileDialogStep3() {
  return (
    <div>
      <Image
        src="/images/automation/edit-rule.svg"
        alt="Saving rules"
        width={500}
        height={300}
        className="w-full"
      />
      <p>Next, you can click on a rule to edit it even further.</p>
      <p>Each rule is made up of two parts: a condition and an action.</p>
      <p>Our AI sets these up for you, but you can adjust them as needed.</p>
    </div>
  );
}

function ProcessingPromptFileDialogStep4() {
  return (
    <div>
      <Image
        src="/images/automation/testing-rules.png"
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
      <ProcessingPromptFileDialogStep1 key="step-1" />,
      <ProcessingPromptFileDialogStep2 key="step-2" />,
      <ProcessingPromptFileDialogStep3 key="step-3" />,
      <ProcessingPromptFileDialogStep4 key="step-4" />,
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
