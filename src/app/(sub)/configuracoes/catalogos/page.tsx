import type { Metadata } from "next";
import { CatalogScreen } from "@/components/catalog/catalog-screen";

export const metadata: Metadata = { title: "Categorias, exercícios e matérias" };

export default function CatalogosPage() {
  return <CatalogScreen />;
}
