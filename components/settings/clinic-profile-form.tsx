"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveClinicProfileAction } from "@/actions/clinic-actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/lib/uploadthing";
import Image from "next/image";

interface ClinicProfileFormProps {
  initialData?: {
    clinicName: string;
    tagline: string;
    logoUrl: string;
    phone: string;
    email: string;
    website: string;
    address: string;
  };
}

export function ClinicProfileForm({ initialData }: ClinicProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialData?.logoUrl ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const result = await saveClinicProfileAction({
      clinicName: formData.get("clinicName") as string,
      tagline: (formData.get("tagline") as string) || undefined,
      logoUrl: logoUrl || undefined,
      phone: (formData.get("phone") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      website: (formData.get("website") as string) || undefined,
      address: (formData.get("address") as string) || undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Clinic profile saved");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Clinic Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="clinicName">Clinic Name *</Label>
            <Input
              id="clinicName"
              name="clinicName"
              required
              defaultValue={initialData?.clinicName ?? ""}
              placeholder="e.g., Summit Physical Therapy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={initialData?.tagline ?? ""}
              placeholder="e.g., Evidence-based rehabilitation"
            />
          </div>

          <div className="space-y-2">
            <Label>Clinic Logo</Label>
            {logoUrl && (
              <div className="mb-2">
                <Image
                  src={logoUrl}
                  alt="Clinic logo"
                  width={80}
                  height={80}
                  className="rounded-md border"
                />
              </div>
            )}
            <UploadButton<OurFileRouter, "clinicLogo">
              endpoint="clinicLogo"
              onClientUploadComplete={(res) => {
                if (res?.[0]?.ufsUrl) {
                  setLogoUrl(res[0].ufsUrl);
                  toast.success("Logo uploaded");
                }
              }}
              onUploadError={(error: Error) => {
                toast.error(`Upload failed: ${error.message}`);
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={initialData?.phone ?? ""}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={initialData?.email ?? ""}
                placeholder="clinic@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={initialData?.website ?? ""}
              placeholder="https://www.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={initialData?.address ?? ""}
              placeholder="123 Main St, Suite 100, City, State ZIP"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
