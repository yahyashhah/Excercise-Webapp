"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createSellablePackageAction,
  getSellablePackageForProgramAction,
  getTrainerTemplatesForBundleAction,
  updateSellablePackageAction,
} from "@/actions/sellable-package-actions";

interface Props {
  programId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExistingPackage {
  id: string;
  slug: string;
  priceInCents: number;
  isActive: boolean;
  upsell: { programTemplateId: string | null; priceInCents: number } | null;
}

export function SellProgramDialog({ programId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<ExistingPackage | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [price, setPrice] = useState("");
  const [bundleTemplateId, setBundleTemplateId] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [pkgResult, templatesResult] = await Promise.all([
      getSellablePackageForProgramAction(programId),
      getTrainerTemplatesForBundleAction(programId),
    ]);
    if (templatesResult.success) {
      setTemplates(templatesResult.data.map((t) => ({ id: t.id as string, name: t.name as string })));
    }
    if (pkgResult.success && pkgResult.data) {
      const pkg = pkgResult.data;
      setExisting({
        id: pkg.id,
        slug: pkg.slug ?? "",
        priceInCents: pkg.priceInCents,
        isActive: pkg.isActive,
        upsell: pkg.upsell
          ? { programTemplateId: pkg.upsell.programTemplateId, priceInCents: pkg.upsell.priceInCents }
          : null,
      });
      setPrice((pkg.priceInCents / 100).toFixed(2));
      if (pkg.upsell) {
        setBundleTemplateId(pkg.upsell.programTemplateId ?? "");
        setBundlePrice((pkg.upsell.priceInCents / 100).toFixed(2));
      } else {
        setBundleTemplateId("");
        setBundlePrice("");
      }
    } else {
      setExisting(null);
      setPrice("");
      setBundleTemplateId("");
      setBundlePrice("");
    }
    setLoading(false);
  }, [programId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function parseDollars(value: string): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  async function handleSubmit() {
    const priceInCents = parseDollars(price);
    if (priceInCents === null) {
      toast.error("Enter a price greater than zero");
      return;
    }
    let bundle: { programTemplateId: string; priceInCents: number } | null | undefined;
    if (bundleTemplateId) {
      const bundlePriceInCents = parseDollars(bundlePrice);
      if (bundlePriceInCents === null) {
        toast.error("Enter a bundle price greater than zero");
        return;
      }
      bundle = { programTemplateId: bundleTemplateId, priceInCents: bundlePriceInCents };
    } else if (existing?.upsell) {
      bundle = null;
    }

    setSaving(true);
    try {
      const result = existing
        ? await updateSellablePackageAction({
            packageId: existing.id,
            programId,
            priceInCents,
            bundle,
          })
        : await createSellablePackageAction({ programId, priceInCents, bundle: bundle ?? undefined });

      if (result.success) {
        toast.success(existing ? "Sellable link updated" : "Sellable link created");
        router.refresh();
        await load();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(isActive: boolean) {
    if (!existing) return;
    setSaving(true);
    try {
      const result = await updateSellablePackageAction({
        packageId: existing.id,
        programId,
        isActive,
      });
      if (result.success) {
        toast.success(isActive ? "Now selling" : "Turned off");
        router.refresh();
        await load();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const publicUrl = existing ? `${process.env.NEXT_PUBLIC_APP_URL}/p/${existing.slug}` : "";

  function copyLink() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Manage sellable program" : "Sell this program"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4 py-4">
            {existing && (
              <div className="space-y-2">
                <Label>Public link</Label>
                <div className="flex gap-2">
                  <Input value={publicUrl} readOnly />
                  <Button type="button" variant="outline" onClick={copyLink}>
                    Copy
                  </Button>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={existing.isActive}
                    onCheckedChange={handleToggleActive}
                    disabled={saving}
                  />
                  <span className="text-sm">{existing.isActive ? "Active" : "Off"}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="79.99"
              />
            </div>
            <div className="space-y-2">
              <Label>Bundle upsell (optional)</Label>
              <Select
                value={bundleTemplateId || "none"}
                onValueChange={(v) => setBundleTemplateId(v === "none" ? "" : (v ?? ""))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No bundle">
                    {(value: string) =>
                      value === "none" || !value
                        ? "No bundle"
                        : (templates.find((t) => t.id === value)?.name ?? "No bundle")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No bundle</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Create another template first to offer a bundle.
                </p>
              )}
            </div>
            {bundleTemplateId && (
              <div className="space-y-2">
                <Label>Bundle price (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  placeholder="29.99"
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving ? "Saving…" : existing ? "Save changes" : "Create sellable link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
