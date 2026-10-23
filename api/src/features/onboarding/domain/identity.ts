export type DocumentIdentity = {
  documentType: "DNI" | "CE";
  documentNumber: string;
};
export type KycStatus = "activa" | "pendiente" | "rechazada";
export type User = DocumentIdentity & {
  id: string;
  phone: string;
  email: string;
  walletId: string | null;
  kycStatus: KycStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Wallet = { id: string; currency: "PEN"; balanceCents: number };

export class UserAlreadyExists extends Error {
  readonly code = "USER_ALREADY_EXISTS";
  constructor() {
    super("La cuenta ya existe.");
  }
}
