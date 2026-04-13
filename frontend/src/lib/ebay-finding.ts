const FINDING_API_URL = "https://svcs.ebay.com/services/search/FindingService/v1";

export interface SoldListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  date: string; // YYYY-MM-DD
  condition: string;
  url: string;
}

function buildSearchQuery(cameraName: string): string {
  let name = cameraName;
  for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  return `${name} camera body`;
}

export async function searchSoldItems(cameraName: string): Promise<SoldListing[]> {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    throw new Error("EBAY_APP_ID is required");
  }

  const query = buildSearchQuery(cameraName);

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "",
    "keywords": query,
    "categoryId": "625",
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "itemFilter(1).name": "ListingType",
    "itemFilter(1).value": "FixedPrice,AuctionWithBIN,Auction",
    "sortOrder": "EndTimeSoonest",
    "paginationInput.entriesPerPage": "50",
  });

  const res = await fetch(`${FINDING_API_URL}?${params}`);

  if (!res.ok) {
    console.error(`Finding API HTTP ${res.status} for "${cameraName}"`);
    return [];
  }

  const data = await res.json();

  // Rate limiting returns 200 with an error body
  if (data.errorMessage) {
    const msg = data.errorMessage[0]?.error?.[0]?.message?.[0] ?? "Unknown error";
    console.error(`Finding API error for "${cameraName}": ${msg}`);
    return [];
  }

  const response = data.findCompletedItemsResponse?.[0];
  if (!response || response.ack?.[0] !== "Success") {
    return [];
  }

  const items = response.searchResult?.[0]?.item ?? [];

  return items.map((item: Record<string, unknown[]>) => {
    const sellingStatus = (item.sellingStatus as Record<string, unknown[]>[])?.[0];
    const currentPrice = (sellingStatus?.currentPrice as Record<string, string>[])?.[0];
    const listingInfo = (item.listingInfo as Record<string, string[]>[])?.[0];
    const condition = (item.condition as Record<string, string[]>[])?.[0];

    const endTime = listingInfo?.endTime?.[0] ?? "";
    const dateStr = endTime ? endTime.slice(0, 10) : new Date().toISOString().slice(0, 10);

    return {
      itemId: (item.itemId as string[])?.[0] ?? "",
      title: (item.title as string[])?.[0] ?? "",
      price: parseFloat(currentPrice?.__value__ ?? "0"),
      currency: currentPrice?.["@currencyId"] ?? "USD",
      date: dateStr,
      condition: condition?.conditionDisplayName?.[0] ?? "",
      url: (item.viewItemURL as string[])?.[0] ?? "",
    };
  }).filter((listing: SoldListing) => listing.itemId && listing.price > 0);
}
