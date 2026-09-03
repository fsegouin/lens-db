import { apiJson, apiOptions, API_VERSION, LICENCE } from "@/lib/public-api";

export const revalidate = 86400;

export function OPTIONS() {
  return apiOptions();
}

/** What this API is, discoverable from its own root. */
export function GET() {
  return apiJson(
    {
      name: "The Lens DB read API",
      version: API_VERSION,
      documentation: "https://thelensdb.com/developers",
      licence: LICENCE.facts,
      note: LICENCE.excluded,
      endpoints: {
        "GET /api/v1/lenses": "Every lens, paged with limit and after",
        "GET /api/v1/lenses/{id}": "One lens by its id, which is its slug",
        "GET /api/v1/cameras": "Every camera body, paged with limit and after",
        "GET /api/v1/cameras/{id}": "One camera by its id",
        "GET /api/v1/mounts": "Every mount, with its flange focal distance",
        "GET /api/v1/adapt?from={mount}&to={mount}":
          "Whether a lens mount adapts onto a body mount, and the arithmetic behind it",
      },
    },
    { maxAge: 86400 },
  );
}
