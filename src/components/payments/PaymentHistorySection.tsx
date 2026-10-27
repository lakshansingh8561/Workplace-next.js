"use client";

import { useEffect, useState } from "react";
import { getContractPaymentHistoryAction, PaymentRecordDTO } from "@/lib/actions/payment";
import { formatDate } from "@/lib/utils";

interface PaymentHistorySectionProps {
  contractId: string;
  refreshTrigger?: number;
}

export function PaymentHistorySection({
  contractId,
  refreshTrigger = 0,
}: PaymentHistorySectionProps) {
  const [payments, setPayments] = useState<PaymentRecordDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function fetchPayments() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getContractPaymentHistoryAction(contractId);
        if (!ignore) {
          if (!res.success) {
            setError(res.error || "Failed to load payment history.");
          } else {
            setPayments(res.payments || []);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error fetching payment history:", err);
          setError("An error occurred while loading payment transactions.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchPayments();
    return () => {
      ignore = true;
    };
  }, [contractId, refreshTrigger]);

  return (
    <div className="mt-10 rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
              Payment & Settlement History
            </h3>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
              Razorpay Gateway
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Immutable transaction records and cryptographic signature audit trail for this contract.
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            setIsLoading(true);
            const res = await getContractPaymentHistoryAction(contractId);
            if (res.success) setPayments(res.payments || []);
            setIsLoading(false);
          }}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
        >
          🔄 {isLoading ? "Refreshing..." : "Refresh Payments"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-3.5 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠️ {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-xs text-zinc-500 animate-pulse">
          Loading verified transactions...
        </div>
      ) : payments.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-3xl mb-2">🧾</div>
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            No payments recorded for this contract yet.
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Transactions will appear here once approved milestones or timesheets are paid via Razorpay.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-zinc-400 uppercase tracking-wider text-[10px] dark:border-zinc-800">
                <th className="pb-3 font-bold">Transaction / Date</th>
                <th className="pb-3 font-bold">Item Type</th>
                <th className="pb-3 font-bold">Amount</th>
                <th className="pb-3 font-bold">Status</th>
                <th className="pb-3 font-bold">Order ID</th>
                <th className="pb-3 font-bold">Payment ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-3.5">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {p.id.slice(-8)}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {formatDate(p.createdAt)}
                    </div>
                  </td>
                  <td className="py-3.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 text-[11px] font-semibold">
                      {p.itemType === "MILESTONE" ? "🎯 Milestone" : "⏱️ Hourly Timesheet"}
                    </span>
                    {p.milestoneTitle && (
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {p.milestoneTitle}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5">
                    <span className="font-bold text-zinc-950 dark:text-white">
                      {p.currency} {p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        p.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                          : p.status === "PENDING"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400"
                      }`}
                    >
                      {p.status === "SUCCESS"
                        ? "✓ Paid"
                        : p.status === "PENDING"
                        ? "⏳ Pending"
                        : "✕ Failed"}
                    </span>
                  </td>
                  <td className="py-3.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {p.razorpayOrderId}
                  </td>
                  <td className="py-3.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {p.razorpayPaymentId || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Auditable Gateway Disclosure */}
      <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-zinc-400">
        <div>
          <span>Gateways: </span>
          <strong className="text-zinc-600 dark:text-zinc-300">Razorpay Orders & Checkout</strong>
          <span> • Direct merchant collection</span>
        </div>
        <div>
          <span>Disbursements: </span>
          <span className="italic">
            Payment transactions settle into the merchant balance. Escrow release or automated split payout requires separate Razorpay Route/X configuration.
          </span>
        </div>
      </div>
    </div>
  );
}
