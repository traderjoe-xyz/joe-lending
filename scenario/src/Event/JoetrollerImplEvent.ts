import { Event } from "../Event";
import { addAction, World } from "../World";
import { JoetrollerImpl } from "../Contract/JoetrollerImpl";
import { Unitroller } from "../Contract/Unitroller";
import { invoke } from "../Invokation";
import {
  getAddressV,
  getArrayV,
  getEventV,
  getExpNumberV,
  getNumberV,
  getStringV,
} from "../CoreValue";
import { ArrayV, AddressV, EventV, NumberV, StringV } from "../Value";
import { Arg, Command, View, processCommandEvent } from "../Command";
import { buildJoetrollerImpl } from "../Builder/JoetrollerImplBuilder";
import { JoetrollerErrorReporter } from "../ErrorReporter";
import {
  getJoetrollerImpl,
  getJoetrollerImplData,
  getUnitroller,
} from "../ContractLookup";
import { verify } from "../Verify";
import { mergeContractABI } from "../Networks";

async function genJoetrollerImpl(
  world: World,
  from: string,
  params: Event
): Promise<World> {
  let {
    world: nextWorld,
    joetrollerImpl,
    joetrollerImplData,
  } = await buildJoetrollerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added Joetroller Implementation (${joetrollerImplData.description}) at address ${joetrollerImpl._address}`,
    joetrollerImplData.invokation
  );

  return world;
}

async function mergeABI(
  world: World,
  from: string,
  joetrollerImpl: JoetrollerImpl,
  unitroller: Unitroller
): Promise<World> {
  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(
      world,
      "Joetroller",
      unitroller,
      unitroller.name,
      joetrollerImpl.name
    );
  }

  return world;
}

async function become(
  world: World,
  from: string,
  joetrollerImpl: JoetrollerImpl,
  unitroller: Unitroller
): Promise<World> {
  let invokation = await invoke(
    world,
    joetrollerImpl.methods._become(unitroller._address),
    from,
    JoetrollerErrorReporter
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(
      world,
      "Joetroller",
      unitroller,
      unitroller.name,
      joetrollerImpl.name
    );
  }

  world = addAction(
    world,
    `Become ${unitroller._address}'s Joetroller Impl`,
    invokation
  );

  return world;
}

async function verifyJoetrollerImpl(
  world: World,
  joetrollerImpl: JoetrollerImpl,
  name: string,
  contract: string,
  apiKey: string
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(
      `Politely declining to verify on local network: ${world.network}.`
    );
  } else {
    await verify(world, apiKey, name, contract, joetrollerImpl._address);
  }

  return world;
}

export function joetrollerImplCommands() {
  return [
    new Command<{ joetrollerImplParams: EventV }>(
      `
        #### Deploy

        * "JoetrollerImpl Deploy ...joetrollerImplParams" - Generates a new Joetroller Implementation
          * E.g. "JoetrollerImpl Deploy MyScen Scenario"
      `,
      "Deploy",
      [new Arg("joetrollerImplParams", getEventV, { variadic: true })],
      (world, from, { joetrollerImplParams }) =>
        genJoetrollerImpl(world, from, joetrollerImplParams.val)
    ),
    new View<{ joetrollerImplArg: StringV; apiKey: StringV }>(
      `
        #### Verify

        * "JoetrollerImpl <Impl> Verify apiKey:<String>" - Verifies Joetroller Implemetation in Etherscan
          * E.g. "JoetrollerImpl Verify "myApiKey"
      `,
      "Verify",
      [new Arg("joetrollerImplArg", getStringV), new Arg("apiKey", getStringV)],
      async (world, { joetrollerImplArg, apiKey }) => {
        let [joetrollerImpl, name, data] = await getJoetrollerImplData(
          world,
          joetrollerImplArg.val
        );

        return await verifyJoetrollerImpl(
          world,
          joetrollerImpl,
          name,
          data.get("contract")!,
          apiKey.val
        );
      },
      { namePos: 1 }
    ),

    new Command<{
      unitroller: Unitroller;
      joetrollerImpl: JoetrollerImpl;
    }>(
      `
        #### Become

        * "JoetrollerImpl <Impl> Become <Rate> <JoeMarkets> <OtherMarkets>" - Become the joetroller, if possible.
          * E.g. "JoetrollerImpl MyImpl Become 0.1e18 [cDAI, cETH, cUSDC]
      `,
      "Become",
      [
        new Arg("unitroller", getUnitroller, { implicit: true }),
        new Arg("joetrollerImpl", getJoetrollerImpl),
      ],
      (world, from, { unitroller, joetrollerImpl }) => {
        return become(world, from, joetrollerImpl, unitroller);
      },
      { namePos: 1 }
    ),

    new Command<{
      unitroller: Unitroller;
      joetrollerImpl: JoetrollerImpl;
    }>(
      `
        #### MergeABI

        * "JoetrollerImpl <Impl> MergeABI" - Merges the ABI, as if it was a become.
          * E.g. "JoetrollerImpl MyImpl MergeABI
      `,
      "MergeABI",
      [
        new Arg("unitroller", getUnitroller, { implicit: true }),
        new Arg("joetrollerImpl", getJoetrollerImpl),
      ],
      (world, from, { unitroller, joetrollerImpl }) =>
        mergeABI(world, from, joetrollerImpl, unitroller),
      { namePos: 1 }
    ),
  ];
}

export async function processJoetrollerImplEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>(
    "JoetrollerImpl",
    joetrollerImplCommands(),
    world,
    event,
    from
  );
}
