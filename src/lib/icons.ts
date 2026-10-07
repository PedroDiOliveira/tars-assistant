import {
  Banknote,
  Car,
  CirclePlus,
  Clapperboard,
  Ellipsis,
  GraduationCap,
  HeartPulse,
  House,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** Ícones das categorias financeiras, indexados pela chave guardada em `Category.icon`. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  home: House,
  heart: HeartPulse,
  fun: Clapperboard,
  bag: ShoppingBag,
  school: GraduationCap,
  dots: Ellipsis,
  wage: Banknote,
  plus: CirclePlus,
};

/** Nome em português de cada ícone (para o seletor e para leitores de tela). */
export const CATEGORY_ICON_LABELS: Record<string, string> = {
  utensils: "Comida",
  car: "Transporte",
  home: "Casa",
  heart: "Saúde",
  fun: "Lazer",
  bag: "Compras",
  school: "Estudo",
  dots: "Outros",
  wage: "Salário",
  plus: "Entrada",
};

export function categoryIcon(key: string | undefined): LucideIcon {
  return (key && CATEGORY_ICONS[key]) || Ellipsis;
}
