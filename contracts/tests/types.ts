import algosdk from "algosdk";

export type TestAccount = algosdk.Account & { signer: algosdk.TransactionSigner };