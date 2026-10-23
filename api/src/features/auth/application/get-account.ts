import type { User, Wallet } from "../../onboarding/domain/identity.js";
import type { UserLookup } from "./ports.js";

type Dependencies = { users: UserLookup };

// Inactive users never see a wallet, even if one was stored for them.
export function getAccount(
  deps: Dependencies,
): (owner: User) => { user: User; wallet: Wallet | null } {
  return (owner) => ({
    user: owner,
    wallet: owner.active ? deps.users.findWalletByUserId(owner.id) : null,
  });
}
