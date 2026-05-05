"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, ScopeType } from "@txnlab/use-wallet-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildCreateVoteAtc } from "@/lib/contract-client";
import { getAlgodClient, fetchAppConfig, MICRO_ALGO, VOTE_BOX_MBR, CREATE_VOTE_TX_FEE, type AppConfig } from "@/lib/algorand";
import { buildCreationMessage } from "@/lib/signatures";
import slugify from "slugify";
import SectionLabel from "./FormSectionLabel";
import FieldError from "./FormFieldError";
import { toUnixSec } from "@/helpers/formHelpers";

const formSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(100, "Max 100 characters"),
    description: z.string().max(2000).optional(),
    options: z
      .array(z.object({ value: z.string() }))
      .transform((opts) => opts.filter((o) => o.value.trim()))
      .pipe(
        z
          .array(z.object({ value: z.string().min(1) }))
          .min(2, "At least 2 options are required")
          .max(8),
      ),
    endAt: z.string().min(1, "End time is required"),
  })
  .refine((v) => new Date(v.endAt) > new Date(), {
    message: "End time must be in the future",
    path: ["endAt"],
  });

type FormValues = z.input<typeof formSchema>;

export function CreateVoteForm() {
  const router = useRouter();
  const { activeAddress, transactionSigner, signData } = useWallet();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // On localnet, tests can advance the chain timestamp far ahead of wall clock via
  // setBlockOffsetTimestamp. We read the chain's current timestamp so we can use it
  // as the floor for endAt (preventing "endAt must be in the future" assertion failures).
  const [chainTimestamp, setChainTimestamp] = useState<bigint | null>(null);

  const isLocalNet = process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "localnet";

  useEffect(() => {
    if (!isLocalNet) return;

    const algod = getAlgodClient();
    algod.status().do().then((s) => algod.block(s.lastRound).do()).then((b) => {
      setChainTimestamp(b.block.header.timestamp as bigint);
    }).catch(() => {});
  }, [isLocalNet]);

  // Use the later of wall clock and chain timestamp as the minimum for endAt.
  const nowFloor = chainTimestamp
    ? new Date(Math.max(Date.now(), Number(chainTimestamp) * 1000))
    : new Date();

  const nowMin = new Date(Math.ceil(nowFloor.getTime() / 60000) * 60000)
    .toISOString()
    .slice(0, 16);

  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    fetchAppConfig()
      .then(setAppConfig)
      .catch((err) => { 
        console.error(err); 
        setSubmitError("Coś poszło nie tak, spróbuj jeszcze raz.");
      });
  }, []);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      options: [{ value: "" }, { value: "" }],
      endAt: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  const slug = slugify(watch("title"), { lower: true, strict: true, trim: true }).slice(0, 80);

  async function onSubmit(values: FormValues) {
    if (!activeAddress || !transactionSigner) {
      setSubmitError("Connect a wallet first.");
      return;
    }
    
    if (!slug) {
      setSubmitError("Title must contain at least one alphanumeric character.");
      return;
    }

    setSubmitError(null);

    try {
      const appId = process.env.NEXT_PUBLIC_APP_ID ?? "";

      const nonEmptyOptions = values.options.map((option) => option.value.trim()).filter(Boolean);
      const endAt = toUnixSec(values.endAt);

      // On localnet the chain timestamp can be far ahead of wall clock (after test runs
      // that use setBlockOffsetTimestamp). Guard here so we surface a clear error instead
      // of a raw opcode assertion failure from the contract.
      const isLocalnet = process.env.NEXT_PUBLIC_ALGORAND_NETWORK === "localnet";
      if (isLocalnet && chainTimestamp !== null && endAt <= chainTimestamp) {
        setSubmitError(
          "End time is before the localnet chain time (tests may have advanced it). " +
          "Pick a later date or reset the localnet."
        );
        return;
      }

      // Create the vote on Algorand and get the resulting voteId
      const atc = await buildCreateVoteAtc({
        sender: activeAddress,
        endAt,
        optionCount: BigInt(nonEmptyOptions.length),
        stake: appConfig!.defaultStake,
        signer: transactionSigner,
      });

      const algod = getAlgodClient();
      const result = await atc.execute(algod, 4);

      const voteId = String(result.methodResults[0].returnValue as bigint);

      // Sign the creation message to prove ownership of the creator wallet
      let signatureBase64: string = "localnet";

      // On non-local networks, we require a signature to verify the creator's wallet ownership.
      if (!isLocalNet) {
        const message = buildCreationMessage(appId, voteId, slug);
        const msgBase64 = Buffer.from(new TextEncoder().encode(message)).toString("base64");
        const signResult = await signData(msgBase64, { scope: ScopeType.AUTH, encoding: "base64" });
        signatureBase64 = Buffer.from(signResult.signature).toString("base64");
      }

      // Send the vote details and signature to our backend for verification and storage
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          voteId,
          slug,
          title: values.title,
          description: values.description || undefined,
          optionLabels: nonEmptyOptions,
          creatorWallet: activeAddress,
          endAt: String(endAt),
          signature: signatureBase64,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      router.push(`/votes/${slug}`);
    } catch (err) {
      console.error(err);
      setSubmitError("Coś poszło nie tak, spróbuj jeszcze raz.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Create a new vote</h1>

          <p className="mt-1 text-sm text-zinc-600">
            Fill in the details below to launch a new poll on Algorand.
          </p>
        </div>

        {/* ── Title + description ─────────────────────────────────────── */}
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>

            <Input
              id="title"
              {...register("title")}
              placeholder="What should we vote on?"
            />

            {slug && (
              <p className="text-xs text-zinc-500">
                URL: <span className="font-mono text-zinc-700">/votes/{slug}</span>
              </p>
            )}

            <FieldError message={errors.title?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </Label>

            <Textarea
              id="description"
              {...register("description")}
              placeholder="Provide some context for voters…"
              rows={3}
            />
          </div>
        </div>

        {/* ── Options ────────────────────────────────────────────────────── */}
        <div className="p-6 space-y-3">
          <SectionLabel>Options</SectionLabel>

          {fields.map((field, i) => (
            <div key={field.id} className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                {i + 1}
              </span>

              <Input
                {...register(`options.${i}.value`)}
                placeholder={`Option ${i + 1}`}
                className="flex-1"
              />

              {fields.length > 2 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {fields.length < 8 && (
            <button
              type="button"
              onClick={() => append({ value: "" })}
              className="mt-1 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
            >
              + Add option
            </button>
          )}

          <FieldError message={errors.options?.root?.message ?? errors.options?.message} />
        </div>

        {/* ── Schedule ───────────────────────────────────────────────────── */}
        <div className="p-6 space-y-4">
          <SectionLabel>Schedule</SectionLabel>

          <div className="space-y-1.5">
            <Label htmlFor="endAt">End</Label>

            <Input id="endAt" type="datetime-local" min={nowMin} {...register("endAt")} />

            <FieldError message={errors.endAt?.message} />
          </div>
        </div>

        {/* ── Platform settings (read-only) ───────────────────────────────── */}
        <div className="p-6 space-y-3">
          <SectionLabel>Platform settings</SectionLabel>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-xs text-zinc-500">Required stake per voter</p>

              <p className="mt-0.5 text-sm font-semibold text-zinc-800">
                {appConfig ? `${Number(appConfig.defaultStake) / MICRO_ALGO} ALGO` : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-xs text-zinc-500">Withdraw window</p>

              <p className="mt-0.5 text-sm font-semibold text-zinc-800">
                {appConfig ? (() => { const h = Number(appConfig.defaultWithdrawWindow) / 3600; return `${h % 24 === 0 ? `${h / 24} days` : `${h} h`} after vote ends`; })() : "—"}
              </p>
            </div>
          </div>

        </div>

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <div className="p-6 space-y-3">
          {(!mounted || !activeAddress) && (
            <p className="text-sm text-zinc-500">Connect a wallet to create a vote.</p>
          )}

          {submitError && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {submitError}
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Creation cost: <span className="font-semibold">{Number(VOTE_BOX_MBR + CREATE_VOTE_TX_FEE) / MICRO_ALGO} ALGO</span>
          </div>

          <button
            type="submit"
            disabled={!mounted || !activeAddress || isSubmitting || !appConfig}
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Creating…" : "Create Vote →"}
          </button>
        </div>
      </div>
    </form>
  );
}
