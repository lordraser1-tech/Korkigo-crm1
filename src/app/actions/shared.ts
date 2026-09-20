import { revalidatePath } from "next/cache";

/** Dane widać w obu panelach, więc odświeżamy oba drzewa. */
export function revalidatePanels(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/nauczyciel", "layout");
}
