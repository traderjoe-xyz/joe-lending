import { Event } from "../Event";
import { World } from "../World";
import { JErc20Delegate } from "../Contract/JErc20Delegate";
import { getCoreValue, mapValue } from "../CoreValue";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { AddressV, Value } from "../Value";
import {
  getWorldContractByAddress,
  getJTokenDelegateAddress,
} from "../ContractLookup";

export async function getJTokenDelegateV(
  world: World,
  event: Event
): Promise<JErc20Delegate> {
  const address = await mapValue<AddressV>(
    world,
    event,
    (str) => new AddressV(getJTokenDelegateAddress(world, str)),
    getCoreValue,
    AddressV
  );

  return getWorldContractByAddress<JErc20Delegate>(world, address.val);
}

async function jTokenDelegateAddress(
  world: World,
  jTokenDelegate: JErc20Delegate
): Promise<AddressV> {
  return new AddressV(jTokenDelegate._address);
}

export function jTokenDelegateFetchers() {
  return [
    new Fetcher<{ jTokenDelegate: JErc20Delegate }, AddressV>(
      `
        #### Address

        * "JTokenDelegate <JTokenDelegate> Address" - Returns address of JTokenDelegate contract
          * E.g. "JTokenDelegate cDaiDelegate Address" - Returns cDaiDelegate's address
      `,
      "Address",
      [new Arg("jTokenDelegate", getJTokenDelegateV)],
      (world, { jTokenDelegate }) =>
        jTokenDelegateAddress(world, jTokenDelegate),
      { namePos: 1 }
    ),
  ];
}

export async function getJTokenDelegateValue(
  world: World,
  event: Event
): Promise<Value> {
  return await getFetcherValue<any, any>(
    "JTokenDelegate",
    jTokenDelegateFetchers(),
    world,
    event
  );
}
