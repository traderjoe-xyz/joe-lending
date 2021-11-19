import { Event } from "../Event";
import { World } from "../World";
import { JoetrollerImpl } from "../Contract/JoetrollerImpl";
import { AddressV, Value } from "../Value";
import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getJoetrollerImpl } from "../ContractLookup";

export async function getJoetrollerImplAddress(
  world: World,
  joetrollerImpl: JoetrollerImpl
): Promise<AddressV> {
  return new AddressV(joetrollerImpl._address);
}

export function joetrollerImplFetchers() {
  return [
    new Fetcher<{ joetrollerImpl: JoetrollerImpl }, AddressV>(
      `
        #### Address

        * "JoetrollerImpl Address" - Returns address of joetroller implementation
      `,
      "Address",
      [new Arg("joetrollerImpl", getJoetrollerImpl)],
      (world, { joetrollerImpl }) =>
        getJoetrollerImplAddress(world, joetrollerImpl),
      { namePos: 1 }
    ),
  ];
}

export async function getJoetrollerImplValue(
  world: World,
  event: Event
): Promise<Value> {
  return await getFetcherValue<any, any>(
    "JoetrollerImpl",
    joetrollerImplFetchers(),
    world,
    event
  );
}
