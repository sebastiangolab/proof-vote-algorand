import { PageLayout } from "@/components/PageLayout";
import { MyStakesPanel } from "@/components/my-stakes/MyStakesPanel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Refunds — ProofVote",
};

export default function MyStakesPage() {
  return (
    <PageLayout
      header={{ backHref: "/votes", backLabel: "← All Votes" }}
    >
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">My Refunds</h1>

        <p className="mt-1 text-zinc-600">Withdraw your refunds from ended votes.</p>
      </div>

      <MyStakesPanel />
    </PageLayout>
  );
}
