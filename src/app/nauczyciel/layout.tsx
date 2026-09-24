import { requirePage } from "@/lib/auth";
import { getMyTeacherProfile } from "@/lib/services/teachers";
import { AppShell, type NavItem } from "@/components/app-shell";

const NAV: NavItem[] = [
  { href: "/nauczyciel", label: "Pulpit" },
  { href: "/nauczyciel/uczniowie", label: "Moi uczniowie" },
  { href: "/nauczyciel/grafik", label: "Grafik i dyspozycja" },
  { href: "/nauczyciel/kalendarz", label: "Kalendarz lekcji" },
  { href: "/nauczyciel/wyplaty", label: "Moje wypłaty" },
  { href: "#", label: "Notatki z lekcji", soon: true },
  { href: "#", label: "Baza wiedzy", soon: true },
  { href: "#", label: "Wiadomości", soon: true },
  { href: "/nauczyciel/ustawienia", label: "Ustawienia" },
];

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await requirePage("TEACHER");
  const profile = await getMyTeacherProfile(actor);

  return (
    <AppShell
      nav={NAV}
      roleLabel="Panel nauczyciela"
      userLabel={`${profile.fullName} · ${actor.email}`}
    >
      {children}
    </AppShell>
  );
}
