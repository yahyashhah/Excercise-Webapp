"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { COMMON_EQUIPMENT, FITNESS_GOALS } from "@/lib/utils/constants";
import { completeOnboarding } from "@/actions/onboarding-actions";
import { toast } from "sonner";
import { Loader2, Stethoscope, User, ArrowRight, ArrowLeft } from "lucide-react";

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<"CLINICIAN" | "PATIENT" | "">("");
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [limitations, setLimitations] = useState("");
  const [comorbidities, setComorbidities] = useState("");
  const [functionalChallenges, setFunctionalChallenges] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  function toggleEquipment(item: string) {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  }

  async function handleComplete() {
    if (!firstName || !lastName) {
      toast.error("Please fill in your name");
      return;
    }
    if (!role) {
      toast.error("Please select a role");
      return;
    }

    setLoading(true);

    const result = await completeOnboarding({
      role,
      firstName,
      lastName,
      phone: phone || undefined,
      dateOfBirth: dateOfBirth || undefined,
      limitations: limitations || undefined,
      comorbidities: comorbidities || undefined,
      functionalChallenges: functionalChallenges || undefined,
      availableEquipment: selectedEquipment,
      fitnessGoals: selectedGoals,
    });

    setLoading(false);

    if (result && !result.success) {
      toast.error(result.error);
    }
    // On success, the action redirects to /dashboard
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Step indicator */}
      <div className="mb-8 flex justify-center gap-2">
        {[1, 2, ...(role === "PATIENT" ? [3] : [])].map((s) => (
          <div
            key={s}
            className={`h-2 w-12 rounded-full transition-colors ${
              s <= step ? "bg-blue-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Role selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">Welcome to RehabAI</h2>
            <p className="mt-1 text-slate-600">Let us set up your account. How will you use RehabAI?</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => setRole("CLINICIAN")}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                role === "CLINICIAN"
                  ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Stethoscope className="mb-3 h-8 w-8 text-blue-600" />
              <h3 className="font-semibold text-slate-900">Clinician</h3>
              <p className="mt-1 text-sm text-slate-500">
                Create and manage exercise programs for your patients
              </p>
            </button>

            <button
              onClick={() => setRole("PATIENT")}
              className={`rounded-xl border-2 p-6 text-left transition-all ${
                role === "PATIENT"
                  ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <User className="mb-3 h-8 w-8 text-blue-600" />
              <h3 className="font-semibold text-slate-900">Patient</h3>
              <p className="mt-1 text-sm text-slate-500">
                Follow your prescribed exercises and track your progress
              </p>
            </button>
          </div>

          <Button
            className="w-full"
            disabled={!role}
            onClick={() => setStep(2)}
          >
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Basic info */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>Tell us a bit about yourself</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {role === "PATIENT" && (
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {role === "PATIENT" ? (
                <Button
                  className="flex-1"
                  disabled={!firstName || !lastName}
                  onClick={() => setStep(3)}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  disabled={loading || !firstName || !lastName}
                  onClick={handleComplete}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete Setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Patient-specific info */}
      {step === 3 && role === "PATIENT" && (
        <Card>
          <CardHeader>
            <CardTitle>Health Profile</CardTitle>
            <CardDescription>This helps us personalize your exercise programs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="limitations">Limitations or Injuries</Label>
              <Textarea
                id="limitations"
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
                placeholder="e.g., Left knee surgery 3 months ago, limited range of motion"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comorbidities">Medical Conditions</Label>
              <Textarea
                id="comorbidities"
                value={comorbidities}
                onChange={(e) => setComorbidities(e.target.value)}
                placeholder="e.g., Osteoarthritis, diabetes"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="functional">Functional Challenges</Label>
              <Textarea
                id="functional"
                value={functionalChallenges}
                onChange={(e) => setFunctionalChallenges(e.target.value)}
                placeholder="e.g., Difficulty climbing stairs, trouble reaching overhead"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Available Equipment</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_EQUIPMENT.map((eq) => (
                  <Button
                    key={eq}
                    type="button"
                    variant={selectedEquipment.includes(eq) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleEquipment(eq)}
                  >
                    {eq}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fitness Goals</Label>
              <div className="flex flex-wrap gap-2">
                {FITNESS_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant={selectedGoals.includes(goal) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleGoal(goal)}
                  >
                    {goal}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={loading}
                onClick={handleComplete}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
