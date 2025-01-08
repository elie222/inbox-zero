import Link from "next/link";
import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result?: ResultProps;
}) {
  const [currentStep, setCurrentStep] = useState(0);

  const back = useCallback(() => {
    setCurrentStep((currentStep) => Math.max(0, currentStep - 1));
  }, []);

  const next = useCallback(() => {
    setCurrentStep((currentStep) => Math.min(4, currentStep + 1));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* <DialogContent className="max-h-[90vh] overflow-y-auto px-0 sm:max-w-7xl"> */}
      <DialogContent
      // className={
      //   currentStep !== 0
      //     ? "max-h-[90vh] overflow-y-auto px-0 sm:max-w-7xl"
      //     : undefined
      // }
      >
        {currentStep === 0 && <IntroStep next={next} />}
        {currentStep === 1 && <Step1 back={back} next={next} />}
        {currentStep === 2 && <Step2 back={back} next={next} />}
        {currentStep === 3 && <Step3 back={back} next={next} />}

        {currentStep > 3 &&
          (result ? (
            <FinalStepReady
              back={back}
              next={() => {
                onOpenChange(false);
              }}
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
          In the meantime, get to know our AI assistant better!
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
      <p>We're converting your prompt into specific, actionable rules.</p>
      <p>
        These rules are more predictable and give you fine-grained control over
        your email automation.
      </p>
    </Step>
  );
}

function Step2({ back, next }: StepProps) {
  return (
    <Step back={back} next={next} title="Customize Your Rules">
      <p>Once created, you can fine-tune each rule to your needs:</p>
      <ul className="mt-1 list-disc pl-6 text-left">
        <li>Manually adjust conditions and actions</li>
        <li>Toggle automation on/off</li>
        <li>Toggle whether a rule runs on conversations (threads)</li>
      </ul>
    </Step>
  );
}

function Step3({ back, next }: StepProps) {
  return (
    <Step back={back} next={next} title="Test Your Rules">
      <p>
        Shortly, you'll be taken to the "Test" tab. Here you can:
        <ul className="mt-1 list-disc pl-6 text-left">
          <li>Check the AI rules are working as expected</li>
          <li>Understand why the AI made certain choices</li>
          <li>Fix any mistakes easily</li>
        </ul>
      </p>
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
  return (
    <>
      <DialogHeader className="flex flex-col items-center justify-center">
        <DialogTitle>All done!</DialogTitle>
        <DialogDescription className="text-center">
          We've created your rules.
        </DialogDescription>
      </DialogHeader>

      <ResultContent result={result} />

      <div className="flex justify-center">
        <Button variant="outline" onClick={back}>
          Back
        </Button>
        <Button onClick={next}>Test them now!</Button>
      </div>
    </>
  );
}

function ResultContent({ result }: { result: ResultProps }) {
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

// function ProcessingPromptFileDialogStep1({ onNext }: { onNext: () => void }) {
//   return (
//     <div className="p-6">
//       <Image
//         src="/images/automation/rules.png"
//         alt="Analyzing prompt file"
//         width={1000}
//         height={500}
//         className="rounded-lg"
//       />
//       <p className="mt-4">
//         First, our AI analyzes your prompt file and extracts rules from it.
//       </p>
//       <Button className="mt-2" onClick={onNext}>
//         Next
//       </Button>
//     </div>
//   );
// }

// function ProcessingPromptFileDialogStep2({ onNext }: { onNext: () => void }) {
//   return (
//     <div className="flex flex-col items-center p-6">
//       <Image
//         src="/images/automation/edit-rule.png"
//         alt="Saving rules"
//         width={700}
//         height={500}
//         className="rounded-lg"
//       />
//       <div className="mt-4 space-y-2">
//         <p>Next, you can click a rule to edit it.</p>
//         <p>Each rule is made up of two parts:</p>
//         <ol className="list-inside list-decimal space-y-1 pl-4">
//           <li>A condition</li>
//           <li>An action</li>
//         </ol>
//         <p>
//           Conditions need to be met for actions to happen. For example, "apply
//           this to marketing emails".
//         </p>
//         <p>Example actions include:</p>
//         <ul className="list-inside list-disc space-y-1 pl-4">
//           <li>Drafting an email</li>
//           <li>Labeling</li>
//           <li>Archiving</li>
//         </ul>
//       </div>
//       <Button className="mt-2" onClick={onNext}>
//         Next
//       </Button>
//     </div>
//   );
// }

// function ProcessingPromptFileDialogStep3({ onNext }: { onNext: () => void }) {
//   return (
//     <div>
//       <Image
//         src="/images/automation/rules.png"
//         alt="Saving rules"
//         width={500}
//         height={300}
//         className="w-full"
//       />
//       <p>Next, you can click on a rule to edit it even further.</p>
//       <p>Each rule is made up of two parts: a condition and an action.</p>
//       <p>Our AI sets these up for you, but you can adjust them as needed.</p>
//       <Button className="mt-2" onClick={onNext}>
//         Next
//       </Button>
//     </div>
//   );
// }

// function ProcessingPromptFileDialogStep4({ onNext }: { onNext: () => void }) {
//   return (
//     <div>
//       <Image
//         src="/images/automation/rules.png"
//         alt="Testing rules"
//         width={500}
//         height={300}
//         className="w-full"
//       />
//       <p>Test the rules to see how they perform.</p>
//       <p>
//         This allows you to ensure the rules work as expected before applying
//         them.
//       </p>
//       <Button className="mt-2" onClick={onNext}>
//         Next
//       </Button>
//     </div>
//   );
// }

// function ProcessingPromptFileDialogCarousel({
//   currentStep,
//   onStepChange,
// }: {
//   currentStep: number;
//   onStepChange: (step: number) => void;
// }) {
//   const [api, setApi] = useState<CarouselApi>();

//   useEffect(() => {
//     if (api) {
//       api.scrollTo(currentStep);
//     }
//   }, [api, currentStep]);

//   useEffect(() => {
//     if (!api) return;

//     api.on("select", () => {
//       onStepChange(api.selectedScrollSnap());
//     });
//   }, [api, onStepChange]);

//   const steps = useMemo(
//     () => [
//       <ProcessingPromptFileDialogStep1 key="step-1" onNext={() => {}} />,
//       <ProcessingPromptFileDialogStep2 key="step-2" onNext={() => {}} />,
//       <ProcessingPromptFileDialogStep3 key="step-3" onNext={() => {}} />,
//       <ProcessingPromptFileDialogStep4 key="step-4" onNext={() => {}} />,
//     ],
//     [],
//   );

//   return (
//     <Carousel setApi={setApi} className="mx-auto w-full max-w-xs">
//       <CarouselContent>
//         {steps.map((step, index) => (
//           <CarouselItem key={index}>
//             <div className="p-1">
//               <Card>
//                 <CardContent className="flex aspect-square items-center justify-center p-6">
//                   {/* <span className="text-3xl font-semibold">{step}</span> */}
//                   <span>{step}</span>
//                 </CardContent>
//               </Card>
//             </div>
//           </CarouselItem>
//         ))}
//       </CarouselContent>
//       <CarouselPrevious />
//       <CarouselNext />
//     </Carousel>
//   );
// }
