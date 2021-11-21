import { Event } from "../Event";
import { World } from "../World";
import { Joe } from "../Contract/Joe";
import { getAddressV, getNumberV } from "../CoreValue";
import { AddressV, ListV, NumberV, StringV, Value } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getJoe } from "../ContractLookup";

export function joeFetchers() {
  return [
    new Fetcher<{ joe: Joe }, AddressV>(
      `
        #### Address

        * "<Joe> Address" - Returns the address of Joe token
          * E.g. "Joe Address"
      `,
      "Address",
      [new Arg("joe", getJoe, { implicit: true })],
      async (world, { joe }) => new AddressV(joe._address)
    ),

    new Fetcher<{ joe: Joe }, StringV>(
      `
        #### Name

        * "<Joe> Name" - Returns the name of the Joe token
          * E.g. "Joe Name"
      `,
      "Name",
      [new Arg("joe", getJoe, { implicit: true })],
      async (world, { joe }) => new StringV(await joe.methods.name().call())
    ),

    new Fetcher<{ joe: Joe }, StringV>(
      `
        #### Symbol

        * "<Joe> Symbol" - Returns the symbol of the Joe token
          * E.g. "Joe Symbol"
      `,
      "Symbol",
      [new Arg("joe", getJoe, { implicit: true })],
      async (world, { joe }) => new StringV(await joe.methods.symbol().call())
    ),

    new Fetcher<{ joe: Joe }, NumberV>(
      `
        #### Decimals

        * "<Joe> Decimals" - Returns the number of decimals of the Joe token
          * E.g. "Joe Decimals"
      `,
      "Decimals",
      [new Arg("joe", getJoe, { implicit: true })],
      async (world, { joe }) => new NumberV(await joe.methods.decimals().call())
    ),

    new Fetcher<{ joe: Joe }, NumberV>(
      `
        #### TotalSupply

        * "Joe TotalSupply" - Returns Joe token's total supply
      `,
      "TotalSupply",
      [new Arg("joe", getJoe, { implicit: true })],
      async (world, { joe }) =>
        new NumberV(await joe.methods.totalSupply().call())
    ),

    new Fetcher<{ joe: Joe; address: AddressV }, NumberV>(
      `
        #### TokenBalance

        * "Joe TokenBalance <Address>" - Returns the Joe token balance of a given address
          * E.g. "Joe TokenBalance Geoff" - Returns Geoff's Joe balance
      `,
      "TokenBalance",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("address", getAddressV),
      ],
      async (world, { joe, address }) =>
        new NumberV(await joe.methods.balanceOf(address.val).call())
    ),

    new Fetcher<{ joe: Joe; owner: AddressV; spender: AddressV }, NumberV>(
      `
        #### Allowance

        * "Joe Allowance owner:<Address> spender:<Address>" - Returns the Joe allowance from owner to spender
          * E.g. "Joe Allowance Geoff Torrey" - Returns the Joe allowance of Geoff to Torrey
      `,
      "Allowance",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV),
      ],
      async (world, { joe, owner, spender }) =>
        new NumberV(await joe.methods.allowance(owner.val, spender.val).call())
    ),

    new Fetcher<{ joe: Joe; account: AddressV }, NumberV>(
      `
        #### GetCurrentVotes

        * "Joe GetCurrentVotes account:<Address>" - Returns the current Joe votes balance for an account
          * E.g. "Joe GetCurrentVotes Geoff" - Returns the current Joe vote balance of Geoff
      `,
      "GetCurrentVotes",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { joe, account }) =>
        new NumberV(await joe.methods.getCurrentVotes(account.val).call())
    ),

    new Fetcher<{ joe: Joe; account: AddressV; blockNumber: NumberV }, NumberV>(
      `
        #### GetPriorVotes

        * "Joe GetPriorVotes account:<Address> blockBumber:<Number>" - Returns the current Joe votes balance at given block
          * E.g. "Joe GetPriorVotes Geoff 5" - Returns the Joe vote balance for Geoff at block 5
      `,
      "GetPriorVotes",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("account", getAddressV),
        new Arg("blockNumber", getNumberV),
      ],
      async (world, { joe, account, blockNumber }) =>
        new NumberV(
          await joe.methods
            .getPriorVotes(account.val, blockNumber.encode())
            .call()
        )
    ),

    new Fetcher<{ joe: Joe; account: AddressV }, NumberV>(
      `
        #### GetCurrentVotesBlock

        * "Joe GetCurrentVotesBlock account:<Address>" - Returns the current Joe votes checkpoint block for an account
          * E.g. "Joe GetCurrentVotesBlock Geoff" - Returns the current Joe votes checkpoint block for Geoff
      `,
      "GetCurrentVotesBlock",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { joe, account }) => {
        const numCheckpoints = Number(
          await joe.methods.numCheckpoints(account.val).call()
        );
        const checkpoint = await joe.methods
          .checkpoints(account.val, numCheckpoints - 1)
          .call();

        return new NumberV(checkpoint.fromBlock);
      }
    ),

    new Fetcher<{ joe: Joe; account: AddressV }, NumberV>(
      `
        #### VotesLength

        * "Joe VotesLength account:<Address>" - Returns the Joe vote checkpoint array length
          * E.g. "Joe VotesLength Geoff" - Returns the Joe vote checkpoint array length of Geoff
      `,
      "VotesLength",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { joe, account }) =>
        new NumberV(await joe.methods.numCheckpoints(account.val).call())
    ),

    new Fetcher<{ joe: Joe; account: AddressV }, ListV>(
      `
        #### AllVotes

        * "Joe AllVotes account:<Address>" - Returns information about all votes an account has had
          * E.g. "Joe AllVotes Geoff" - Returns the Joe vote checkpoint array
      `,
      "AllVotes",
      [
        new Arg("joe", getJoe, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { joe, account }) => {
        const numCheckpoints = Number(
          await joe.methods.numCheckpoints(account.val).call()
        );
        const checkpoints = await Promise.all(
          new Array(numCheckpoints).fill(undefined).map(async (_, i) => {
            const { fromBlock, votes } = await joe.methods
              .checkpoints(account.val, i)
              .call();

            return new StringV(
              `Block ${fromBlock}: ${votes} vote${votes !== 1 ? "s" : ""}`
            );
          })
        );

        return new ListV(checkpoints);
      }
    ),
  ];
}

export async function getJoeValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Joe", joeFetchers(), world, event);
}
