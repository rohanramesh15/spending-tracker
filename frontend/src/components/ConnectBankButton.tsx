// Moved into PlaidLink.tsx, which owns a single Plaid Link instance for the whole page
// (connect + update mode + OAuth resume). Re-exported here so existing imports keep working.
export { ConnectBankButton } from "@/components/PlaidLink";
