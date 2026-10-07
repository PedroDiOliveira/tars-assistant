import type { MetadataRoute } from "next";

/** App pessoal e privado: nenhum buscador deve indexar nada. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
