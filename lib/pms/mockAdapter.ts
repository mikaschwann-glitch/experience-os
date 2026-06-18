import type {
  InternalGuest,
  InternalStay,
  PmsAdapter,
} from "@/lib/pms/types";

/**
 * MockPmsAdapter — the only adapter in Run 1. Returns static in-memory data and
 * makes no external calls. It demonstrates the integration shape so a real
 * adapter (e.g. MewsAdapter) can be added later without touching the core model.
 */
const RAW_GUESTS = [
  {
    id: "mock-guest-maria-tom",
    name: "Maria & Tom",
    email: "maria.tom@example.com",
    lang: "en",
    country: "PT",
  },
  {
    id: "mock-guest-lunds",
    name: "The Lunds",
    email: "lunds@example.com",
    lang: "sv",
    country: "SE",
  },
];

const RAW_RESERVATIONS = [
  {
    id: "mock-res-001",
    guestId: "mock-guest-maria-tom",
    unit: "Ocean Cabin 02",
    from: "2027-04-18",
    to: "2027-04-22",
    cents: 168000,
    currency: "EUR",
  },
  {
    id: "mock-res-002",
    guestId: "mock-guest-lunds",
    unit: "Villa Basalt 03",
    from: "2027-04-15",
    to: "2027-04-24",
    cents: 305000,
    currency: "EUR",
  },
];

export class MockPmsAdapter implements PmsAdapter {
  readonly provider = "mock_pms";

  async pullGuests(): Promise<InternalGuest[]> {
    return RAW_GUESTS.map((g) => this.mapToInternalGuest(g));
  }

  async pullReservations(): Promise<InternalStay[]> {
    return RAW_RESERVATIONS.map((r) => this.mapToInternalStay(r));
  }

  mapToInternalGuest(raw: unknown): InternalGuest {
    const g = raw as (typeof RAW_GUESTS)[number];
    return {
      externalId: g.id,
      fullName: g.name,
      email: g.email,
      language: g.lang,
      country: g.country,
    };
  }

  mapToInternalStay(raw: unknown): InternalStay {
    const r = raw as (typeof RAW_RESERVATIONS)[number];
    return {
      externalId: r.id,
      guestExternalId: r.guestId,
      unitName: r.unit,
      startDate: r.from,
      endDate: r.to,
      valueAmountCents: r.cents,
      currency: r.currency,
    };
  }
}
