import { Event } from "../Event";
import { addAction, describeUser, World } from "../World";
import { decodeCall, getPastEvents } from "../Contract";
import { JToken, JTokenScenario } from "../Contract/JToken";
import { JErc20Delegate } from "../Contract/JErc20Delegate";
import { invoke, Sendable } from "../Invokation";
import {
  getAddressV,
  getEventV,
  getExpNumberV,
  getNumberV,
  getStringV,
  getBoolV,
} from "../CoreValue";
import { AddressV, BoolV, EventV, NothingV, NumberV, StringV } from "../Value";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { getJTokenDelegateData } from "../ContractLookup";
import { buildJTokenDelegate } from "../Builder/JTokenDelegateBuilder";
import { verify } from "../Verify";

async function genJTokenDelegate(
  world: World,
  from: string,
  event: Event
): Promise<World> {
  let {
    world: nextWorld,
    jTokenDelegate,
    delegateData,
  } = await buildJTokenDelegate(world, from, event);
  world = nextWorld;

  world = addAction(
    world,
    `Added jToken ${delegateData.name} (${delegateData.contract}) at address ${jTokenDelegate._address}`,
    delegateData.invokation
  );

  return world;
}

async function verifyJTokenDelegate(
  world: World,
  jTokenDelegate: JErc20Delegate,
  name: string,
  contract: string,
  apiKey: string
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(
      `Politely declining to verify on local network: ${world.network}.`
    );
  } else {
    await verify(world, apiKey, name, contract, jTokenDelegate._address);
  }

  return world;
}

export function jTokenDelegateCommands() {
  return [
    new Command<{ jTokenDelegateParams: EventV }>(
      `
        #### Deploy

        * "JTokenDelegate Deploy ...jTokenDelegateParams" - Generates a new JTokenDelegate
          * E.g. "JTokenDelegate Deploy CDaiDelegate cDAIDelegate"
      `,
      "Deploy",
      [new Arg("jTokenDelegateParams", getEventV, { variadic: true })],
      (world, from, { jTokenDelegateParams }) =>
        genJTokenDelegate(world, from, jTokenDelegateParams.val)
    ),
    new View<{ jTokenDelegateArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "JTokenDelegate <jTokenDelegate> Verify apiKey:<String>" - Verifies JTokenDelegate in Etherscan
          * E.g. "JTokenDelegate cDaiDelegate Verify "myApiKey"
      `,
      "Verify",
      [new Arg("jTokenDelegateArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { jTokenDelegateArg, apiKey }) => {
        let [jToken, name, data] = await getJTokenDelegateData(
          world,
          jTokenDelegateArg.val
        );

        return await verifyJTokenDelegate(
          world,
          jToken,
          name,
          data.get("contract")!,
          apiKey.val
        );
      },
      { namePos: 1 }
    ),
  ];
}

export async function processJTokenDelegateEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>(
    "JTokenDelegate",
    jTokenDelegateCommands(),
    world,
    event,
    from
  );
}
