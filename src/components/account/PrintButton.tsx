"use client";

import { Button } from "@/components/ui/Button";

/**
 * The browser's own print dialog, which offers "Save as PDF" on every
 * desktop platform. That is the whole reason there is no PDF library in
 * this project.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
