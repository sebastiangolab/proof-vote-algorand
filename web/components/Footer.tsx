import { cn } from "@/lib/utils";


export function Footer() {
  return (
    <footer className="border-t px-4 py-6">
      <p className="text-center text-sm text-zinc-500">
        By{" "}
        <a href="https://sebastiangolab.pl/" target="_blank" rel="noopener noreferrer">
          Sebastian Golab
        </a>{" "}
        &middot; {new Date().getFullYear()}
      </p>
    </footer>
  );
}
