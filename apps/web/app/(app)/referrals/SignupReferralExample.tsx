"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { applyReferralCodeAction } from "@/utils/actions/referral";
import { useSearchParams } from "next/navigation";

// This is an example of how to integrate referral code in your signup form

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  referralCode: z.string().optional(),
});

type SignupFormData = z.infer<typeof signupSchema>;

export function SignupWithReferralExample() {
  const searchParams = useSearchParams();
  const referralCodeFromUrl = searchParams.get("ref");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      referralCode: referralCodeFromUrl || "",
    },
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsSubmitting(true);
    
    try {
      // Step 1: Create the user account (your existing signup logic)
      // const user = await createUserAccount(data.email, data.password);
      
      // Step 2: If a referral code was provided, apply it
      if (data.referralCode) {
        const result = await applyReferralCodeAction({
          referralCode: data.referralCode,
        });
        
        if (result?.serverError) {
          // Log the error but don't block signup
          console.error("Failed to apply referral code:", result.serverError);
          toastError({
            title: "Referral code issue",
            description: result.serverError,
          });
        } else {
          toastSuccess({
            description: "Referral code applied successfully!",
          });
        }
      }
      
      // Step 3: Continue with your onboarding flow
      // router.push("/onboarding");
      
    } catch (error) {
      toastError({
        title: "Signup failed",
        description: "Please try again",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...register("email")}
          placeholder="you@example.com"
        />
        {errors.email && (
          <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          {...register("password")}
          placeholder="••••••••"
        />
        {errors.password && (
          <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="referralCode">
          Referral Code (Optional)
        </Label>
        <Input
          id="referralCode"
          {...register("referralCode")}
          placeholder="Enter referral code"
        />
        <p className="text-sm text-gray-500 mt-1">
          Have a referral code? Enter it to support your friend!
        </p>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? "Creating account..." : "Sign up"}
      </Button>
    </form>
  );
}