"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <PrinterIcon /> 인쇄
    </Button>
  );
}
