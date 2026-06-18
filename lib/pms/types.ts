/**
 * PMS integration boundary. Experience-OS is PMS-agnostic: external systems map
 * INTO the internal model, which is the source of truth. Run 1 ships only the
 * MockPmsAdapter (no external API calls, no MEWS).
 */

export interface InternalGuest {
  externalId: string;
  fullName: string;
  email?: string;
  language?: string;
  country?: string;
}

export interface InternalStay {
  externalId: string;
  guestExternalId: string;
  unitName?: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  valueAmountCents?: number;
  currency?: string;
}

export interface PmsAdapter {
  readonly provider: string;
  pullReservations(): Promise<InternalStay[]>;
  pullGuests(): Promise<InternalGuest[]>;
  mapToInternalGuest(raw: unknown): InternalGuest;
  mapToInternalStay(raw: unknown): InternalStay;
}
