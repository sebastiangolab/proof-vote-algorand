import { PageLayout } from "@/components/PageLayout";
import { CreateVoteForm } from "@/components/create-poll/CreateVoteForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Vote — ProofVote",
};

export default function CreatePage() {
  return (
    <PageLayout
      header={{ backHref: "/votes", backLabel: "← All Votes" }}
    >
      <CreateVoteForm />
    </PageLayout>
  );
}
