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

export function categoryIcon(key: string | undefined): LucideIcon {
  return (key && CATEGORY_ICONS[key]) || Ellipsis;
}
