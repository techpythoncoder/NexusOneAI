"use client";

import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

export default function BillingPage() {
  const org = useAuthStore((s) => s.org);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <p className="text-2xl font-bold capitalize">{org?.plan ?? "free"}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Billing controls are reserved for owners and admins. Payment provider integration can attach here when the MVP is ready for paid plans.
          </p>
          <Button disabled>Manage billing</Button>
        </CardContent>
      </Card>
    </div>
  );
}
