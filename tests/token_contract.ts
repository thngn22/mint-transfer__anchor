import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokenContract } from "../target/types/token_contract";

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import { assert } from "chai";
import privateKey from "../key.json";
import { describe } from "mocha";

describe("token_contract", () => {
  // Thiết lập provider và chương trình
  const provider = anchor.AnchorProvider.local("http://127.0.0.1:8899");
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenContract as Program<TokenContract>;

  let tokenAccount: web3.PublicKey;
  const payer = web3.Keypair.fromSecretKey(Uint8Array.from(privateKey));

  it("Mint v2", async () => {
    const mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      9
    );
    console.log("mint::>>", mint.toString());

    tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );
    console.log("tokenAccount::>>", tokenAccount.toString());

    const numberOfTokens = 1000;

    await program.methods
      .mintToken(new anchor.BN(numberOfTokens))
      .accounts({
        mint: mint,
        tokenAccount: tokenAccount,
        mintAuthority: payer.publicKey,
        payer: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    // Kiểm tra số dư của tài khoản
    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount
    );
    console.log("tokenAccountInfo::>>", tokenAccountInfo);

    assert.equal(
      tokenAccountInfo.value.uiAmount,
      numberOfTokens / 1e9,
      "Token balance mismatch"
    );
  });

  it("transferSplTokens", async () => {
    // Generate keypairs for the new accounts
    const toKp = new web3.Keypair();

    // Create a new mint and initialize it
    const mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      0
    );
    console.log("mint::>>", mint.toString());

    // Create associated token accounts for the new accounts
    const fromAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );
    console.log("fromAta::>>", fromAta.toString());

    const toAta = await createAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      toKp.publicKey
    );
    console.log("toAta::>>", toAta.toString());

    // Mint tokens to the 'from' associated token account
    const mintAmount = 1000;
    await mintTo(
      provider.connection,
      payer,
      mint,
      fromAta,
      payer.publicKey,
      mintAmount
    );

    // Send transaction
    const transferAmount = new anchor.BN(500);
    const tx = await program.methods
      .transferToken(transferAmount)
      .accounts({
        fromAuthority: payer.publicKey,
        fromAta: fromAta,
        toAta: toAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer, payer])
      .transaction();
    const txHash = await web3.sendAndConfirmTransaction(
      provider.connection,
      tx,
      [payer, payer]
    );
    console.log(`https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    const toTokenAccount = await provider.connection.getTokenAccountBalance(
      toAta
    );
    assert.strictEqual(
      toTokenAccount.value.uiAmount,
      transferAmount.toNumber(),
      "The 'to' token account should have the transferred tokens"
    );
  });
});
