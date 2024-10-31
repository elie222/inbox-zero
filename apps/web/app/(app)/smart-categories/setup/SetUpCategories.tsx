"use client";

import { useEffect, useState } from "react";
import uniqBy from "lodash/uniqBy";
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
import { defaultCategory } from "@/utils/categories";
import {
  createCategoriesAction,
  deleteCategoryAction,
} from "@/utils/actions/categorize";
import { cn } from "@/utils";
import { CreateCategoryButton } from "@/app/(app)/smart-categories/CreateCategoryButton";
import type { Category } from "@prisma/client";

type CardCategory = Pick<Category, "id" | "name" | "description"> & {
  enabled?: boolean;
  isDefault?: boolean;
};

const defaultCategories = Object.values(defaultCategory).map((c) => ({
  id: c.name,
  name: c.name,
  description: c.description,
  enabled: c.enabled,
  isDefault: true,
}));

export function SetUpCategories({
  existingCategories,
}: {
  existingCategories: CardCategory[];
}) {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const combinedCategories = uniqBy(
    [
      ...defaultCategories.map((c) => {
        const existing = existingCategories.find((e) => e.name === c.name);

        if (existing) {
          return {
            ...existing,
            enabled: true,
            isDefault: false,
          };
        }

        return c;
      }),
      ...existingCategories,
    ],
    (c) => c.name,
  );

  const [categories, setCategories] = useState<Map<string, boolean>>(
    new Map(
      combinedCategories.map((c) => [c.name, !c.isDefault || !!c.enabled]),
    ),
  );

  // Update categories when existingCategories changes
  useEffect(() => {
    setCategories((prevCategories) => {
      const newCategories = new Map(prevCategories);

      // Enable any new categories from existingCategories that aren't in the current map
      for (const category of existingCategories) {
        if (!prevCategories.has(category.name)) {
          newCategories.set(category.name, true);
        }
      }

      return newCategories;
    });
  }, [existingCategories]);

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
          {combinedCategories.map((category) => {
            return (
              <CategoryCard
                key={category.name}
                category={category}
                isEnabled={categories.get(category.name) ?? false}
                onAdd={() =>
                  setCategories(
                    new Map(categories.entries()).set(category.name, true),
                  )
                }
                onRemove={async () => {
                  if (category.isDefault) {
                    setCategories(
                      new Map(categories.entries()).set(category.name, false),
                    );
                  } else {
                    // delete category
                    await deleteCategoryAction(category.id);
                  }
                }}
              />
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

function CategoryCard({
  category,
  isEnabled,
  onAdd,
  onRemove,
}: {
  category: CardCategory;
  isEnabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex items-center justify-between gap-2 p-4",
        !isEnabled && "bg-gray-50",
      )}
    >
      <div>
        <div className="text-sm">{category.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {category.description}
        </div>
      </div>
      {isEnabled ? (
        <Button size="sm" variant="outline" onClick={onRemove}>
          Remove
        </Button>
      ) : (
        <Button size="sm" onClick={onAdd}>
          Add
        </Button>
      )}
    </Card>
  );
}
