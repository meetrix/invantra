import { daysBetween, todayIso } from "../../shared/date";
import type { Document } from "../../shared/types";

export type StatusTone = "gray" | "amber" | "blue" | "green" | "orange" | "red";

export interface DisplayStatus {
  label: string;
  /** The same status without the day count, short enough for the corner ribbon. */
  short: string;
  tone: StatusTone;
}

const plural = (days: number) => `${days} day${days === 1 ? "" : "s"}`;
const plain = (label: string, tone: StatusTone): DisplayStatus => ({ label, short: label, tone });

/**
 * The status shown in lists, headers and the corner ribbon. An approved
 * invoice stays "Approved" until a payment is recorded; part-paid it reads
 * "Due in 8 days"; once its due date passes with a balance left it reads
 * "Overdue by 40 days", paid in part or not.
 */
export function displayStatus(document: Document, today = todayIso()): DisplayStatus {
  switch (document.status) {
    case "draft":
      return plain("Draft", "gray");
    case "pending_approval":
      return plain("Pending approval", "amber");
    case "rejected":
      return plain("Rejected", "red");
    case "invoiced":
      return plain("Invoiced", "green");
    case "paid":
      return plain("Paid", "green");
    case "void":
      return plain("Void", "red");
    case "approved": {
      if (document.kind === "estimate") return plain("Approved", "blue");
      const days = document.dueDate ? daysBetween(today, document.dueDate) : null;
      if (days !== null && days < 0) return { label: `Overdue by ${plural(-days)}`, short: "Overdue", tone: "orange" };
      if (document.payments.length === 0) return plain("Approved", "blue");
      if (days === null) return plain("Partially paid", "amber");
      return { label: days === 0 ? "Due today" : `Due in ${plural(days)}`, short: "Payment due", tone: "amber" };
    }
  }
}

/** Anything not yet approved prints with a watermark saying so. */
export function isAwaitingApproval(document: Document): boolean {
  return document.status === "draft" || document.status === "pending_approval" || document.status === "rejected";
}

/** A draft or a rejected document can be edited and (re)submitted for approval. */
export function isEditable(document: Document): boolean {
  return document.status === "draft" || document.status === "rejected";
}

export function paidAmount(document: Document): number {
  return document.payments.reduce((sum, p) => sum + p.amount, 0);
}
