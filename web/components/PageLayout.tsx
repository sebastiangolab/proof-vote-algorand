import { SiteHeader, SiteHeaderProps } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  header?: SiteHeaderProps;
  mainClassName?: string;
};

export function PageLayout({ children, header = {}, mainClassName }: Props) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <SiteHeader {...header} />

      <main className={cn("mx-auto max-w-2xl px-4 py-10", mainClassName)}>{children}</main>
    </div>
  );
}
