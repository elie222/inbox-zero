"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenIcon, TagsIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TypographyH4 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { senderCategory } from "@/utils/categories";
import { createCategoriesAction } from "@/utils/actions/categorize";
import { cn } from "@/utils";
import { CreateCategoryButton } from "@/app/(app)/smart-categories/CreateCategoryButton";

export function SetUpCategories() {
  const [categories, setCategories] = useState<Map<string, boolean>>(
    new Map(Object.values(senderCategory).map((c) => [c.label, c.enabled])),
  );
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Set up categories</CardTitle>
        <CardDescription className="max-w-2xl">
          Automatically categorize who emails you for better inbox management
          and smarter automation. This allows you to bulk archive by category
          and optimize AI automation based on sender types.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <TypographyH4>Choose categories</TypographyH4>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Array.from(categories.entries()).map(([category, isSelected]) => {
            const description = Object.values(senderCategory).find(
              (c) => c.label === category,
            )?.description;

            return (
              <Card
                key={category}
                className={cn(
                  "flex items-center justify-between gap-2 p-4",
                  !isSelected && "bg-gray-50",
                )}
              >
                <div>
                  <div className="text-sm">{category}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </div>
                </div>
                {isSelected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setCategories(
                        new Map(categories.entries()).set(category, false),
                      )
                    }
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      setCategories(
                        new Map(categories.entries()).set(category, true),
                      )
                    }
                  >
                    Add
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <CreateCategoryButton
            buttonProps={{
              variant: "outline",
              children: (
                <>
                  <PenIcon className="mr-2 size-4" />
                  Add your own
                </>
              ),
            }}
          />
          <Button
            loading={isCreating}
            onClick={async () => {
              setIsCreating(true);
              const selectedCategories = Array.from(categories.entries())
                .filter(([, isSelected]) => isSelected)
                .map(([category]) => category);
              await createCategoriesAction(selectedCategories);
              setIsCreating(false);
              router.push("/smart-categories");
            }}
          >
            <TagsIcon className="mr-2 h-4 w-4" />
            Create Categories
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
