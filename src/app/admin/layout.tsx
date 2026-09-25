import { requirePage } from "@/lib/auth";
import { AppShell, type NavItem } from "@/components/app-shell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Pulpit" },
  { href: "/admin/uczniowie", label: "Uczniowie" },
  { href: "/admin/nauczyciele", label: "Nauczyciele" },
  { href: "/admin/przedmioty", label: "Przedmioty" },
  { href: "/admin/grafik", label: "Grafik i dyspozycja" },
  { href: "/admin/lekcje", label: "Kalendarz lekcji" },
  { href: "/admin/rozliczenia", label: "Rozliczenia" },
  { href: "/admin/rachunki", label: "Rachunki" },
  { href: "/admin/platnosci", label: "Płatności" },
  { href: "/admin/wiadomosci", label: "Wiadomości" },
  { href: "/admin/ustawienia", label: "Ustawienia" },
  { href: "/admin/ndg", label: "Limit NDG" },
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
