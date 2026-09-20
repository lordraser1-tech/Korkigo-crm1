import { requirePage } from "@/lib/auth";
import { AppShell, type NavItem } from "@/components/app-shell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Pulpit" },
  { href: "/admin/uczniowie", label: "Uczniowie" },
  { href: "/admin/nauczyciele", label: "Nauczyciele" },
  { href: "/admin/lekcje", label: "Kalendarz lekcji" },
  { href: "/admin/rozliczenia", label: "Rozliczenia" },
  { href: "#", label: "Płatności i rachunki", soon: true },
  { href: "#", label: "Limit NDG", soon: true },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requirePage("ADMIN");

  return (
    <AppShell
      nav={NAV}
      roleLabel="Panel administratora"
      userLabel={actor.email}
    >
      {children}
    </AppShell>
  );
}
