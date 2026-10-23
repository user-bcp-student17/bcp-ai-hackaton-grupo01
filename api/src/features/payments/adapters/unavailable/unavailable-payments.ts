import { PaymentError } from "../../application/ports.js";
import type { PaymentPort } from "../../application/ports.js";

// Fail-closed default until the SQLite adapter is wired: never reports a payment as committed.
export class UnavailablePayments implements PaymentPort {
  transfer(): never {
    throw new PaymentError("STORAGE_UNAVAILABLE");
  }
  findByKey(): never {
    throw new PaymentError("STORAGE_UNAVAILABLE");
  }
  findForParticipant(): never {
    throw new PaymentError("STORAGE_UNAVAILABLE");
  }
}
