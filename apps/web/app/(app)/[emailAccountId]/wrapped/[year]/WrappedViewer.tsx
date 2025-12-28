"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { useWrapped } from "@/hooks/useWrapped";
import { generateWrappedAction } from "@/utils/actions/wrapped";
import type { WrappedData } from "@/utils/wrapped/types";
import { SlideNavigation } from "./SlideNavigation";
import { ShareButton } from "./ShareButton";
import { IntroSlide } from "./slides/IntroSlide";
import { VolumeSlide } from "./slides/VolumeSlide";
import { HeatmapSlide } from "./slides/HeatmapSlide";
import { StreaksSlide } from "./slides/StreaksSlide";
import { DayChartSlide } from "./slides/DayChartSlide";
import { ResponseTimeSlide } from "./slides/ResponseTimeSlide";
import { TopPeopleSlide } from "./slides/TopPeopleSlide";
import { FastestReplySlide } from "./slides/FastestReplySlide";
import { UnsubscribesSlide } from "./slides/UnsubscribesSlide";
import { AIImpactSlide } from "./slides/AIImpactSlide";
import { HoursSavedSlide } from "./slides/HoursSavedSlide";
import { OutroSlide } from "./slides/OutroSlide";

const SLIDES = [
  { id: "intro", component: IntroSlide },
  { id: "volume", component: VolumeSlide },
  { id: "heatmap", component: HeatmapSlide },
  { id: "streaks", component: StreaksSlide },
  { id: "day-chart", component: DayChartSlide },
  { id: "response-time", component: ResponseTimeSlide },
  { id: "top-people", component: TopPeopleSlide },
  { id: "fastest-reply", component: FastestReplySlide },
  { id: "unsubscribes", component: UnsubscribesSlide },
  { id: "ai-impact", component: AIImpactSlide },
  { id: "hours-saved", component: HoursSavedSlide },
  { id: "outro", component: OutroSlide },
] as const;

export function WrappedViewer({ year }: { year: number }) {
  const params = useParams<{ emailAccountId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data, isLoading, mutate } = useWrapped(year);

  const initialSlide = Number(searchParams.get("slide")) || 0;
  const [currentSlide, setCurrentSlide] = useState(
    Math.max(0, Math.min(initialSlide, SLIDES.length - 1)),
  );
  const [isGenerating, setIsGenerating] = useState(false);

  // Poll while processing
  useEffect(() => {
    if (data?.wrapped?.status === "PROCESSING") {
      const interval = setInterval(() => {
        mutate();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [data?.wrapped?.status, mutate]);

  // Update URL when slide changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("slide", String(currentSlide));
    router.replace(`?${newParams.toString()}`, { scroll: false });
  }, [currentSlide, router, searchParams]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurrentSlide((prev) => Math.min(prev + 1, SLIDES.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    const result = await generateWrappedAction(params.emailAccountId, { year });

    if (result?.serverError) {
      toastError({
        title: "Error generating wrapped",
        description: result.serverError,
      });
      setIsGenerating(false);
    } else {
      toastSuccess({ description: "Generating your wrapped..." });
      mutate();
    }
  }, [params.emailAccountId, year, mutate]);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, SLIDES.length - 1)));
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, SLIDES.length - 1));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  // Show generate button if no data or error
  if (!isLoading && (!data?.wrapped || data.wrapped.status === "ERROR")) {
    return (
      <GenerateView
        year={year}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        error={data?.wrapped?.status === "ERROR"}
      />
    );
  }

  // Show loading/processing state
  if (
    isLoading ||
    data?.wrapped?.status === "PENDING" ||
    data?.wrapped?.status === "PROCESSING"
  ) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
        <p className="text-lg text-white/80">
          Generating your {year} wrapped...
        </p>
        <p className="text-sm text-white/60">This may take a moment</p>
      </div>
    );
  }

  const wrappedData = data?.wrapped?.data as WrappedData | null;

  if (!wrappedData) {
    return (
      <GenerateView
        year={year}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        error={false}
      />
    );
  }

  const CurrentSlideComponent = SLIDES[currentSlide].component;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Slide content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.3 }}
          className="h-full w-full"
        >
          <CurrentSlideComponent data={wrappedData} year={year} />
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className="rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronUp className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={nextSlide}
          disabled={currentSlide === SLIDES.length - 1}
          className="rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      </div>

      {/* Dot navigation */}
      <SlideNavigation
        totalSlides={SLIDES.length}
        currentSlide={currentSlide}
        onSlideChange={goToSlide}
      />

      {/* Share button */}
      <ShareButton year={year} currentSlide={currentSlide} data={wrappedData} />

      {/* Slide counter */}
      <div className="absolute bottom-4 left-4 text-sm text-white/60">
        {currentSlide + 1} / {SLIDES.length}
      </div>
    </div>
  );
}

function GenerateView({
  year,
  isGenerating,
  onGenerate,
  error,
}: {
  year: number;
  isGenerating: boolean;
  onGenerate: () => void;
  error: boolean;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-2">
          Email Wrapped {year}
        </h1>
        <p className="text-xl text-white/80">
          {error
            ? "Something went wrong. Try again?"
            : "Discover your email year in review"}
        </p>
      </div>
      <Button
        size="lg"
        onClick={onGenerate}
        disabled={isGenerating}
        className="bg-white text-purple-900 hover:bg-white/90"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : error ? (
          "Try Again"
        ) : (
          "Generate My Wrapped"
        )}
      </Button>
    </div>
  );
}
